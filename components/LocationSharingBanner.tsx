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
  /*
    The headline is whichever fact the rider has to act on. A degraded fix wins
    even while sharing is on: "Location sharing on / Location is off" stacked
    two lines apart was the app contradicting itself, and the half that needs
    doing something about is the broken fix.
  */
  const title = degraded
    ? (freshness?.label ?? "Location is not reaching the client")
    : sharing
      ? "Location sharing on"
      : "Location sharing paused";

  return (
    <View
      className={`flex-row items-start gap-3 rounded-card border bg-surface p-4 ${border}`}
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      accessibilityLabel={[title, freshness?.label, freshness?.detail]
        .filter(Boolean)
        .join(". ")}
    >
      {/*
        A bare icon, the same as every other notice in the app. This used to sit
        inside a 44dp ring in the same tone as the card's border, which drew a
        second coloured stroke around nothing and gave a non-interactive glyph
        the size and shape of a button. In Dark the warning tone is a shade off
        actionYellow, so on the trip screen that ring read as a second yellow
        element an inch from the one that is actually the step.
      */}
      <View className="pt-0.5">
        <Icon size={18} color={tint} strokeWidth={2} />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-body font-bold text-text-primary">{title}</Text>
        {freshness && sharing && !degraded ? (
          <Text className="text-body text-text-secondary">{freshness.label}</Text>
        ) : null}
        {freshness?.detail ? (
          <Text className="text-body text-text-secondary">{freshness.detail}</Text>
        ) : null}
        {sharing && !degraded ? (
          <Text className="text-caption text-text-muted">
            Sent only while this trip is active, and never saved on this phone.
          </Text>
        ) : null}
      </View>
    </View>
  );
}
