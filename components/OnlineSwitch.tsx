import { Pressable, Text, View } from "react-native";

type Props = {
  online: boolean;
  disabled?: boolean;
  onToggle: () => void;
};

/**
 * Going online, as the panel's one control.
 *
 * Drawn from tokens rather than the platform switch so it is the same size
 * and the same contrast on every phone and in sunlight: a 64 × 36 track, the
 * whole row a 56pt target. Monochrome on purpose — the yellow budget belongs
 * to the offer's Accept — and the state is said in words beside it, never by
 * the knob's side alone.
 */
export function OnlineSwitch({ online, disabled = false, onToggle }: Props) {
  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel="Online"
      accessibilityState={{ checked: online, disabled }}
      // react-native-web reads only aria-* for state; without it a browser
      // announces "Online, switch" with no on or off.
      aria-checked={online}
      accessibilityHint={online ? "Turns delivery offers off on this phone" : "Shows delivery offers on the map"}
      hitSlop={8}
      className="min-h-14 flex-row items-center gap-3"
      testID="online-switch"
    >
      <Text className={disabled ? "text-body font-bold text-text-muted" : "text-body font-bold text-text-primary"}>
        {online ? "On" : "Off"}
      </Text>
      <View
        className={
          disabled
            ? "h-9 w-16 justify-center rounded-pill border border-outline bg-surface-variant px-1"
            : online
              ? "h-9 w-16 items-end justify-center rounded-pill bg-accent px-1"
              : "h-9 w-16 justify-center rounded-pill border-2 border-text-muted bg-surface px-1"
        }
      >
        <View
          className={
            disabled
              ? "h-7 w-7 rounded-pill bg-outline"
              : online
                ? "h-7 w-7 rounded-pill bg-accent-on"
                : "h-6 w-6 rounded-pill bg-text-muted"
          }
        />
      </View>
    </Pressable>
  );
}
