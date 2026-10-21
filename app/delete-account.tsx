import { useSession as useClerkSession, useUser } from "@clerk/expo";
import { router } from "expo-router";
import { useEffect } from "react";
import { Platform, Pressable, Text, View } from "react-native";

import { BlockingOverlay } from "@/components/BlockingOverlay";
import { CodeField } from "@/components/CodeField";
import { DangerButton } from "@/components/DangerButton";
import { FieldShell } from "@/components/FieldShell";
import { FormScroll } from "@/components/FormScroll";
import { InlineNotice } from "@/components/InlineNotice";
import { PasswordField } from "@/components/PasswordField";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusChip } from "@/components/StatusChip";
import { deletionConfirmMethod } from "@/lib/accountDeletion";
import {
  APPLE_CANCELLED,
  APPLE_NOTICE,
  APPLE_REVOKED,
  appleRetryLabel,
  appleRevocationApplies,
} from "@/lib/appleRevocation";
import { legalDate, RETENTION_NOTE } from "@/lib/legal";
import { useAccountDeletion } from "@/store/accountDeletion";

const BUSY_LABEL = {
  checking: "Checking it is you…",
  sending: "Sending your request…",
  emailing: "Emailing your code…",
  apple: "Waiting for Apple…",
  revoking: "Disconnecting Sign in with Apple…",
} as const;

/**
 * Delete account: what it means, then proof that it is the account holder.
 *
 * Reached from Your data and from Danger zone on Your details. Nothing leaves
 * the phone until Clerk has re-checked the person on this session — the
 * password for an account that has one, an emailed code for a Google-only
 * account — and only then is a `deletion` request sent to the privacy queue
 * (`POST /me/privacy-requests`). See `lib/accountDeletion.ts`, shared with the
 * client and supplier apps.
 *
 * On an iPhone whose sign-in includes Apple, the sent request is followed by
 * Apple asking the rider to sign in once more, so GRIDGO can disconnect Sign
 * in with Apple from this app (`lib/appleRevocation.ts`). The request stands
 * whatever Apple says, and only a confirmed disconnect is called one.
 *
 * No yellow on this screen: the one action is a deletion, and it is drawn in
 * the error token like every other action that cannot be taken back.
 */
export default function DeleteAccountScreen() {
  const { user: clerkUser, isLoaded } = useUser();
  const { session } = useClerkSession();
  const method = deletionConfirmMethod(clerkUser);
  const appleLinked = appleRevocationApplies(clerkUser, Platform.OS);
  const appleOwner = appleLinked ? (clerkUser?.id ?? null) : null;

  const secret = useAccountDeletion((s) => s.secret);
  const codeSent = useAccountDeletion((s) => s.codeSent);
  const destination = useAccountDeletion((s) => s.destination);
  const busy = useAccountDeletion((s) => s.busy);
  const fieldError = useAccountDeletion((s) => s.fieldError);
  const error = useAccountDeletion((s) => s.error);
  const confirmed = useAccountDeletion((s) => s.confirmedAt != null);
  const sent = useAccountDeletion((s) => s.sent);
  const request = useAccountDeletion((s) => s.request);
  const setSecret = useAccountDeletion((s) => s.setSecret);
  const emailCode = useAccountDeletion((s) => s.emailCode);
  const submit = useAccountDeletion((s) => s.submit);
  const apple = useAccountDeletion((s) => s.apple);
  const appleError = useAccountDeletion((s) => s.appleError);
  const appleRetry = useAccountDeletion((s) => s.appleRetry);
  const revokeApple = useAccountDeletion((s) => s.revokeApple);
  const appleSessionEnded = useAccountDeletion((s) => s.appleSessionEnded);
  const endSession = useAccountDeletion((s) => s.endSession);

  // Leaving drops what was typed, so the next visit starts a fresh flow.
  useEffect(() => () => useAccountDeletion.getState().reset(), []);

  const email = clerkUser?.primaryEmailAddress?.emailAddress ?? "";

  if (isLoaded && !clerkUser) {
    return (
      <Screen edges={["bottom"]}>
        <FormScroll contentClassName="gg-page gap-6 pb-16 pt-4">
          <InlineNotice
            tone="error"
            icon="circle-x"
            title="Sign-in unavailable"
            body="GRIDGO could not reach the sign-in behind this account, so it cannot confirm it is you. Go back, then open Delete account again."
            actionLabel="Go back"
            onAction={() => router.back()}
          />
        </FormScroll>
      </Screen>
    );
  }

  if (sent) {
    const due = legalDate(request?.dueAt);
    const retryLabel =
      apple === "cancelled" ? "Disconnect Sign in with Apple" : appleRetryLabel(appleRetry);
    return (
      <Screen edges={["bottom"]}>
        <FormScroll contentClassName="gg-page gap-8 pb-16 pt-4">
          <View className="gap-3" accessibilityLiveRegion="polite">
            <Text className="text-h2 text-text-primary" accessibilityRole="header">
              Request sent
            </Text>
            <Text className="text-body-lg text-text-primary">
              {due ? `GRIDGO will answer by ${due}.` : "GRIDGO will answer as soon as it can."}
            </Text>
            <Text className="text-body text-text-secondary">
              Operations process it by hand. Your account stays available while the request is
              reviewed, and you can follow it on Your data.
            </Text>
            <Text className="text-body text-text-secondary">{RETENTION_NOTE}</Text>
          </View>
          {apple !== "none" ? (
            <View className="gap-3" accessibilityLiveRegion="polite">
              <Text className="text-overline text-text-muted">SIGN IN WITH APPLE</Text>
              {apple === "revoked" ? (
                <>
                  <View className="flex-row">
                    <StatusChip tone="success" icon="circle-check" label="Disconnected" />
                  </View>
                  <Text className="text-body text-text-primary">{APPLE_REVOKED}</Text>
                </>
              ) : apple === "cancelled" ? (
                <Text className="text-body text-text-secondary">{APPLE_CANCELLED}</Text>
              ) : apple === "failed" && appleError ? (
                <InlineNotice
                  tone="error"
                  icon="circle-x"
                  title="Not disconnected"
                  body={appleError}
                />
              ) : (
                <Text className="text-body text-text-secondary">
                  {busy ? BUSY_LABEL[busy] : BUSY_LABEL.revoking}
                </Text>
              )}
              {(apple === "cancelled" || apple === "failed") && retryLabel ? (
                <SecondaryButton
                  label={retryLabel}
                  disabled={busy != null}
                  onPress={() => void revokeApple()}
                />
              ) : null}
              {apple === "failed" && appleSessionEnded ? (
                <SecondaryButton label="Sign in again" onPress={endSession} />
              ) : null}
            </View>
          ) : null}
          <SecondaryButton
            label="Go back"
            disabled={busy != null}
            onPress={() => router.back()}
          />
        </FormScroll>

        <BlockingOverlay visible={busy != null} label={busy ? BUSY_LABEL[busy] : ""} />
      </Screen>
    );
  }

  const askingForCode = method === "email_code" && !codeSent && !confirmed;

  return (
    <Screen edges={["bottom"]}>
      <FormScroll contentClassName="gg-page gap-8 pb-16 pt-4">
        <View className="gap-3">
          <Text className="text-h2 text-text-primary" accessibilityRole="header">
            Delete your GRIDGO account
          </Text>
          <Text className="text-body text-text-secondary">
            Operations will delete your GRIDGO sign-in and personal data. You will lose access
            across GRIDGO apps, and deletion cannot be undone.
          </Text>
          <Text className="text-body text-text-secondary">{RETENTION_NOTE}</Text>
          <Text className="text-body text-text-secondary">
            This sends a request that Operations handle by hand. Your account stays available
            while it is reviewed.
          </Text>
          {appleLinked ? (
            <Text className="text-body text-text-secondary">{APPLE_NOTICE}</Text>
          ) : null}
        </View>

        <View className="gap-4">
          <Text className="text-overline text-text-muted">CONFIRM IT IS YOU</Text>

          {confirmed ? (
            <Text className="text-body text-text-secondary">
              You have confirmed it is you. Send the request again when this phone is back
              online.
            </Text>
          ) : method === "password" ? (
            <FieldShell
              label="Your password"
              hint="The one you sign in to GRIDGO with. GRIDGO checks it with your sign-in and never stores it."
              error={fieldError}
            >
              <PasswordField
                value={secret}
                onChangeText={setSecret}
                accessibilityLabel="Your password"
                placeholder="Your password"
                textContentType="password"
                autoComplete="password"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="go"
                onSubmitEditing={() => void submit(method, session, appleOwner)}
                editable={busy == null}
                visibilityLabel="your password"
              />
            </FieldShell>
          ) : askingForCode ? (
            <Text className="text-body text-text-secondary">
              This account signs in with Google, so it has no password. GRIDGO will email a
              6-digit code to {email || "the address you sign in with"} to confirm it is you.
            </Text>
          ) : (
            <View className="gap-3">
              <FieldShell
                label="Code from the email"
                hint={`Sent to ${destination || email || "the address you sign in with"}.`}
                error={fieldError}
              >
                <CodeField
                  value={secret}
                  onChangeText={setSecret}
                  invalid={Boolean(fieldError)}
                  disabled={busy != null}
                  accessibilityLabel="Code from the email"
                />
              </FieldShell>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send another code"
                hitSlop={12}
                disabled={busy != null}
                onPress={() => void emailCode(session)}
                className="self-start"
              >
                <Text className="text-caption font-medium text-brand">Send another code</Text>
              </Pressable>
            </View>
          )}
        </View>

        {error ? <InlineNotice tone="error" icon="circle-x" title="Not sent" body={error} /> : null}

        <View className="gap-3">
          {askingForCode ? (
            <SecondaryButton
              label={busy === "emailing" ? "Emailing…" : "Email me a code"}
              disabled={busy != null}
              onPress={() => void emailCode(session)}
            />
          ) : (
            <DangerButton
              label={
                busy === "checking"
                  ? "Checking…"
                  : busy === "sending"
                    ? "Sending request…"
                    : confirmed
                      ? "Send the request again"
                      : "Delete my account"
              }
              disabled={busy != null}
              onPress={() => void submit(method, session, appleOwner)}
            />
          )}
          <SecondaryButton
            label="Keep my account"
            disabled={busy != null}
            onPress={() => router.back()}
          />
        </View>
      </FormScroll>

      <BlockingOverlay visible={busy != null} label={busy ? BUSY_LABEL[busy] : ""} />
    </Screen>
  );
}
