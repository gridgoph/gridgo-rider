import { CircleCheck, CircleX, LoaderCircle } from "lucide-react-native";
import { Image, Text, View } from "react-native";

import { SecondaryButton } from "@/components/SecondaryButton";
import type { CashPhoto } from "@/hooks/useCashPhoto";
import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  photo: CashPhoto;
  title: string;
  instruction: string;
  /** The camera for something in front of the rider; their photos for a screenshot. */
  source: "camera" | "library";
  optional?: boolean;
  disabled?: boolean;
  testID?: string;
};

/**
 * One cash photo and where it stands: none yet, sending, saved by GRIDGO, or
 * failed with a way to send it again. "Saved" appears only once the server
 * has answered with a file id — the same honesty rule as delivery proof.
 */
export function CashPhotoField({ photo, title, instruction, source, optional = false, disabled = false, testID }: Props) {
  const colors = useThemeColors();
  const busy = photo.phase === "sending";
  const status =
    photo.phase === "stored"
      ? { Icon: CircleCheck, tint: colors.success, label: "Saved by GRIDGO" }
      : photo.phase === "sending"
        ? { Icon: LoaderCircle, tint: colors.textMuted, label: "Sending…" }
        : photo.phase === "failed"
          ? { Icon: CircleX, tint: colors.error, label: "Not sent" }
          : null;
  const pickLabel = photo.asset
    ? source === "camera"
      ? "Retake photo"
      : "Choose another"
    : source === "camera"
      ? "Take photo"
      : "Choose screenshot";

  return (
    <View className="gg-card gap-3" testID={testID}>
      <View className="gap-1">
        <Text className="text-h3 text-text-primary">{optional ? `${title} (optional)` : title}</Text>
        <Text className="text-body text-text-secondary">{instruction}</Text>
      </View>

      {photo.asset ? (
        <View className="flex-row items-center gap-3">
          <Image
            source={{ uri: photo.asset.uri }}
            accessibilityIgnoresInvertColors
            accessibilityLabel={`${title} preview`}
            className="h-20 w-20 rounded-field border border-outline bg-surface-variant"
            resizeMode="cover"
          />
          {status ? (
            <View
              className="min-w-0 flex-1 flex-row items-center gap-2"
              accessibilityRole={photo.phase === "failed" ? "alert" : "text"}
              accessibilityLiveRegion="polite"
            >
              <status.Icon size={18} color={status.tint} strokeWidth={2} />
              <Text className="min-w-0 flex-1 text-body font-bold text-text-primary">{status.label}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {photo.error ? <Text className="text-body text-error" accessibilityRole="alert">{photo.error}</Text> : null}

      <View className="flex-row gap-3">
        <View className="flex-1">
          <SecondaryButton
            label={pickLabel}
            onPress={() => void photo.take()}
            disabled={disabled || busy}
          />
        </View>
        {photo.phase === "failed" && photo.asset ? (
          <View className="flex-1">
            <SecondaryButton label="Send again" onPress={photo.retry} disabled={disabled} />
          </View>
        ) : null}
      </View>
    </View>
  );
}
