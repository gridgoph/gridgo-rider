import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, TextInput, View } from "react-native";

import { ChoiceList } from "@/components/ChoiceList";
import { FormScroll } from "@/components/FormScroll";
import { GridgoLogo } from "@/components/GridgoLogo";
import { InlineNotice } from "@/components/InlineNotice";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { useThemeColors } from "@/hooks/useTheme";
import { useSession } from "@/store/session";

/**
 * Vehicles a Davao pilot rider actually turns up on.
 *
 * A fixed set rather than a text field: the packaging check asks whether a job
 * will survive the ride, and "motorcycle" spelled six ways cannot be reviewed.
 * The API stores whatever string it is sent, so the constraint has to live here.
 */
const VEHICLES = [
  {
    id: "Motorcycle",
    label: "Motorcycle",
    helper: "The usual GRIDGO ride. Top box or a secured rack.",
  },
  { id: "Scooter", label: "Scooter", helper: "Underbone or automatic, with a box." },
  {
    id: "Tricycle",
    label: "Tricycle",
    helper: "More room for bulky print jobs, slower across the city.",
  },
] as const;

const MIN_PASSWORD = 8;

/**
 * Creating a rider account.
 *
 * Operations no longer issues accounts, so this is the front door. Everything
 * asked for is something Operations has to review before this rider can be
 * dispatched — nothing here is collected for its own sake — and the screen says
 * up front that approval is a step, so nobody signs up expecting work in the
 * next five minutes.
 */
export default function SignupScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const signup = useSession((s) => s.signup);
  const loading = useSession((s) => s.loading);
  const error = useSession((s) => s.error);
  const clearError = useSession((s) => s.clearError);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [vehicleType, setVehicleType] = useState<string | null>(null);
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");

  const blocked = !name.trim()
    ? "Enter your full name, as it appears on your licence."
    : !email.trim().includes("@")
      ? "Enter the email address you will sign in with."
      : !phone.trim()
        ? "Enter a phone number Operations can reach you on."
        : password.length < MIN_PASSWORD
          ? `Choose a password of at least ${MIN_PASSWORD} characters.`
          : !vehicleType
            ? "Choose what you ride."
            : !vehiclePlate.trim()
              ? "Enter your plate number."
              : !licenseNumber.trim()
                ? "Enter your driving licence number."
                : null;

  async function create() {
    if (blocked) return;
    const created = await signup({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      password,
      riderProfile: {
        vehicleType: vehicleType ?? "",
        vehiclePlate: vehiclePlate.trim(),
        licenseNumber: licenseNumber.trim(),
      },
    });
    // The auth gate carries a signed-in rider into the tab shell; from there
    // every screen already knows how to say "awaiting approval".
    if (created) router.replace("/(tabs)/offers");
  }

  return (
    <Screen>
      <FormScroll contentClassName="gg-page gap-8 py-8">
        <View className="gap-6">
          <GridgoLogo role="rider" />
          <View className="gap-1">
            <Text className="text-h1 text-text-primary">Ride for GRIDGO</Text>
            <Text className="text-body-lg text-text-secondary">
              Operations reviews every rider before any job is dispatched. You can create
              your account now; work starts once they have accredited it.
            </Text>
          </View>
        </View>

        <View className="gap-4">
          <Field
            label="FULL NAME"
            value={name}
            onChange={setName}
            placeholder="As printed on your licence"
            autoCapitalize="words"
            placeholderColor={colors.textMuted}
          />
          <Field
            label="EMAIL"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            placeholderColor={colors.textMuted}
          />
          <Field
            label="PHONE"
            value={phone}
            onChange={setPhone}
            placeholder="+63 917 000 0000"
            keyboardType="phone-pad"
            autoComplete="tel"
            placeholderColor={colors.textMuted}
          />
          <Field
            label="PASSWORD"
            value={password}
            onChange={setPassword}
            placeholder={`At least ${MIN_PASSWORD} characters`}
            secureTextEntry
            autoComplete="new-password"
            placeholderColor={colors.textMuted}
          />
        </View>

        <ChoiceList
          label="What you ride"
          choices={VEHICLES}
          value={vehicleType}
          onChange={setVehicleType}
          disabled={loading}
        />

        <View className="gap-4">
          <Field
            label="PLATE NUMBER"
            value={vehiclePlate}
            onChange={setVehiclePlate}
            placeholder="ABC 1234"
            autoCapitalize="characters"
            placeholderColor={colors.textMuted}
          />
          <Field
            label="DRIVING LICENCE NUMBER"
            value={licenseNumber}
            onChange={setLicenseNumber}
            placeholder="N01-23-456789"
            autoCapitalize="characters"
            placeholderColor={colors.textMuted}
          />
          <Text className="text-caption text-text-muted">
            Operations checks the plate and licence against the rider you turn up as. Wrong
            details hold up your accreditation.
          </Text>
        </View>

        {error ? (
          <InlineNotice
            tone="error"
            icon="circle-x"
            title="Account not created"
            body={error}
          />
        ) : null}

        <View className="gap-3">
          <PrimaryButton
            label={loading ? "Creating your account…" : "Create my rider account"}
            onPress={() => void create()}
            disabled={loading || Boolean(blocked)}
            size="large"
          />
          {blocked ? (
            <Text className="text-center text-body text-text-secondary">{blocked}</Text>
          ) : null}
          <SecondaryButton
            label="I already have an account"
            onPress={() => {
              clearError();
              router.back();
            }}
          />
        </View>
      </FormScroll>
    </Screen>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  placeholderColor: string;
  autoCapitalize?: "none" | "words" | "characters";
  keyboardType?: "email-address" | "phone-pad";
  autoComplete?: "email" | "tel" | "new-password";
  secureTextEntry?: boolean;
};

/** One labelled field on GRIDGO's own field token. */
function Field({
  label,
  value,
  onChange,
  placeholder,
  placeholderColor,
  autoCapitalize = "none",
  keyboardType,
  autoComplete,
  secureTextEntry = false,
}: FieldProps) {
  return (
    <View className="gap-2">
      <Text className="text-overline text-text-muted">{label}</Text>
      <TextInput
        className="gg-field"
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={placeholderColor}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        autoComplete={autoComplete}
        secureTextEntry={secureTextEntry}
        accessibilityLabel={label.toLowerCase()}
      />
    </View>
  );
}
