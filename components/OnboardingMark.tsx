import { Image } from "expo-image";
import { useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";

import { illustrations } from "@/components/illustrations";
import { images } from "@/constants/images";
import type { OnboardingPicture } from "@/data/onboarding";
import { useThemeColors } from "@/hooks/useTheme";

/**
 * The onboarding picture: fills the leftover canvas the way Welcome does,
 * so the figure is the page, not a 340 stamp in empty space.
 *
 * The bubble ask has no raster beat of its own, so it draws the rider on the
 * scooter from the illustration set, on the same five-step ramp.
 */
export function OnboardingMark({ name }: { name: OnboardingPicture }) {
  return (
    <View className="min-h-0 w-full flex-1" accessibilityElementsHidden>
      {name === "bubble" ? (
        <ScooterMark />
      ) : (
        <Image
          source={images.onboarding[name]}
          style={{ width: "100%", height: "100%" }}
          contentFit="contain"
        />
      )}
    </View>
  );
}

function ScooterMark() {
  const colors = useThemeColors();
  const [box, setBox] = useState({ width: 0, height: 0 });
  const { Component, aspect } = illustrations.scooter;

  function onLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    setBox((current) => (current.width === width && current.height === height ? current : { width, height }));
  }

  // Contain: as wide as the page allows, never taller than the space.
  const width = Math.min(box.width * 0.84, box.height * 0.84 * aspect);
  return (
    <View className="flex-1 items-center justify-center" onLayout={onLayout}>
      {width > 0 ? (
        <Component
          width={width}
          height={width / aspect}
          palette={{
            ink: colors.accent,
            shade: colors.textSecondary,
            mid: colors.textMuted,
            tint: colors.outline,
            highlight: colors.surface,
          }}
        />
      ) : null}
    </View>
  );
}
