import { Redirect, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { ChoiceList } from "@/components/ChoiceList";
import { FormScroll } from "@/components/FormScroll";
import { GridgoLogo } from "@/components/GridgoLogo";
import { InlineNotice } from "@/components/InlineNotice";
import { PasswordField } from "@/components/PasswordField";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { fieldInputStyle } from "@/constants/theme";
import { useThemeColors } from "@/hooks/useTheme";
import {
  EMPTY_SIGNUP,
  VEHICLE_TYPES,
  canSubmitSignup,
  firstSignupProblem,
  type SignupFields,
  type VehicleType,
} from "@/lib/signup";
import { useSession } from "@/store/session";

export default function SignupScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const user = useSession((state) => state.user);
  const signup = useSession((state) => state.signup);
  const loading = useSession((state) => state.loading);
  const storeError = useSession((state) => state.error);
  const clearError = useSession((state) => state.clearError);

  const [fields, setFields] = useState<SignupFields>(EMPTY_SIGNUP);
  const [localError, setLocalError] = useState<string | null>(null);

  const emailField = useRef<TextInput>(null);
  const phoneField = useRef<TextInput>(null);
  const passwordField = useRef<TextInput>(null);
  const confirmationField = useRef<TextInput>(null);
  const plateField = useRef<TextInput>(null);
  const licenceField = useRef<TextInput>(null);

  if (user) return <Redirect href="/(tabs)/active" />;

  function patch(next: Partial<SignupFields>) {
    setFields((current) => ({ ...current, ...next }));
    setLocalError(null);
    clearError();
  }

  async function submit() {
    if (loading) return;
    const problem = firstSignupProblem(fields);
    if (problem) {
      setLocalError(problem);
      return;
    }
    setLocalError(null);
    await signup(fields);
  }

  const error = localError ?? storeError;
  const ready = canSubmitSignup(fields);

  return (
    <Screen edges={["bottom"]}>
      <FormScroll contentClassName="gg-page grow gap-8 py-6">
        <View className="gap-6">
          <GridgoLogo role="rider" />
          <View className="gap-2">
            <Text className="text-h1 text-text-primary">Apply to ride.</Text>
            <Text className="text-body-lg text-text-secondary">
              GRIDGO must approve you before jobs appear. Offers stay closed until
              Operations reviews this account.
            </Text>
          </View>
        </View>

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
              onSubmitEditing={() => passwordField.current?.focus()}
            />
          </View>

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
            disabled={loading}
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
          label={loading ? "Sending application…" : "Apply to ride"}
          onPress={() => void submit()}
          disabled={loading || !ready}
          size="large"
        />

        <Pressable
          onPress={() => router.push("/(auth)/login")}
          accessibilityRole="button"
          className="min-h-11 items-center justify-center"
        >
          <Text className="text-button text-text-primary">Already have an account? Sign in</Text>
        </Pressable>
      </FormScroll>
    </Screen>
  );
}
