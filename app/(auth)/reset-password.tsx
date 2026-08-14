import { useSignIn } from "@clerk/expo";
import { Redirect } from "expo-router";
import { useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";

import { AuthBackButton } from "@/components/AuthBackButton";
import { FormScroll } from "@/components/FormScroll";
import { InlineNotice } from "@/components/InlineNotice";
import { PasswordField } from "@/components/PasswordField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { useThemeColors } from "@/hooks/useTheme";
import { clerkErrorMessage } from "@/lib/clerkAuth";
import { useSession } from "@/store/session";

type Step = "email" | "code" | "password";

export default function ResetPasswordScreen() {
  const { fetchStatus, signIn } = useSignIn();
  const colors = useThemeColors();
  const user = useSession((state) => state.user);
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmationField = useRef<TextInput>(null);

  if (user) return <Redirect href="/(tabs)/active" />;

  async function sendCode() {
    if (fetchStatus === "fetching" || !email.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await signIn.create({ identifier: email.trim() });
      if (created.error) throw created.error;
      const sent = await signIn.resetPasswordEmailCode.sendCode();
      if (sent.error) throw sent.error;
      setStep("code");
    } catch (caught) {
      setError(clerkErrorMessage(caught, "We could not send a recovery code. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    if (fetchStatus === "fetching" || !code.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const verified = await signIn.resetPasswordEmailCode.verifyCode({ code: code.trim() });
      if (verified.error) throw verified.error;
      setStep("password");
    } catch (caught) {
      setError(clerkErrorMessage(caught, "That recovery code is not valid. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function savePassword() {
    if (fetchStatus === "fetching" || busy) return;
    if (password.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const submitted = await signIn.resetPasswordEmailCode.submitPassword({ password });
      if (submitted.error) throw submitted.error;
      if (signIn.status !== "complete") throw new Error("Password reset is incomplete.");
      const completed = await signIn.finalize();
      if (completed.error) throw completed.error;
    } catch (caught) {
      setError(clerkErrorMessage(caught, "Your password was not changed. Try again."));
      setBusy(false);
    }
  }

  const title = step === "email" ? "Recover password." : step === "code" ? "Check your email." : "Choose a new password.";
  const body =
    step === "email"
      ? "We’ll send a one-time code to your GRIDGO account email."
      : step === "code"
        ? `Enter the code sent to ${email.trim()}.`
        : "Use a password you do not use for another account.";

  return (
    <Screen>
      <FormScroll contentClassName="gg-page grow gap-8 py-8">
        <AuthBackButton />
        <View className="gap-2">
          <Text className="text-h1 text-text-primary">{title}</Text>
          <Text className="text-body-lg text-text-secondary">{body}</Text>
        </View>

        <View className="gap-4">
          {step === "email" ? (
            <View className="gap-2">
              <Text className="text-overline text-text-muted">EMAIL</Text>
              <TextInput
                className="gg-field"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.textMuted}
                accessibilityLabel="Email"
                returnKeyType="send"
                onSubmitEditing={() => void sendCode()}
              />
            </View>
          ) : step === "code" ? (
            <View className="gap-2">
              <Text className="text-overline text-text-muted">RECOVERY CODE</Text>
              <TextInput
                className="gg-field"
                autoComplete="one-time-code"
                keyboardType="number-pad"
                value={code}
                onChangeText={setCode}
                placeholder="Enter the code"
                placeholderTextColor={colors.textMuted}
                accessibilityLabel="Recovery code"
                returnKeyType="done"
                onSubmitEditing={() => void verifyCode()}
              />
            </View>
          ) : (
            <>
              <View className="gap-2">
                <Text className="text-overline text-text-muted">NEW PASSWORD</Text>
                <PasswordField
                  value={password}
                  onChangeText={setPassword}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  accessibilityLabel="New password"
                  returnKeyType="next"
                  onSubmitEditing={() => confirmationField.current?.focus()}
                />
              </View>
              <View className="gap-2">
                <Text className="text-overline text-text-muted">CONFIRM PASSWORD</Text>
                <PasswordField
                  ref={confirmationField}
                  value={confirmation}
                  onChangeText={setConfirmation}
                  autoComplete="new-password"
                  placeholder="Repeat your password"
                  accessibilityLabel="Confirm password"
                  returnKeyType="go"
                  testID="reset-confirmation-visibility"
                  onSubmitEditing={() => void savePassword()}
                />
              </View>
            </>
          )}

          {error ? (
            <InlineNotice tone="error" icon="circle-x" title="Try again" body={error} />
          ) : null}

          <PrimaryButton
            label={
              busy
                ? "Working…"
                : step === "email"
                  ? "Send recovery code"
                  : step === "code"
                    ? "Verify code"
                    : "Save new password"
            }
            onPress={() =>
              void (step === "email" ? sendCode() : step === "code" ? verifyCode() : savePassword())
            }
            disabled={busy || fetchStatus === "fetching"}
            size="large"
          />
        </View>
      </FormScroll>
    </Screen>
  );
}
