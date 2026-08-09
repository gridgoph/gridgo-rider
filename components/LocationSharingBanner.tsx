import { MapPinned, TriangleAlert } from "lucide-react-native";
import { Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import type { LocationFreshness } from "@/lib/locationFreshness";

type Props = {
  /** When true, location is being posted for the active trip. */
  sharing: boolean;
  /** How old the position on the map is. Null when there is nothing to say. */
  freshness?: LocationFreshness | null;
};

/**
 * What the client can see of the rider, and how much to trust it.
 *
 * Two facts belong together and are shown in one card rather than two stacked
 * banners: that a position is leaving the phone, and how old that position is.
 * Sharing a fix without its age tells the rider their client is watching them
 * move when the dot may not have moved in five minutes.
 *
 * Location is shared only while a trip is in transit and is never persisted.
 */
export function LocationSharingBanner({ sharing, freshness = null }: Props) {
  const colors = useThemeColors();
  const degraded = freshness?.level === "stale" || freshness?.level === "off";

  // Nothing to report: not sharing, and the fix is healthy.
  if (!sharing && !degraded) return null;

  const Icon = degraded ? TriangleAlert : MapPinned;
  const tint = degraded ? colors.warning : colors.info;
  const border = degraded ? "border-warning" : "border-info";
  // Before a package is in transit nothing is being shared, so the headline is
  // the problem with the fix itself rather than a pause nobody asked for.
  const title = sharing ? "Location sharing on" : (freshness?.label ?? "Location sharing paused");

  return (
    <View
      className={`flex-row items-start gap-3 rounded-card border bg-surface p-4 ${border}`}
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      accessibilityLabel={[title, freshness?.label, freshness?.detail]
        .filter(Boolean)
        .join(". ")}
    >
      <View className={`h-11 w-11 items-center justify-center rounded-pill border ${border}`}>
        <Icon size={20} color={tint} strokeWidth={2} />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-body font-bold text-text-primary">{title}</Text>
        {freshness && sharing ? (
          <Text
            className={
              degraded ? "text-body text-text-primary" : "text-body text-text-secondary"
            }
          >
            {freshness.label}
          </Text>
        ) : null}
        {freshness?.detail ? (
          <Text className="text-caption text-text-muted">{freshness.detail}</Text>
        ) : null}
        {sharing ? (
          <Text className="text-caption text-text-muted">
            Your position is sent only while this trip is active, and nothing is saved on
            this phone.
          </Text>
        ) : null}
      </View>
    </View>
  );
}
