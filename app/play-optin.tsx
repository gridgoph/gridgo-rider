import { useFocusEffect, router } from "expo-router";
import { Rocket } from "lucide-react-native";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AppState, Text, View } from "react-native";

import { CheckboxRow } from "@/components/CheckboxRow";
import { EmptyState } from "@/components/EmptyState";
import { FieldShell } from "@/components/FieldShell";
import { FormScroll } from "@/components/FormScroll";
import { InlineNotice } from "@/components/InlineNotice";
import { PlayOptInTrack } from "@/components/PlayOptInTrack";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonButton, SkeletonCircle, SkeletonText } from "@/components/Skeleton";
import { StickyActionBar } from "@/components/StickyActionBar";
import { TextField } from "@/components/TextField";
import { useThemeColors } from "@/hooks/useTheme";
import { checkGmail, currentOptInStep, optInSteps, prefilledGmail } from "@/lib/playOptIn";
import { playOptInInstall, usePlayOptIn } from "@/store/playOptIn";
import { useSession } from "@/store/session";

/**
 * Become a Google Play tester (gridgo-api `docs/PLAY_OPTIN_API.md`), opened
 * from the card on Active, the `play_optin` push or its Alerts row.
 *
 * Confirm the Gmail used on Play, join the tester group when GRIDGO cannot add
 * it, open Play's testing page to tap "Become a tester", then install GRIDGO
 * from Play — the APK cannot count. One yellow action, for the step the rider
 * is on. Every step is GRIDGO's answer, read again on return from Google;
 * opening a link is never called joined or opted in.
 */
export default function PlayOptInScreen() {
  const userId = useSession((s) => s.user?.id ?? null);
  const owner = usePlayOptIn((s) => s.owner);
  const state = usePlayOptIn((s) => (owner === userId ? s.state : null));
  // A failed read offers Try again; a retry in flight goes back to the skeleton.
  const readFailed = usePlayOptIn((s) => owner === userId && s.readFailed && !s.reading);
  const progress = usePlayOptIn((s) => s.progress);
  const android = playOptInInstall().platform === "android";

  const [typed, setTyped] = useState<string | null>(null);
  const [googleAccount, setGoogleAccount] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [barHeight, setBarHeight] = useState(0);

  const read = useCallback(async () => {
    await usePlayOptIn.getState().load(useSession.getState().user?.id ?? null);
    // A push or Alerts entry counts as the tap, before any Gmail input.
    if (usePlayOptIn.getState().state?.show) usePlayOptIn.getState().tapped();
  }, []);

  useFocusEffect(
    useCallback(() => {
      void read();
    }, [read]),
  );

  // Back from Google Groups or Play: read where that left the rider.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") void usePlayOptIn.getState().load(useSession.getState().user?.id ?? null);
    });
    return () => subscription.remove();
  }, []);

  const goToActive = () => router.replace("/(tabs)/active");

  if (!android) {
    return (
      <Shell>
        <EmptyState icon="tester" title="Android only" body="Play testing runs on Android phones." />
      </Shell>
    );
  }
  if (!state && readFailed) {
    return (
      <Shell>
        <EmptyState
          icon="tester"
          title="Your steps did not load"
          body="Check your connection, then try again."
          actionLabel="Try again"
          onAction={() => void read()}
        />
      </Shell>
    );
  }
  if (!state) return <OptInSkeleton />;
  if (state.optedIn || state.step === "opted_in") {
    return (
      <Shell>
        <EmptyState
          icon="tester"
          title="You're a tester"
          body="Thank you. Your daily check-in is on Active."
          actionLabel="Go to Active"
          onAction={goToActive}
          secondaryAction
        />
      </Shell>
    );
  }
  if (!state.show) {
    return (
      <Shell>
        <EmptyState
          icon="tester"
          title="Not open right now"
          body="We'll ask again when testing opens."
          actionLabel="Go to Active"
          onAction={goToActive}
          secondaryAction
        />
      </Shell>
    );
  }

  const email = typed ?? prefilledGmail(state);
  const confirmed = state.step !== "confirm_gmail" && !editing;
  const view = confirmed ? state : { ...state, step: "confirm_gmail" as const };
  const step = currentOptInStep(view, progress);
  const steps = optInSteps(view, progress);
  const check = checkGmail(email, googleAccount);
  // Asked only for an address that is not a Gmail: Play admits Google accounts.
  const asserted = checkGmail(email, false);
  const askAccount = !asserted.ok && asserted.needsGoogleAccount;
  const confirmedGmail = state.gmailSuggestion ?? email.trim();

  async function run(action: () => Promise<string | null>) {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    const error = await action();
    setActionError(error);
    setBusy(false);
  }

  async function confirm() {
    if (!check.ok) {
      setShowErrors(true);
      return;
    }
    await run(async () => {
      const error = await usePlayOptIn.getState().confirmGmail(email, check.googleAccount);
      if (!error) {
        setEditing(false);
        setTyped(null);
      }
      return error;
    });
  }

  const store = usePlayOptIn.getState();
  const action =
    step === "gmail"
      ? { label: busy ? "Confirming…" : "Confirm", onPress: () => void confirm() }
      : step === "group"
        ? { label: "Join group", onPress: () => void run(store.openGroup) }
        : step === "optin"
          ? { label: "Become a tester", onPress: () => void run(store.openOptIn) }
          : { label: "Install from Play", onPress: () => void store.openPlayStore() };

  // Each link step's way back, for a page closed too early.
  const again =
    step === "optin" && state.groupMode === "link"
      ? { label: "Open the group again", onPress: () => void run(store.openGroup) }
      : step === "install"
        ? { label: "Open the tester page again", onPress: () => void run(store.openOptIn) }
        : null;

  const hint =
    step === "group"
      ? `Join with ${confirmedGmail}.`
      : step === "optin"
        ? `Sign in as ${confirmedGmail}, then tap Become a tester.`
        : step === "install"
          ? "Then open GRIDGO from Play. Only the Play version counts."
          : null;

  const fieldError = showErrors && !check.ok ? check.error : null;

  return (
    <Screen edges={[]}>
      <FormScroll contentClassName="gg-page gap-6 pb-8 pt-4" stickyActionHeight={barHeight}>
        <Hero />
        <PlayOptInTrack
          steps={steps}
          details={confirmed ? { gmail: confirmedGmail, group: "Opened", optin: "Opened" } : {}}
          backTo={
            confirmed
              ? {
                  key: "gmail",
                  label: "Change",
                  onPress: () => {
                    setActionError(null);
                    setShowErrors(false);
                    setEditing(true);
                  },
                }
              : undefined
          }
        />

        {step === "gmail" ? (
          <View className="gap-3">
            <FieldShell label="Gmail on Google Play" error={fieldError}>
              <TextField
                value={email}
                onChange={(value) => {
                  setTyped(value);
                  setActionError(null);
                }}
                placeholder="you@gmail.com"
                accessibilityLabel="Gmail on Google Play"
                kind="email"
                returnKeyType="done"
                onSubmit={() => void confirm()}
                editable={!busy}
              />
            </FieldShell>
            {askAccount ? (
              <CheckboxRow
                checked={googleAccount}
                onChange={setGoogleAccount}
                label="This is my Google account"
                hint={showErrors && !check.ok ? "Play admits Google accounts only." : undefined}
                disabled={busy}
              />
            ) : null}
          </View>
        ) : null}

        {hint ? <Text className="text-body text-text-secondary">{hint}</Text> : null}

        {actionError ? <InlineNotice tone="error" icon="circle-x" title={actionError} /> : null}
      </FormScroll>
      <StickyActionBar onHeight={setBarHeight}>
        {again ? <SecondaryButton label={again.label} disabled={busy} onPress={again.onPress} /> : null}
        <PrimaryButton label={action.label} disabled={busy} onPress={action.onPress} />
      </StickyActionBar>
    </Screen>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <Screen edges={["bottom"]}>
      <FormScroll contentClassName="gg-page flex-grow justify-center pb-8 pt-4">{children}</FormScroll>
    </Screen>
  );
}

function Hero() {
  const colors = useThemeColors();
  return (
    <View className="flex-row items-center gap-3" accessible accessibilityRole="header">
      <View className="h-14 w-14 items-center justify-center rounded-pill bg-accent">
        <Rocket size={26} color={colors.accentOn} strokeWidth={2} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-h3 text-text-primary">Help us launch on Play</Text>
        <Text className="text-caption text-text-secondary">Become a tester</Text>
      </View>
    </View>
  );
}

/** Holds the steps' layout while GRIDGO answers. */
function OptInSkeleton() {
  return (
    <Screen edges={["bottom"]}>
      <View className="gg-page flex-1 gap-6 pt-4" testID="optin-loading" accessibilityLabel="Loading the tester steps">
        <View className="flex-row items-center gap-3">
          <SkeletonCircle size={56} />
          <View className="flex-1 gap-2">
            <SkeletonText width="80%" height={20} />
            <SkeletonText width="40%" />
          </View>
        </View>
        {[0, 1, 2, 3].map((row) => (
          <View key={row} className="flex-row items-center gap-3">
            <SkeletonCircle size={32} />
            <SkeletonText width="60%" />
          </View>
        ))}
        <View className="flex-1" />
        <SkeletonButton />
      </View>
    </Screen>
  );
}
