import { Image } from "expo-image";
import { View } from "react-native";

import { images } from "@/constants/images";
import type { OnboardingArt } from "@/data/onboarding";

/**
 * The onboarding picture: fills the leftover canvas the way Welcome does,
 * so the figure is the page, not a 340 stamp in empty space.
 */
export function OnboardingMark({ name }: { name: OnboardingArt }) {
  return (
    <View className="min-h-0 w-full flex-1" accessibilityElementsHidden>
      <Image
        source={images.onboarding[name]}
        style={{ width: "100%", height: "100%" }}
        contentFit="contain"
      />
    </View>
  );
}
