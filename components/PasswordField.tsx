import { Eye, EyeOff } from "lucide-react-native";
import { forwardRef, useState } from "react";
import { Pressable, TextInput, View, type TextInputProps } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

type Props = Omit<TextInputProps, "secureTextEntry"> & {
  testID?: string;
};

export const PasswordField = forwardRef<TextInput, Props>(function PasswordField(
  { testID = "password-visibility", ...props },
  ref,
) {
  const colors = useThemeColors();
  const [visible, setVisible] = useState(false);

  return (
    <View className="relative justify-center">
      <TextInput
        {...props}
        ref={ref}
        className="gg-field"
        style={[props.style, { paddingRight: 48 }]}
        secureTextEntry={!visible}
        placeholderTextColor={props.placeholderTextColor ?? colors.textMuted}
      />
      <Pressable
        onPress={() => setVisible((current) => !current)}
        accessibilityRole="button"
        accessibilityLabel={visible ? "Hide password" : "Show password"}
        accessibilityState={{ selected: visible }}
        testID={testID}
        className="absolute right-0 top-0 h-12 w-12 items-center justify-center"
      >
        {visible ? (
          <EyeOff size={20} color={colors.textSecondary} strokeWidth={2} />
        ) : (
          <Eye size={20} color={colors.textSecondary} strokeWidth={2} />
        )}
      </Pressable>
    </View>
  );
});
