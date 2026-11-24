import { Text, TextInput, View } from "react-native";

import { fieldInputStyle } from "@/constants/theme";
import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  otp: string;
  onChange: (otp: string) => void;
  disabled?: boolean;
  /** Open the keypad at once, as the full-screen prompt does on arrival. */
  autoFocus?: boolean;
  /** A group order: the host holds the code, and a backup receiver uses the same one. */
  group?: boolean;
};

/** One real field preserves leading zeroes and lets the rider correct any digit. */
export function HandoverCodeCard({ otp, onChange, disabled = false, autoFocus = false, group = false }: Props) {
  const colors = useThemeColors();
  return (
    <View className="gap-4 rounded-card border-2 border-accent bg-surface p-6">
      <View className="gap-1">
        <Text className="text-overline text-text-muted">{group ? "CHECK WITH THE HOST" : "CHECK WITH THE CLIENT"}</Text>
        <Text className="text-h3 text-text-primary">Handover code</Text>
      </View>
      <Text className="text-body-lg text-text-secondary">
        {group
          ? "Ask the host to read their code aloud. A backup receiver uses the same code."
          : "Ask the client to read their code aloud."}
      </Text>
      <TextInput
        className="gg-field text-h2"
        style={fieldInputStyle}
        value={otp}
        onChangeText={(value) => onChange(value.replace(/\D/g, "").slice(0, 6))}
        keyboardType="number-pad"
        maxLength={6}
        autoComplete="off"
        autoCorrect={false}
        autoFocus={autoFocus}
        editable={!disabled}
        placeholder="Six-digit code"
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={group ? "The host's six-digit handover code" : "Client's six-digit handover code"}
        accessibilityHint={`Enter the code the ${group ? "host" : "client"} reads aloud. GRIDGO checks it when you confirm delivery.`}
      />
      <Text className="text-caption text-text-muted">
        They find it in their GRIDGO app. GRIDGO checks it when you confirm delivery. Keep the package until then.
      </Text>
    </View>
  );
}
