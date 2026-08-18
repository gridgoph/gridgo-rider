import { Image } from "expo-image";
import { View } from "react-native";

import { images } from "@/constants/images";
import type { OnboardingArt } from "@/data/onboarding";

/**
 * The onboarding picture: the Storyset beat the captain picked, drawn
 * through `expo-image` so a PNG is a bitmap, not a scene SVG.
 */
export function OnboardingMark({
  name,
  size,
}: {
  name: OnboardingArt;
  size: number;
}) {
  if (size <= 0) return null;

  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden>
      <Image
        source={images.onboarding[name]}
        style={{ width: size, height: size }}
        contentFit="contain"
      />
    </View>
  );
}
