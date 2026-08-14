import { useSignIn } from "@clerk/expo";
import { useSSO } from "@clerk/expo/experimental";
import { Redirect, useRouter, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { AuthDivider } from "@/components/AuthDivider";
import { FormScroll } from "@/components/FormScroll";
import { GoogleButton } from "@/components/GoogleButton";
import { GridgoLogo } from "@/components/GridgoLogo";
import { InlineNotice } from "@/components/InlineNotice";
import { PasswordField } from "@/components/PasswordField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { StatusChip } from "@/components/StatusChip";
import { fieldInputStyle } from "@/constants/theme";
import { useThemeColors } from "@/hooks/useTheme";
import { getApiBase, health } from "@/lib/api";
import { clerkErrorMessage } from "@/lib/clerkAuth";
import { DEV_LOGIN } from "@/lib/devLogin";
import { useSession } from "@/store/session";

type HealthState = "checking" | "reachable" | "unreachable";

export default function LoginScreen() {
  const router = useRouter();
  const { fetchStatus, signIn } = useSignIn();
  const { startSSOFlow } = useSSO();
  const colors = useThemeColors();
  const user = useSession((state) => state.user);
  const legacyLogin = useSession((state) => state.login);
  const legacyLoading = useSession((state) => state.loading);
  const storeError = useSession((state) => state.error);
  const clearError = useSession((state) => state.clearError);
  const [email, setEmail] = useState(() => DEV_LOGIN?.email ?? "");
  const [password, setPassword] = useState(() => DEV_LOGIN?.password ?? "");
  const [busy, setBusy] = useState(false);
  const [clerkError, setClerkError] = useState<string | null>(null);
  const [apiBase] = useState(() => getApiBase());
  const [healthState, setHealthState] = useState<HealthState>("checking");
  const passwordField = useRef<TextInput>(null);

  useEffect(() => {
    let cancelled = false;
    void health()
      .then((result) => {
        if (!cancelled) setHealthState(result.ok ? "reachable" : "unreachable");
      })
      .catch(() => {
        if (!cancelled) setHealthState("unreachable");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (user) return <Redirect href="/(tabs)/active" />;

  async function submitPassword() {
    if (busy || legacyLoading) return;
    const normalizedEmail = email.trim();
    setClerkError(null);
    clearError();

    if (!normalizedEmail || !password) {
      setClerkError("Enter your email and password.");
      return;
    }

    setBusy(true);
    // Public apply lives on the domain API while AUTH_MODE is still legacy.
    // A 401 here is "wrong password or no such user", which is also the
    // shape of an Operations-invited Clerk account that has never been
    // written into the demo store — so only that case falls through.
    const result = await legacyLogin(normalizedEmail, password);
    if (result === "signed_in") {
      setBusy(false);
      return;
    }
    if (result === "failed") {
      setBusy(false);
      return;
    }

    if (fetchStatus === "fetching") {
      setBusy(false);
      return;
    }

    try {
      const attempt = await signIn.password({
        emailAddress: normalizedEmail,
        password,
      });
      if (attempt.error) throw attempt.error;
      if (signIn.status !== "complete") {
        throw new Error("Additional verification is required.");
      }
      const completed = await signIn.finalize();
      if (completed.error) throw completed.error;
    } catch {
      // Keep the domain API's "wrong email or password". It is the right
      // sentence for a rider who just applied here.
      setBusy(false);
    }
  }

  async function continueWithGoogle() {
    if (busy) return;
    setBusy(true);
    setClerkError(null);
    clearError();
    try {
      const result = await startSSOFlow({ strategy: "oauth_google" });
      if (!result.createdSessionId && result.authSessionResult?.type !== "cancel") {
        throw new Error("Google did not create a session.");
      }
      if (!result.createdSessionId) setBusy(false);
    } catch (caught) {
      setClerkError(
        clerkErrorMessage(caught, "Google sign in did not go through. Try again."),
      );
      setBusy(false);
    }
  }

  const loading = busy || legacyLoading;
  const error = clerkError ?? storeError;

  return (
    <Screen edges={["bottom"]}>
      <FormScroll contentClassName="gg-page grow gap-8 py-6">
        <View className="gap-6">
          <GridgoLogo role="rider" />
          <View className="gap-1">
            <Text className="text-h1 text-text-primary">Welcome Back.</Text>
            <Text className="text-body-lg text-text-secondary">Let’s sign in</Text>
          </View>
        </View>

        <View className="gap-4">
          <View className="gap-2">
            <Text className="text-overline text-text-muted">EMAIL</Text>
            <TextInput
              className="gg-field"
              style={fieldInputStyle}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Email"
              returnKeyType="next"
              onSubmitEditing={() => passwordField.current?.focus()}
            />
          </View>

          <View className="gap-2">
            <Text className="text-overline text-text-muted">PASSWORD</Text>
            <PasswordField
              ref={passwordField}
              value={password}
              onChangeText={setPassword}
              autoComplete="current-password"
              placeholder="Your password"
              accessibilityLabel="Password"
              returnKeyType="go"
              textContentType="password"
              onSubmitEditing={() => void submitPassword()}
            />
            <Pressable
              onPress={() => router.push("/(auth)/reset-password")}
              accessibilityRole="button"
              className="min-h-11 self-end justify-center"
            >
              <Text className="text-button text-text-primary">Recover password</Text>
            </Pressable>
          </View>

          {error ? (
            <InlineNotice tone="error" icon="circle-x" title="Not signed in" body={error} />
          ) : null}

          <PrimaryButton
            label={loading ? "Signing in…" : "Sign in"}
            onPress={() => void submitPassword()}
            disabled={loading}
            size="large"
          />

          <AuthDivider />
          <GoogleButton onPress={() => void continueWithGoogle()} disabled={loading} />

          <Pressable
            onPress={() => router.push("/(auth)/signup" as Href)}
            accessibilityRole="button"
            className="min-h-11 items-center justify-center"
          >
            <Text className="text-button text-text-primary">Need an account? Sign up</Text>
          </Pressable>
        </View>

        <View className="flex-row flex-wrap items-center gap-2 pt-2">
          <Text className="text-caption text-text-muted" numberOfLines={2}>
            {apiBase}
          </Text>
          {healthState === "checking" ? (
            <StatusChip tone="neutral" label="Checking…" icon="clock" />
          ) : healthState === "reachable" ? (
            <StatusChip tone="success" label="Reachable" icon="circle-check" />
          ) : (
            <StatusChip tone="error" label="Unreachable" icon="circle-x" />
          )}
        </View>
      </FormScroll>
    </Screen>
  );
}
