import { useSignInWithApple } from "@clerk/expo/apple";
import {
  AppleAuthenticationButton,
  AppleAuthenticationButtonStyle,
  AppleAuthenticationButtonType,
} from "expo-apple-authentication";
import { View } from "react-native";

import type { AppleButtonProps } from "./AppleButton";
import { radius } from "@/constants/theme";
import { useThemeName } from "@/hooks/useTheme";

/**
 * Apple's own system button, as its Human Interface Guidelines ask: black on
 * Light, white on Dark, "Continue with Apple", the same 56pt height and field
 * corners as the Google button below it. It sits above Google, never lower.
 *
 * Apple's button has no disabled state, so a tap already in flight dims it
 * and stops touches the way `gg-disabled` does for every other control.
 */
export function AppleButton({ onPress, disabled }: AppleButtonProps) {
  const { startAppleAuthenticationFlow } = useSignInWithApple();
  const dark = useThemeName() === "dark";
  return (
    <View
      pointerEvents={disabled ? "none" : "auto"}
      accessibilityState={{ disabled: Boolean(disabled) }}
      className={disabled ? "gg-disabled" : undefined}
    >
      <AppleAuthenticationButton
        buttonType={AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={
          dark ? AppleAuthenticationButtonStyle.WHITE : AppleAuthenticationButtonStyle.BLACK
        }
        cornerRadius={radius.field}
        style={{ width: "100%", height: 56 }}
        onPress={() => onPress(() => startAppleAuthenticationFlow())}
      />
    </View>
  );
}
