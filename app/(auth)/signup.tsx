import { useAuth, useClerk, useSignUp, useUser } from "@clerk/expo";
import { Redirect, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { ChoiceList } from "@/components/ChoiceList";
import { CodeField } from "@/components/CodeField";
import { FormScroll } from "@/components/FormScroll";
import { GridgoLogo } from "@/components/GridgoLogo";
import { InlineNotice } from "@/components/InlineNotice";
import { PasswordField } from "@/components/PasswordField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { fieldInputStyle } from "@/constants/theme";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import {
  awaitClerkSessionToken,
  clerkErrorMessage,
  isAlreadySignedInError,
  splitPersonName,
} from "@/lib/clerkAuth";
import { continuationAfterSignUp } from "@/lib/clerkSignUp";
import {
  EMPTY_SIGNUP,
  VEHICLE_TYPES,
  canSubmitSignup,
  enrollmentIdempotencyKey,
  firstSignupProblem,
  toEnrollRequest,
  type SignupFields,
  type VehicleType,
} from "@/lib/signup";
import { useSession } from "@/store/session";

/** Clerk's emailed verification codes are six digits. */
const CODE_LENGTH = 6;

/**
 * Seconds before another code can be asked for. Long enough that the first one
 * has time to arrive — most "it isn't working" taps are impatience, and each
 * one invalidates the code already in the rider's inbox.
 */
const RESEND_COOLDOWN_SECONDS = 30;

/**
 * Public rider apply.
 *
 * Two steps behind one button: Clerk creates the identity from the email and
 * password, then `POST /auth/clerk/enroll/rider` files the profile against that
 * session. Clerk may demand an emailed code in between, which is why this
 * screen has a second face rather than a second route.
 */
export default function SignupScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const user = useSession((state) => state.user);
  const enrollRider = useSession((state) => state.enrollRider);
  const leaveApplication = useSession((state) => state.leaveApplication);
  const loading = useSession((state) => state.loading);
  const storeError = useSession((state) => state.error);
  const clearError = useSession((state) => state.clearError);
  const { signUp } = useSignUp();
  const { isSignedIn, getToken } = useAuth();
  const { user: clerkUser } = useUser();
  const { setActive, signOut } = useClerk();

  const [fields, setFields] = useState<SignupFields>(EMPTY_SIGNUP);
  const [localError, setLocalError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  // One attempt keeps one key, so a retry after a lost reply is a retry to the
  // API rather than a second application.
  const [enrollKey] = useState(() => enrollmentIdempotencyKey());

  const emailField = useRef<TextInput>(null);
  const phoneField = useRef<TextInput>(null);
  const passwordField = useRef<TextInput>(null);
  const confirmationField = useRef<TextInput>(null);
  const plateField = useRef<TextInput>(null);
  const licenceField = useRef<TextInput>(null);

  // Tick the resend cooldown down to zero, one second at a time.
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((left) => left - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  if (user) return <Redirect href="/(tabs)/active" />;

  function patch(next: Partial<SignupFields>) {
    setFields((current) => ({ ...current, ...next }));
    setLocalError(null);
    clearError();
  }

  async function continueSignUp(options?: {
    allowEmailCode?: boolean;
  }): Promise<"ready" | "email_code" | "blocked"> {
    if (!signUp) return "blocked";
    const next = continuationAfterSignUp({
      status: signUp.status,
      unverifiedFields: signUp.unverifiedFields,
      missingFields: signUp.missingFields,
      existingSession: signUp.existingSession,
    });

    if (next.kind === "existing_session") {
      try {
        await setActive({ session: next.sessionId });
      } catch {
        // Already the active session — the token wait below is the real test.
      }
      return "ready";
    }
    if (next.kind === "complete") {
      const finalized = await signUp.finalize();
      if (finalized.error && !isAlreadySignedInError(finalized.error)) {
        throw finalized.error;
      }
      return "ready";
    }
    if (next.kind === "email_code") {
      if (options?.allowEmailCode === false) {
        throw new Error("Your email is verified, but the account still needs attention.");
      }
      const sent = await signUp.verifications.sendEmailCode();
      if (sent.error) throw sent.error;
      setVerifying(true);
      setResendIn(RESEND_COOLDOWN_SECONDS);
      return "email_code";
    }
    setLocalError(next.message);
    return "blocked";
  }

  async function ensureClerkSession(): Promise<"ready" | "email_code" | "blocked"> {
    if (isSignedIn) return "ready";
    if (!signUp) {
      setLocalError("GRIDGO could not start your application. Try again in a moment.");
      return "blocked";
    }
    const result = await signUp.password({
      emailAddress: fields.email.trim().toLowerCase(),
      password: fields.password,
      ...splitPersonName(fields.name),
    });
    if (result.error) {
      if (isAlreadySignedInError(result.error)) return "ready";
      throw result.error;
    }
    return continueSignUp();
  }

  /** File the application. The auth gate redirects once the store holds a rider. */
  async function enroll(): Promise<boolean> {
    api.setTokenProvider(getToken);
    const token = await awaitClerkSessionToken(getToken);
    if (!token) {
      setLocalError("GRIDGO could not confirm your sign-in. Wait a moment and try again.");
      return false;
    }
    return enrollRider(toEnrollRequest(fields), enrollKey);
  }

  async function submit() {
    if (loading || busy) return;
    const problem = firstSignupProblem(fields, { identityExists: Boolean(isSignedIn) });
    if (problem) {
      setLocalError(problem);
      return;
    }
    clearError();
    setLocalError(null);
    setBusy(true);
    try {
      const clerk = await ensureClerkSession();
      if (clerk !== "ready") return;
      await enroll();
    } catch (caught) {
      // A leftover session is not a failure: the identity already exists, so
      // the application can be filed against it directly.
      if (isAlreadySignedInError(caught)) {
        try {
          await enroll();
          return;
        } catch (retry) {
          setLocalError(
            clerkErrorMessage(retry, "GRIDGO could not send your application. Try again."),
          );
          return;
        }
      }
      setLocalError(
        clerkErrorMessage(
          caught,
          "GRIDGO could not send your application. Check your details and try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function verifyEmail() {
    const typed = code.replace(/\D/g, "");
    if (!signUp || typed.length < CODE_LENGTH || busy) return;
    clearError();
    setLocalError(null);
    setBusy(true);
    try {
      const result = await signUp.verifications.verifyEmailCode({ code: typed });
      if (result.error) throw result.error;
      const next = await continueSignUp({ allowEmailCode: false });
      if (next !== "ready") return;
      await enroll();
    } catch (caught) {
      // A wrong code is wrong whole, not wrong in one digit — nobody fixes the
      // fourth character of a code they read out of an email. Clearing it leaves
      // the field ready for a fresh read instead of asking for six backspaces.
      setCode("");
      setLocalError(
        clerkErrorMessage(caught, "That code did not match. Check the six digits, or send another."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    if (!signUp || busy || resendIn > 0) return;
    clearError();
    setLocalError(null);
    setCode("");
    setBusy(true);
    try {
      const sent = await signUp.verifications.sendEmailCode();
      if (sent.error) throw sent.error;
      setResendIn(RESEND_COOLDOWN_SECONDS);
    } catch (caught) {
      setLocalError(clerkErrorMessage(caught, "GRIDGO could not send another code. Try again."));
    } finally {
      setBusy(false);
    }
  }

  /** Back to the form, so a mistyped email can be corrected rather than retried. */
  function editEmail() {
    setCode("");
    setResendIn(0);
    setLocalError(null);
    clearError();
    setVerifying(false);
  }

  const error = localError ?? storeError;
  /*
    Someone can reach this screen already signed in — an account that was
    created but never applied, sent here because applying is the only thing it
    can do. Clerk owns their name, email and password, and the API reads those
    from the identity, so this screen asks only for what is actually missing.
  */
  const identityExists = Boolean(isSignedIn);
  const signedInEmail = clerkUser?.primaryEmailAddress?.emailAddress ?? null;
  const ready = canSubmitSignup(fields, { identityExists });
  const sending = busy;

  /*
    The phone belongs to the application, not the identity, so it is asked for
    either way. Declared once and placed in both flows: mid-form when the whole
    form is shown, and on its own when Clerk already holds the identity.
  */
  const phoneBlock = (
    <View className="gap-2">
      <Text className="text-overline text-text-muted">PHONE</Text>
      <TextInput
        ref={phoneField}
        className="gg-field"
        style={fieldInputStyle}
        autoComplete="tel"
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        value={fields.phone}
        onChangeText={(phone) => patch({ phone })}
        placeholder="0917 123 4567"
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="Phone"
        returnKeyType="next"
        onSubmitEditing={() =>
          identityExists
            ? plateField.current?.focus()
            : passwordField.current?.focus()
        }
      />
    </View>
  );

  if (verifying) {
    const typedEmail = fields.email.trim();
    // Two different failures reach this screen and they do not deserve the same
    // heading: a code Clerk refused, and an application the API refused after a
    // perfectly good code. Only the first is the field's fault, so only the
    // first marks the field.
    const codeProblem = Boolean(localError);
    return (
      <Screen edges={["bottom"]}>
        <FormScroll contentClassName="gg-page grow gap-8 py-6">
          <View className="gap-6">
            <GridgoLogo role="rider" />
            <View className="gap-2">
              <Text className="text-h1 text-text-primary">Confirm your email.</Text>
              <Text className="text-body-lg text-text-secondary">
                {`GRIDGO sent a ${CODE_LENGTH}-digit code to ${typedEmail}. Enter it to file your application.`}
              </Text>
            </View>
          </View>

          <View className="gap-4">
            <View className="gap-3">
              <Text className="text-overline text-text-muted">EMAILED CODE</Text>
              <CodeField
                value={code}
                onChangeText={(next) => {
                  setCode(next);
                  setLocalError(null);
                  clearError();
                }}
                length={CODE_LENGTH}
                invalid={codeProblem}
                // Left editable while the code is checked: disabling it drops
                // the keyboard and the focus, and the commonest next thing a
                // rider does here is retype. `verifyEmail` guards the request.
                onComplete={() => void verifyEmail()}
                autoFocus
                accessibilityLabel="Emailed code"
                accessibilityHint={`Enter the ${CODE_LENGTH} digits GRIDGO emailed you`}
                testID="signup-code"
              />
            </View>

            {error ? (
              <InlineNotice
                tone="error"
                icon="circle-x"
                title={codeProblem ? "Code not accepted" : "Application not sent"}
                body={error}
              />
            ) : null}

            <PrimaryButton
              label={sending ? "Filing your application…" : "Finish applying"}
              onPress={() => void verifyEmail()}
              disabled={sending || code.length < CODE_LENGTH}
              size="large"
            />

            <View className="items-center">
              <Pressable
                onPress={() => void resendCode()}
                disabled={sending || resendIn > 0}
                accessibilityRole="button"
                accessibilityState={{ disabled: sending || resendIn > 0 }}
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

              <Pressable
                onPress={editEmail}
                disabled={sending}
                accessibilityRole="button"
                className="min-h-11 items-center justify-center"
              >
                <Text className="text-caption text-text-secondary">
                  {`Not ${typedEmail}? Change it`}
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
          <View className="gap-2">
            <Text className="text-h1 text-text-primary">
              {identityExists ? "Finish your application." : "Apply to ride."}
            </Text>
            <Text className="text-body-lg text-text-secondary">
              GRIDGO must approve you before jobs appear. Offers stay closed until
              Operations reviews this account.
            </Text>
          </View>
        </View>

        {identityExists ? (
          <InlineNotice
            tone="info"
            icon="info"
            title="You are signed in, but you have not applied yet"
            body={
              signedInEmail
                ? `${signedInEmail} has no rider application on file. Add your vehicle and licence to send one.`
                : "This account has no rider application on file. Add your vehicle and licence to send one."
            }
            actionLabel="Use a different account"
            onAction={() => void signOut().catch(() => {})}
          />
        ) : null}

        {identityExists ? null : (
        <View className="gap-4">
          <View className="gap-2">
            <Text className="text-overline text-text-muted">FULL NAME</Text>
            <TextInput
              className="gg-field"
              style={fieldInputStyle}
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              value={fields.name}
              onChangeText={(name) => patch({ name })}
              placeholder="Ana Santos"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Full name"
              returnKeyType="next"
              onSubmitEditing={() => emailField.current?.focus()}
            />
          </View>

          <View className="gap-2">
            <Text className="text-overline text-text-muted">EMAIL</Text>
            <TextInput
              ref={emailField}
              className="gg-field"
              style={fieldInputStyle}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              value={fields.email}
              onChangeText={(email) => patch({ email })}
              placeholder="you@example.com"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Email"
              returnKeyType="next"
              onSubmitEditing={() => phoneField.current?.focus()}
            />
          </View>

          {phoneBlock}

          <View className="gap-2">
            <Text className="text-overline text-text-muted">PASSWORD</Text>
            <PasswordField
              ref={passwordField}
              value={fields.password}
              onChangeText={(password) => patch({ password })}
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
              value={fields.confirmation}
              onChangeText={(confirmation) => patch({ confirmation })}
              autoComplete="new-password"
              placeholder="Repeat your password"
              accessibilityLabel="Confirm password"
              returnKeyType="next"
              testID="signup-confirmation-visibility"
              onSubmitEditing={() => plateField.current?.focus()}
            />
          </View>
        </View>
        )}

        {identityExists ? phoneBlock : null}

        <View className="gg-card gap-4">
          <View className="gap-1">
            <Text className="text-overline text-text-muted">WHAT OPERATIONS REVIEWS</Text>
            <Text className="text-caption text-text-secondary">
              The vehicle and licence on this account. Wrong details hold the review up.
            </Text>
          </View>

          <ChoiceList
            label="Vehicle"
            choices={VEHICLE_TYPES}
            value={fields.vehicleType}
            onChange={(vehicleType: VehicleType) => patch({ vehicleType })}
            disabled={sending}
          />

          <View className="gap-2">
            <Text className="text-overline text-text-muted">PLATE NUMBER</Text>
            <TextInput
              ref={plateField}
              className="gg-field"
              style={fieldInputStyle}
              autoCapitalize="characters"
              value={fields.vehiclePlate}
              onChangeText={(vehiclePlate) => patch({ vehiclePlate })}
              placeholder="ABC 1234"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Plate number"
              returnKeyType="next"
              onSubmitEditing={() => licenceField.current?.focus()}
            />
          </View>

          <View className="gap-2">
            <Text className="text-overline text-text-muted">LICENCE NUMBER</Text>
            <TextInput
              ref={licenceField}
              className="gg-field"
              style={fieldInputStyle}
              autoCapitalize="characters"
              value={fields.licenseNumber}
              onChangeText={(licenseNumber) => patch({ licenseNumber })}
              placeholder="N01-23-456789"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel="Licence number"
              returnKeyType="go"
              onSubmitEditing={() => void submit()}
            />
          </View>
        </View>

        {error ? (
          <InlineNotice tone="error" icon="circle-x" title="Application not sent" body={error} />
        ) : null}

        <PrimaryButton
          label={sending ? "Sending application…" : "Apply to ride"}
          onPress={() => void submit()}
          disabled={sending || !ready}
          size="large"
        />

        <Pressable
          onPress={() => {
            leaveApplication();
            void signOut().catch(() => {});
            router.replace("/(auth)/login");
          }}
          accessibilityRole="button"
          className="min-h-11 items-center justify-center"
        >
          <Text className="text-button text-text-primary">Already have an account? Sign in</Text>
        </Pressable>
      </FormScroll>
    </Screen>
  );
}
