import { useSignUp } from "@clerk/expo";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";

import { FormScroll } from "@/components/FormScroll";
import { GridgoLogo } from "@/components/GridgoLogo";
import { InlineNotice } from "@/components/InlineNotice";
import { PasswordField } from "@/components/PasswordField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { clerkErrorMessage } from "@/lib/clerkAuth";
import { useSession } from "@/store/session";

export default function AcceptInvitationScreen() {
  const params = useLocalSearchParams<{ __clerk_ticket?: string | string[] }>();
  const ticketParam = params.__clerk_ticket;
  const ticket = Array.isArray(ticketParam) ? ticketParam[0] : ticketParam;
  const { fetchStatus, signUp } = useSignUp();
  const user = useSession((state) => state.user);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmationField = useRef<TextInput>(null);

  if (user) return <Redirect href="/(tabs)/active" />;

  async function acceptInvitation() {
    if (fetchStatus === "fetching" || !ticket || busy) return;
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
      const ticketAttempt = await signUp.ticket({ ticket });
      if (ticketAttempt.error) throw ticketAttempt.error;

      if (signUp.status !== "complete") {
        const passwordAttempt = await signUp.password({ password });
        if (passwordAttempt.error) throw passwordAttempt.error;
      }

      if (signUp.status !== "complete") {
        throw new Error("Invitation needs another verification step.");
      }
      const completed = await signUp.finalize();
      if (completed.error) throw completed.error;
    } catch (caught) {
      setError(
        clerkErrorMessage(
          caught,
          "This invitation could not be accepted. Ask Operations to send a fresh invite.",
        ),
      );
      setBusy(false);
    }
  }

  return (
    <Screen edges={["bottom"]}>
      <FormScroll contentClassName="gg-page grow gap-8 py-6">
        <View className="gap-6">
          <GridgoLogo role="rider" />
          <View className="gap-2">
            <Text className="text-h1 text-text-primary">Join the rider team.</Text>
            <Text className="text-body-lg text-text-secondary">
              Use the private link sent by GRIDGO Operations to activate your account.
            </Text>
          </View>
        </View>

        {!ticket ? (
          <InlineNotice
            tone="info"
            icon="info"
            title="Open your invitation link"
            body="This screen cannot create a rider account by itself. Return to the email from Operations and tap Accept invitation."
          />
        ) : (
          <View className="gap-4">
            <View className="gap-2">
              <Text className="text-overline text-text-muted">PASSWORD</Text>
              <PasswordField
                value={password}
                onChangeText={setPassword}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                accessibilityLabel="Password"
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
                testID="confirmation-visibility"
                onSubmitEditing={() => void acceptInvitation()}
              />
            </View>

            {error ? (
              <InlineNotice
                tone="error"
                icon="circle-x"
                title="Invitation not accepted"
                body={error}
              />
            ) : null}

            <View nativeID="clerk-captcha" />
            <PrimaryButton
              label={busy ? "Activating…" : "Activate rider account"}
              onPress={() => void acceptInvitation()}
              disabled={busy || fetchStatus === "fetching"}
              size="large"
            />
          </View>
        )}
      </FormScroll>
    </Screen>
  );
}
