import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { Screen } from "@/components/Screen";
import { useThemeColors } from "@/hooks/useTheme";

/** Clerk's default Expo Go browser-SSO redirect target. */
export default function SsoCallbackScreen() {
  const router = useRouter();
  const colors = useThemeColors();

  useEffect(() => {
    router.replace("/");
  }, [router]);

  return (
    <Screen edges={["top", "bottom"]}>
      <View className="flex-1 items-center justify-center gap-3 px-4">
        <ActivityIndicator color={colors.textPrimary} />
        <Text className="text-body text-text-secondary">Signing you in…</Text>
      </View>
    </Screen>
  );
}
