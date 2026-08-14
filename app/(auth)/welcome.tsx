import { useRouter, type Href } from "expo-router";
import { Pressable, Text, View, useWindowDimensions } from "react-native";

import { GridgoLogo } from "@/components/GridgoLogo";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { ScooterIllustration } from "@/components/illustrations/ScooterIllustration";
import { useThemeColors } from "@/hooks/useTheme";

export default function WelcomeScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { width, height } = useWindowDimensions();
  const artWidth = Math.min(width - 32, 560);
  const artHeight = Math.min(artWidth * 0.77, height * 0.42);

  return (
    <Screen>
      <View className="gg-page flex-1 justify-between gap-6 py-8">
        <GridgoLogo role="rider" />

        <View className="flex-1 items-center justify-center">
          <ScooterIllustration
            width={artWidth}
            height={artHeight}
            palette={{
              ink: colors.accent,
              shade: colors.textSecondary,
              mid: colors.textMuted,
              tint: colors.outline,
              highlight: colors.surface,
            }}
          />
        </View>

        <View className="gap-6">
          <View className="gap-2">
            <Text className="text-display text-text-primary">Ready for the next delivery?</Text>
            <Text className="text-body-lg text-text-secondary">
              Apply to ride with GRIDGO. Offers stay closed until Operations approves
              your account.
            </Text>
          </View>

          <View className="gap-3">
            <PrimaryButton
              label="Sign up"
              onPress={() => router.push("/(auth)/signup" as Href)}
              size="large"
            />
            <SecondaryButton
              label="Sign in"
              onPress={() => router.push("/(auth)/login")}
            />
          </View>

          <Pressable
            onPress={() => router.push("/(auth)/accept-invitation")}
            accessibilityRole="button"
            className="min-h-11 items-center justify-center"
          >
            <Text className="text-center text-button text-text-primary">
              Have an Operations invitation?
            </Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}
