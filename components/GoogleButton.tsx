import { Pressable, Text, View } from "react-native";

type Props = {
  onPress: () => void;
  disabled?: boolean;
};

export function GoogleButton({ onPress, disabled }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      className={disabled ? "gg-btn-secondary gg-disabled" : "gg-btn-secondary"}
    >
      {({ pressed }) => (
        <>
          <View className="mr-2 h-6 w-6 items-center justify-center rounded-pill border border-outline bg-surface-high">
            <Text className="text-body font-bold text-text-primary">G</Text>
          </View>
          <Text className="text-button text-text-primary">Continue with Google</Text>
          {pressed ? <View className="gg-pressed absolute inset-0 rounded-field" /> : null}
        </>
      )}
    </Pressable>
  );
}
