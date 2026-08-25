import { useAuth, useClerk, useSignIn } from "@clerk/expo";
import { useSSO } from "@clerk/expo/experimental";
import { Redirect, useRouter, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { AuthDivider } from "@/components/AuthDivider";
import { CodeField } from "@/components/CodeField";
import { FormScroll } from "@/components/FormScroll";
import { GoogleButton } from "@/components/GoogleButton";
import { GridgoLogo } from "@/components/GridgoLogo";
import { InlineNotice } from "@/components/InlineNotice";
import { PasswordField } from "@/components/PasswordField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { fieldInputStyle } from "@/constants/theme";
import { useThemeColors } from "@/hooks/useTheme";
import { clerkErrorMessage } from "@/lib/clerkAuth";
import {
  clerkSignOutRecoveryMessage,
  continuationAfterPassword,
  loginVerifyCopy,
  type ClerkSecondFactorStrategy,
} from "@/lib/clerkSignIn";
import { completeGoogleSso } from "@/lib/googleSso";
import { useSession } from "@/store/session";

/** Clerk's emailed / SMS / authenticator codes are six digits. */
const CODE_LENGTH = 6;

/**
 * Seconds before another code can be asked for. Long enough that the first
 * one has time to arrive — most "it isn't working" taps are impatience.
 */
const RESEND_COOLDOWN_SECONDS = 30;

export default function LoginScreen() {
  const router = useRouter();
  const { fetchStatus, signIn } = useSignIn();
  const { startSSOFlow } = useSSO();
  const { isSignedIn } = useAuth();
  const { setActive, signOut } = useClerk();
  const colors = useThemeColors();
  const user = useSession((state) => state.user);
  // Set while the session bridge adopts a fresh Clerk session against /auth/me.
  const adopting = useSession((state) => state.loading);
  const storeError = useSession((state) => state.error);
  const clearError = useSession((state) => state.clearError);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [clerkError, setClerkError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [code, setCode] = useState("");
  const [verifyFactor, setVerifyFactor] = useState<ClerkSecondFactorStrategy>("email_code");
  const [resendIn, setResendIn] = useState(0);
  const passwordField = useRef<TextInput>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((left) => left - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  if (user) return <Redirect href="/(tabs)/active" />;

  async function sendSecondFactor(factor: ClerkSecondFactorStrategy) {
    if (!signIn) return;
    if (factor === "phone_code") {
      const sent = await signIn.mfa.sendPhoneCode();
      if (sent.error) throw sent.error;
      return;
    }
    if (factor === "email_code") {
      const sent = await signIn.mfa.sendEmailCode();
      if (sent.error) throw sent.error;
    }
  }

  async function continueAfterPassword(
    retriedExistingSession = false,
  ): Promise<"ready" | "code" | "blocked"> {
    if (!signIn) return "blocked";
    const next = continuationAfterPassword(
      signIn.status,
      signIn.existingSession,
      signIn.supportedSecondFactors,
    );
    if (next.kind === "existing_session") {
      if (!retriedExistingSession) {
        try {
          await signOut();
        } catch {
          setClerkError(clerkSignOutRecoveryMessage);
          return "blocked";
        }
        setBusy(false);
        await submitPassword(true);
        return "blocked";
      }
      await setActive({ session: next.sessionId });
      return "ready";
    }
    if (next.kind === "blocked") {
      setClerkError(next.message);
      return "blocked";
    }
    if (next.kind === "verification") {
      await sendSecondFactor(next.factor);
      setVerifyFactor(next.factor);
      setCode("");
      setVerifying(true);
      setResendIn(RESEND_COOLDOWN_SECONDS);
      return "code";
    }
    const completed = await signIn.finalize();
    if (completed.error) throw completed.error;
    return "ready";
  }

  async function submitPassword(retriedExistingSession = false) {
    if (busy || adopting) return;
    const normalizedEmail = email.trim().toLowerCase();
    setClerkError(null);
    clearError();

    if (!normalizedEmail || !password) {
      setClerkError("Enter your email and password.");
      return;
    }

    if (!signIn || fetchStatus === "fetching") return;

    setBusy(true);
    // Clerk is the only identity source. The API answers 404 on /auth/login,
    // so there is no domain password path to fall through from.
    try {
      const attempt = await signIn.password({
        emailAddress: normalizedEmail,
        password,
      });
      if (attempt.error) throw attempt.error;
      await continueAfterPassword(retriedExistingSession);
    } catch (caught) {
      // The session bridge may have already left a rider-facing explanation.
      // Never render a title with an empty body.
      if (!useSession.getState().error) {
        setClerkError(clerkErrorMessage(caught, "Wrong email or password."));
      }
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    const typed = code.replace(/\D/g, "");
    if (!signIn || typed.length < CODE_LENGTH || busy || adopting) return;
    setClerkError(null);
    clearError();
    setBusy(true);
    try {
      const checked =
        verifyFactor === "phone_code"
          ? await signIn.mfa.verifyPhoneCode({ code: typed })
          : verifyFactor === "totp"
            ? await signIn.mfa.verifyTOTP({ code: typed })
            : verifyFactor === "backup_code"
              ? await signIn.mfa.verifyBackupCode({ code: typed })
              : await signIn.mfa.verifyEmailCode({ code: typed });
      if (checked.error) throw checked.error;
      if (signIn.status !== "complete") {
        throw new Error("That code did not match. Check the six digits, or send another.");
      }
      const completed = await signIn.finalize();
      if (completed.error) throw completed.error;
    } catch (caught) {
      setCode("");
      if (!useSession.getState().error) {
        setClerkError(
          clerkErrorMessage(
            caught,
            "That code did not match. Check the six digits, or send another.",
          ),
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    if (!signIn || busy || resendIn > 0) return;
    setClerkError(null);
    clearError();
    setCode("");
    setBusy(true);
    try {
      await sendSecondFactor(verifyFactor);
      setResendIn(RESEND_COOLDOWN_SECONDS);
    } catch (caught) {
      setClerkError(clerkErrorMessage(caught, "GRIDGO could not send another code. Try again."));
    } finally {
      setBusy(false);
    }
  }

  function editEmail() {
    setCode("");
    setResendIn(0);
    setClerkError(null);
    clearError();
    setVerifying(false);
  }

  async function continueWithGoogle() {
    if (busy) return;
    setBusy(true);
    setClerkError(null);
    clearError();
    try {
      const outcome = await completeGoogleSso({
        alreadySignedIn: Boolean(isSignedIn),
        startSSOFlow: () => startSSOFlow({ strategy: "oauth_google" }),
        setActive: (args) => setActive(args),
      });
      if (outcome.status === "incomplete") {
        throw new Error("Google did not create a session.");
      }
    } catch (caught) {
      setClerkError(
        clerkErrorMessage(caught, "Google sign in did not go through. Try again."),
      );
    } finally {
      setBusy(false);
    }
  }

  const loading = busy || adopting;
  const error = clerkError ?? storeError;
  const verifyCopy = loginVerifyCopy(verifyFactor, email);
  const codeProblem = Boolean(clerkError);

  if (verifying) {
    return (
      <Screen edges={["bottom"]}>
        <FormScroll contentClassName="gg-page grow gap-8 py-6">
          <View className="gap-6">
            <GridgoLogo role="rider" />
            <View className="gap-2">
              <Text className="text-h1 text-text-primary">{verifyCopy.heading}</Text>
              <Text className="text-body-lg text-text-secondary">{verifyCopy.body}</Text>
            </View>
          </View>

          <View className="gap-4">
            <View className="gap-3">
              <Text className="text-overline text-text-muted">
                {verifyFactor === "phone_code"
                  ? "PHONE CODE"
                  : verifyFactor === "totp"
                    ? "AUTHENTICATOR CODE"
                    : verifyFactor === "backup_code"
                      ? "BACKUP CODE"
                      : "EMAILED CODE"}
              </Text>
              <CodeField
                value={code}
                onChangeText={(next) => {
                  setCode(next);
                  setClerkError(null);
                  clearError();
                }}
                length={CODE_LENGTH}
                invalid={codeProblem}
                onComplete={() => void verifyCode()}
                autoFocus
                accessibilityLabel="Emailed code"
                accessibilityHint={`Enter the ${CODE_LENGTH} digits GRIDGO emailed you`}
                testID="login-code"
              />
            </View>

            {error ? (
              <InlineNotice
                tone="error"
                icon="circle-x"
                title={codeProblem ? "Code not accepted" : "Not signed in"}
                body={error}
              />
            ) : null}

            <PrimaryButton
              label={loading ? "Signing in…" : "Sign in"}
              onPress={() => void verifyCode()}
              disabled={loading || code.length < CODE_LENGTH}
              size="large"
            />

            <View className="items-center">
              {verifyCopy.resend ? (
                <Pressable
                  onPress={() => void resendCode()}
                  disabled={loading || resendIn > 0}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: loading || resendIn > 0 }}
                  className="min-h-11 items-center justify-center"
                >
                  <Text
                    className={
                      resendIn > 0
                        ? "text-button text-text-muted"
                        : "text-button text-text-primary"
                    }
                  >
                    {resendIn > 0 ? `Send another code in ${resendIn}s` : "Send another code"}
                  </Text>
                </Pressable>
              ) : null}

              <Pressable
                onPress={editEmail}
                disabled={loading}
                accessibilityRole="button"
                className="min-h-11 items-center justify-center"
              >
                <Text className="text-caption text-text-secondary">
                  {email.trim() ? `Not ${email.trim()}? Change it` : "Use a different email"}
                </Text>
              </Pressable>
            </View>
          </View>
        </FormScroll>
      </Screen>
    );
  }

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
      </FormScroll>
    </Screen>
  );
}
