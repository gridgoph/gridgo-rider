import { useUser } from "@clerk/expo";
import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import { BlockingOverlay } from "@/components/BlockingOverlay";
import { FieldShell } from "@/components/FieldShell";
import { FormScroll } from "@/components/FormScroll";
import { InlineNotice } from "@/components/InlineNotice";
import { PasswordField } from "@/components/PasswordField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import {
  changeSignInPassword,
  EMPTY_PASSWORD_DRAFT,
  MIN_PASSWORD_LENGTH,
  passwordProblems,
  PASSWORD_CHANGED,
  PASSWORD_NO_PASSWORD_SET,
  PASSWORD_WRONG_CURRENT,
  type PasswordDraft,
  type PasswordField as PasswordFieldName,
} from "@/lib/clerkIdentity";

/**
 * Setting a new password on the GRIDGO sign-in.
 *
 * Clerk's own user resource does this — `user.updatePassword` — so the rider
 * stays signed in throughout. Recover password on the sign-in screen is still
 * there for the case this screen cannot help with.
 *
 * Its own screen, not a row of fields on **Your details**, for the same reason
 * the client app's is: three boxes and a consequence is a commitment, and it
 * needs the one yellow action on the screen to be the commitment itself.
 *
 * Every other session is signed out, and the screen says so before the tap
 * rather than after it.
 */
export default function ChangePasswordScreen() {
  const { user: clerkUser, isLoaded } = useUser();

  const [draft, setDraft] = useState<PasswordDraft>(EMPTY_PASSWORD_DRAFT);
  const [busy, setBusy] = useState(false);
  const [showProblems, setShowProblems] = useState(false);
  const [refusal, setRefusal] = useState<{ field: PasswordFieldName; message: string } | null>(
    null,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const problems = passwordProblems(draft);

  /**
   * Clerk's refusal always shows. New-password and confirm also show their
   * needed rules as soon as those boxes have been typed — the filter, not a
   * silent reject on submit. Current password stays quiet until a change is
   * tried, so an empty box is not already shouting.
   */
  function fieldError(field: PasswordFieldName): string | null {
    if (refusal?.field === field) return refusal.message;
    if (field === "next" && draft.next.length > 0) return problems.next ?? null;
    if (field === "confirm" && draft.confirm.length > 0) return problems.confirm ?? null;
    return showProblems ? (problems[field] ?? null) : null;
  }

  function edit(patch: Partial<PasswordDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setRefusal(null);
    setNotice(null);
  }

  async function submit() {
    if (!clerkUser || busy) return;

    if (Object.keys(problems).length) {
      setShowProblems(true);
      return;
    }

    setBusy(true);
    setRefusal(null);
    setNotice(null);
    const outcome = await changeSignInPassword(clerkUser, draft);
    setBusy(false);

    if (outcome.status === "ok") {
      setDraft(EMPTY_PASSWORD_DRAFT);
      setShowProblems(false);
      setDone(true);
      return;
    }

    if (outcome.status === "wrong_current") {
      setRefusal({ field: "current", message: PASSWORD_WRONG_CURRENT });
      return;
    }
    if (outcome.status === "invalid_new") {
      setRefusal({ field: "next", message: outcome.message });
      return;
    }
    setNotice(outcome.message);
  }

  if (isLoaded && !clerkUser) {
    return (
      <Screen edges={["bottom"]}>
        <FormScroll contentClassName="gg-page gap-6 pb-16 pt-4">
          <InlineNotice
            tone="error"
            icon="circle-x"
            title="Sign-in unavailable"
            body="GRIDGO could not reach the account behind this rider. Go back, then open your details again."
            actionLabel="Go back"
            onAction={() => router.back()}
          />
        </FormScroll>
      </Screen>
    );
  }

  if (isLoaded && clerkUser && clerkUser.passwordEnabled === false) {
    return (
      <Screen edges={["bottom"]}>
        <FormScroll contentClassName="gg-page gap-8 pb-16 pt-4">
          <View className="gap-3">
            <Text className="text-h2 text-text-primary" accessibilityRole="header">
              This account has no password
            </Text>
            <Text className="text-body text-text-secondary">{PASSWORD_NO_PASSWORD_SET}</Text>
          </View>
          <SecondaryButton label="Back to your details" onPress={() => router.back()} />
        </FormScroll>
      </Screen>
    );
  }

  if (done) {
    return (
      <Screen edges={["bottom"]}>
        <FormScroll contentClassName="gg-page gap-8 pb-16 pt-4">
          <View className="gap-3">
            <Text className="text-h2 text-text-primary" accessibilityRole="header">
              Password changed
            </Text>
            <Text className="text-body text-text-secondary">{PASSWORD_CHANGED}</Text>
          </View>
          <SecondaryButton label="Back to your details" onPress={() => router.back()} />
        </FormScroll>
      </Screen>
    );
  }

  return (
    <Screen edges={["bottom"]}>
      <FormScroll contentClassName="gg-page gap-8 pb-16 pt-4">
        <View className="gap-2">
          <Text className="text-h2 text-text-primary" accessibilityRole="header">
            Change your password
          </Text>
          <Text className="text-body text-text-secondary">
            This is the password you sign in to GRIDGO with. If you have forgotten it, sign
            out and use “Recover password” on the sign-in screen instead.
          </Text>
        </View>

        <View className="gap-6">
          <FieldShell
            label="Current password"
            hint="The one you sign in with now."
            error={fieldError("current")}
          >
            <PasswordField
              value={draft.current}
              onChangeText={(current) => edit({ current })}
              accessibilityLabel="Current password"
              placeholder="Your current password"
              textContentType="password"
              autoComplete="password"
              autoCapitalize="none"
              autoCorrect={false}
              testID="current-password-visibility"
              visibilityLabel="current password"
            />
          </FieldShell>

          <FieldShell
            label="New password"
            hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
            error={fieldError("next")}
          >
            <PasswordField
              value={draft.next}
              onChangeText={(next) => edit({ next })}
              accessibilityLabel="New password"
              placeholder="Your new password"
              textContentType="newPassword"
              autoComplete="new-password"
              autoCapitalize="none"
              autoCorrect={false}
              testID="new-password-visibility"
              visibilityLabel="new password"
            />
          </FieldShell>

          <FieldShell
            label="Confirm new password"
            hint="Type it again so a typo cannot lock you out."
            error={fieldError("confirm")}
          >
            <PasswordField
              value={draft.confirm}
              onChangeText={(confirm) => edit({ confirm })}
              accessibilityLabel="Confirm new password"
              placeholder="Your new password again"
              textContentType="newPassword"
              autoComplete="new-password"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={() => void submit()}
              testID="confirm-password-visibility"
              visibilityLabel="confirm new password"
            />
          </FieldShell>
        </View>

        {notice ? (
          <InlineNotice tone="error" icon="circle-x" title="Not changed" body={notice} />
        ) : null}

        <View className="gap-4">
          <Text className="text-caption text-text-muted">
            Changing your password signs you out everywhere else you are signed in. This
            phone stays signed in.
          </Text>
          <PrimaryButton
            label={busy ? "Changing…" : "Change password"}
            disabled={busy}
            onPress={() => void submit()}
          />
        </View>
      </FormScroll>

      <BlockingOverlay visible={busy} label="Changing your password…" />
    </Screen>
  );
}
