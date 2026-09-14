import { useReadVersion } from "@/hooks/useReadVersion";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useUser } from "@clerk/expo";
import { ChevronRight } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";

import { BlockingOverlay } from "@/components/BlockingOverlay";
import { ChoiceList } from "@/components/ChoiceList";
import { FieldShell } from "@/components/FieldShell";
import { FormScroll } from "@/components/FormScroll";
import { InlineNotice } from "@/components/InlineNotice";
import { PrimaryButton } from "@/components/PrimaryButton";
import { RiderPortrait } from "@/components/RiderPortrait";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonBlock, SkeletonText } from "@/components/Skeleton";
import { TextField } from "@/components/TextField";
import { useThemeColors } from "@/hooks/useTheme";
import type { RiderSelfProfile } from "@/lib/api";
import { clerkDisplayName } from "@/lib/clerkAuth";
import { changeRiderPortrait, changeRiderSignInName } from "@/lib/clerkIdentity";
import {
  draftFromProfile,
  hasRiderDetailChanges,
  loadRiderDetails,
  RIDER_DETAILS_NOT_OPEN_YET,
  RIDER_DETAILS_STALE,
  riderDetailPatch,
  riderDetailProblems,
  saveRiderDetails,
  type RiderDetailDraft,
  type RiderDetailField,
  type RiderDetailProblems,
} from "@/lib/riderProfile";
import { VEHICLE_TYPES, type VehicleType } from "@/lib/signup";
import { useSession } from "@/store/session";

/**
 * The rider's own details, corrected by the rider.
 *
 * Reached by tapping the identity card on Account, because that card is where a
 * wrong name is noticed. It opens on the picture rather than on a field: the
 * portrait is the one thing here a client or shop sees, and everything under
 * it is how the rider is described in words.
 *
 * Two owners meet on this screen and the layout says which is which. GRIDGO
 * holds the phone, vehicle, plate and licence, and those are fields with one
 * Save. The picture belongs to the account, so it is not a keystroke — it
 * opens the camera roll. Email is the GRIDGO sign-in and is not typed here.
 * Password is Clerk's too: a tappable card that opens its own screen, because
 * three boxes and a consequence is a commitment.
 *
 * Nothing is drawn to press until something has actually changed, and a save
 * carries the version the details were read at.
 */
export default function RiderDetailsScreen() {
  const refreshUser = useSession((s) => s.refreshUser);
  const sessionUser = useSession((s) => s.user);
  const { user: clerkUser } = useUser();
  const colors = useThemeColors();
  const clerkName = clerkDisplayName(clerkUser);
  const [portraitBusy, setPortraitBusy] = useState(false);
  const [portraitError, setPortraitError] = useState<string | null>(null);

  const [details, setDetails] = useState<{
    profile: RiderSelfProfile;
    draft: RiderDetailDraft;
  } | null>(null);
  const profile = details?.profile ?? null;
  const draft = details?.draft ?? null;
  const nextRead = useReadVersion();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showProblems, setShowProblems] = useState(false);
  const [refusals, setRefusals] = useState<RiderDetailProblems>({});
  const [loadProblem, setLoadProblem] = useState<{
    kind: "not_open_yet" | "failed";
    message: string;
  } | null>(null);
  const [saveNotice, setSaveNotice] = useState<{
    message: string;
    reloadable: boolean;
  } | null>(null);

  const load = useCallback(async (adoptDraft: boolean) => {
    const current = nextRead();
    setLoading(true);
    const outcome = await loadRiderDetails();
    if (!current()) return;
    setLoading(false);

    if (outcome.status === "ok") {
      setDetails((current) =>
        adoptDraft || !current
          ? { profile: outcome.value, draft: draftFromProfile(outcome.value, clerkName) }
          : current,
      );
      setLoadProblem(null);
      if (adoptDraft) {
        setSaveNotice(null);
        setRefusals({});
        setShowProblems(false);
      }
      return;
    }

    setLoadProblem(
      outcome.status === "not_open_yet"
        ? { kind: "not_open_yet", message: RIDER_DETAILS_NOT_OPEN_YET }
        : {
            kind: "failed",
            message: outcome.status === "failed" ? outcome.message : RIDER_DETAILS_STALE,
          },
    );
  }, [clerkName, nextRead]);

  useLiveRefresh(["identity"], () => load(false));

  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load]),
  );

  const problems = draft ? riderDetailProblems(draft) : {};
  const changed = profile && draft ? hasRiderDetailChanges(profile, draft) : false;

  function fieldError(field: RiderDetailField): string | null {
    return refusals[field] ?? (showProblems ? (problems[field] ?? null) : null);
  }

  function edit(patch: Partial<RiderDetailDraft>) {
    nextRead();
    setLoading(false);
    setDetails((current) => current ? { ...current, draft: { ...current.draft, ...patch } } : current);
    setRefusals({});
  }

  async function save() {
    if (!profile || !draft) return;

    if (Object.keys(riderDetailProblems(draft)).length) {
      setShowProblems(true);
      return;
    }

    const patch = riderDetailPatch(profile, draft);
    if (!Object.keys(patch).length) return;

    nextRead();
    setSaving(true);
    setSaveNotice(null);
    setRefusals({});

    if (patch.name && clerkUser) {
      const nameOutcome = await changeRiderSignInName(clerkUser, patch.name);
      if (nameOutcome.status === "failed") {
        setSaving(false);
        setRefusals({ name: nameOutcome.message });
        return;
      }
    }

    const outcome = await saveRiderDetails(profile.version, patch);
    setSaving(false);

    if (outcome.status === "ok") {
      nextRead();
      setLoading(false);
      setDetails({ profile: outcome.value, draft: draftFromProfile(outcome.value, clerkName) });
      await refreshUser();
      router.back();
      return;
    }

    if (outcome.status === "stale") {
      setSaveNotice({ message: RIDER_DETAILS_STALE, reloadable: true });
      return;
    }

    if (outcome.status === "not_open_yet") {
      setSaveNotice({ message: RIDER_DETAILS_NOT_OPEN_YET, reloadable: false });
      return;
    }

    if (outcome.field) {
      setRefusals({ [outcome.field]: outcome.message });
      return;
    }

    setSaveNotice({ message: outcome.message, reloadable: false });
  }

  async function changePortrait() {
    if (!clerkUser) return;
    setPortraitBusy(true);
    setPortraitError(null);
    const outcome = await changeRiderPortrait(clerkUser);
    setPortraitBusy(false);
    if (outcome.status === "failed") setPortraitError(outcome.message);
  }

  const displayName = draft?.name || profile?.name || sessionUser?.name || "You";

  return (
    <Screen edges={["bottom"]}>
      <FormScroll contentClassName="gg-page pb-16 pt-4">
        <View className="items-center gap-3">
          <RiderPortrait imageUrl={clerkUser?.imageUrl} name={displayName} size={96} />
          <View className="w-44">
            <SecondaryButton
              label={
                portraitBusy
                  ? "Saving…"
                  : clerkUser?.hasImage
                    ? "Change photo"
                    : "Add a photo"
              }
              disabled={portraitBusy || !clerkUser}
              onPress={() => void changePortrait()}
            />
          </View>
          <Text className="text-center text-caption text-text-muted">
            Your face, so a shop and a client can recognise you at the door.
          </Text>
        </View>

        {portraitError ? (
          <View className="mt-4">
            <InlineNotice tone="error" icon="circle-x" title="Photo not saved" body={portraitError} />
          </View>
        ) : null}

        <View className="mt-8 gap-2">
          <Text className="text-h2 text-text-primary">Name and vehicle</Text>
          <Text className="text-body text-text-secondary">
            How GRIDGO and Operations reach you, and the vehicle on this account.
          </Text>
        </View>

        {loading && !draft ? (
          <View className="mt-8 gap-6" accessibilityRole="progressbar" accessibilityLabel="Loading your details">
            {[0, 1, 2, 3].map((row) => (
              <View key={row} className="gap-2">
                <SkeletonText width="30%" height={14} />
                <SkeletonBlock height={48} />
              </View>
            ))}
          </View>
        ) : null}

        {loadProblem && !draft ? (
          <View className="mt-8">
            <InlineNotice
              tone="warning"
              icon="triangle-alert"
              title={
                loadProblem.kind === "not_open_yet"
                  ? "Your details are not open yet"
                  : "Your details are not reachable"
              }
              body={loadProblem.message}
              actionLabel={loadProblem.kind === "not_open_yet" ? "Check again" : "Try again"}
              onAction={() => void load(true)}
            />
          </View>
        ) : null}

        {loadProblem && draft ? (
          <View className="mt-8">
            <InlineNotice
              tone="error"
              icon="circle-x"
              title="Could not refresh"
              body={loadProblem.message}
              actionLabel="Try again"
              onAction={() => void load(true)}
            />
          </View>
        ) : null}

        {profile && draft ? (
          <>
            <View className="mt-8 gap-6">
              <FieldShell
                label="Name"
                hint="The name Operations and shops see on your jobs."
                error={fieldError("name")}
              >
                <TextField
                  value={draft.name}
                  onChange={(name) => edit({ name })}
                  kind="name"
                  placeholder="Carlo Dela Cruz"
                  accessibilityLabel="Name"
                  editable={!saving}
                />
              </FieldShell>

              <FieldShell
                label="Mobile number"
                hint="GRIDGO and Operations call this number."
                error={fieldError("phone")}
              >
                <TextField
                  value={draft.phone}
                  onChange={(phone) => edit({ phone })}
                  kind="phone"
                  placeholder="0917 123 4567"
                  accessibilityLabel="Mobile number"
                  editable={!saving}
                />
              </FieldShell>

              <ChoiceList
                label="Vehicle"
                choices={VEHICLE_TYPES}
                value={(draft.vehicleType as VehicleType | null) ?? null}
                onChange={(vehicleType: VehicleType) => edit({ vehicleType })}
                disabled={saving}
              />
              {fieldError("vehicleType") ? (
                <Text className="text-caption text-error">{fieldError("vehicleType")}</Text>
              ) : null}

              <FieldShell
                label="Plate number"
                hint="The plate on the vehicle you ride for GRIDGO."
                error={fieldError("plateNumber")}
              >
                <TextField
                  value={draft.plateNumber}
                  onChange={(plateNumber) => edit({ plateNumber })}
                  kind="text"
                  placeholder="ABC 1234"
                  accessibilityLabel="Plate number"
                  editable={!saving}
                />
              </FieldShell>

              <FieldShell
                label="Licence number"
                hint="The number on your driving licence."
                error={fieldError("licenseNumber")}
              >
                <TextField
                  value={draft.licenseNumber}
                  onChange={(licenseNumber) => edit({ licenseNumber })}
                  kind="text"
                  placeholder="N01-23-456789"
                  accessibilityLabel="Licence number"
                  editable={!saving}
                />
              </FieldShell>

              <View className="gap-2">
                <Text className="text-caption text-text-muted">Email</Text>
                <View className="gg-touch rounded-field border border-outline bg-surface px-3 py-3">
                  <Text className="text-body text-text-primary" numberOfLines={1}>
                    {profile.email}
                  </Text>
                </View>
                <Text className="text-caption text-text-muted">
                  This is what you sign in with. It is not changed from this screen.
                </Text>
              </View>

              <SignInPasswordRow
                chevronColor={colors.textMuted}
                onPress={() => router.push("/change-password")}
              />
            </View>

            {saveNotice ? (
              <View className="mt-6">
                <InlineNotice
                  tone="error"
                  icon="circle-x"
                  title="Not saved"
                  body={saveNotice.message}
                  actionLabel={saveNotice.reloadable ? "Load the latest" : undefined}
                  onAction={saveNotice.reloadable ? () => void load(true) : undefined}
                />
              </View>
            ) : null}

            <View className="mt-8">
              {changed ? (
                <PrimaryButton
                  label={saving ? "Saving…" : "Save changes"}
                  disabled={saving}
                  onPress={() => void save()}
                />
              ) : (
                <Text className="text-caption text-text-muted">
                  These are the details GRIDGO has for you. Change one to save it.
                </Text>
              )}
            </View>
          </>
        ) : !loading ? (
          <View className="mt-8">
            <SignInPasswordRow
              chevronColor={colors.textMuted}
              onPress={() => router.push("/change-password")}
            />
          </View>
        ) : null}
      </FormScroll>

      <BlockingOverlay visible={saving} label="Saving your details…" />
    </Screen>
  );
}

/**
 * The sign-in password, as a card that leads somewhere.
 *
 * Same visual language as the email field above it — label, dark rounded
 * card, helper — with the in-card "Change password >" the shop-details email
 * uses. Not a field: typing here would promise that a keystroke changes it.
 */
function SignInPasswordRow({
  chevronColor,
  onPress,
}: {
  chevronColor: string;
  onPress: () => void;
}) {
  return (
    <View className="gap-2">
      <Text className="text-caption text-text-muted">Password</Text>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Password, hidden"
        accessibilityHint="Set a new password for your GRIDGO sign-in"
        className="gg-touch rounded-field border border-outline bg-surface px-3 py-3"
        style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
      >
        <Text className="text-body text-text-primary">••••••••</Text>
        <View className="mt-1 flex-row items-center">
          <Text className="flex-1 text-body text-text-secondary">Change password</Text>
          <ChevronRight
            size={20}
            color={chevronColor}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </View>
      </Pressable>
      <Text className="text-caption text-text-muted">
        This is the password you sign in with. Changing it signs you out everywhere
        else you are signed in.
      </Text>
    </View>
  );
}
