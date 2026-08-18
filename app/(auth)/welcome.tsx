import { useRouter, type Href } from "expo-router";
import { Image } from "expo-image";
import { Pressable, Text, View, useWindowDimensions } from "react-native";

import { GridgoLogo } from "@/components/GridgoLogo";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { SecondaryButton } from "@/components/SecondaryButton";
import { images } from "@/constants/images";

/**
 * First screen a rider sees. The scooter is the thesis — a Davao rider
 * already on the job — so it takes the leftover canvas, edge to edge,
 * not a boxed SVG in the middle.
 */
export default function WelcomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();

  return (
    <Screen>
      <View className="flex-1">
        <View className="gg-page pt-4">
          <GridgoLogo role="rider" />
        </View>

        <View className="min-h-0 flex-1 items-center justify-center">
          <Image
            source={images.welcome}
            style={{ width, height: "100%" }}
            contentFit="contain"
            accessibilityLabel="Rider on a scooter with a delivery"
          />
        </View>

        <View className="gg-page gap-5 pb-6 pt-1">
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
              size="large"
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
