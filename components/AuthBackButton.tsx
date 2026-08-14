import { ChevronLeft } from "lucide-react-native";
import { useRouter } from "expo-router";
import { Pressable } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

export function AuthBackButton() {
  const router = useRouter();
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={() => router.back()}
      accessibilityRole="button"
      accessibilityLabel="Back"
      className="h-11 w-11 items-center justify-center rounded-pill border border-outline bg-surface"
    >
      <ChevronLeft size={22} color={colors.textPrimary} strokeWidth={2} />
    </Pressable>
  );
}
