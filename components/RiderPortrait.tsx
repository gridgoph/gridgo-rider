import { Bike } from "lucide-react-native";
import { useState } from "react";
import { Image, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  /** Clerk's hosted portrait. Absent until the rider has set one. */
  imageUrl?: string | null;
  /** The rider's name, so anyone who cannot see the picture knows whose it is. */
  name: string;
  /** Edge length in points. 56 in a card, 96 at the head of a form. */
  size: number;
};

/**
 * The rider, as a picture.
 *
 * Every other photograph in this app is proof of a job, squared and cropped
 * for evidence. This is the one picture that is a person, and it is the only
 * round frame in the product — that contrast is the whole point.
 *
 * With no picture yet it is a bike mark, never an initial. A letter in a
 * coloured disc is the house style of every product that has no idea who its
 * user is, and this one does.
 */
export function RiderPortrait({ imageUrl, name, size }: Props) {
  const colors = useThemeColors();
  // A failure belongs to the URL that failed: a new picture gets a fresh try.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const failed = failedUrl != null && failedUrl === imageUrl;

  const showing = imageUrl && !failed;

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={showing ? `${name}, profile photo` : `${name}, no profile photo yet`}
      className="items-center justify-center overflow-hidden border border-outline bg-surface-variant"
      style={{ width: size, height: size, borderRadius: size / 2 }}
      collapsable={false}
    >
      {showing ? (
        <Image
          source={{ uri: imageUrl }}
          resizeMode="cover"
          style={{ width: "100%", height: "100%" }}
          onError={() => setFailedUrl(imageUrl ?? null)}
          accessibilityElementsHidden
        />
      ) : (
        <Bike size={Math.round(size * 0.38)} color={colors.textMuted} strokeWidth={1.75} />
      )}
    </View>
  );
}
