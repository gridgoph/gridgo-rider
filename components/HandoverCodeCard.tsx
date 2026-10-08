import { Text, TextInput, View } from "react-native";

import { fieldInputStyle } from "@/constants/theme";
import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  otp: string;
  onChange: (otp: string) => void;
  disabled?: boolean;
};

/** One real field preserves leading zeroes and lets the rider correct any digit. */
export function HandoverCodeCard({ otp, onChange, disabled = false }: Props) {
  const colors = useThemeColors();
  return (
    <View className="gap-4 rounded-card border-2 border-accent bg-surface p-6">
      <View className="gap-1">
        <Text className="text-overline text-text-muted">CHECK WITH THE CLIENT</Text>
        <Text className="text-h3 text-text-primary">Handover code</Text>
      </View>
      <Text className="text-body-lg text-text-secondary">
        Ask the client to open GRIDGO and read their six-digit code aloud. Enter it below, then confirm delivery so GRIDGO can check it. Keep the package until delivery is recorded.
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
        editable={!disabled}
        placeholder="Six-digit code"
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="Client's six-digit handover code"
        accessibilityHint="Enter the code the client reads aloud. GRIDGO checks it when you confirm delivery."
      />
    </View>
  );
}
