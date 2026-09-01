import { MapPin, Package, Route } from "lucide-react-native";
import { Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  /** "Pickup" or "Drop-off" — shape and label differentiate, not colour. */
  kind: "pickup" | "dropoff";
  /** What the rider is doing there, as a heading: "Collect from PrintRight". */
  heading: string;
  /** The address, full, wrapping. */
  address: string;
  /** "3.9 km · 9 min" from OSRM, or the honest fallback. */
  routeSummary: string;
  /** Zone name, quietly. */
  zone?: string | null;
  /** Overrides the default NEXT STOP · PICKUP / DROP-OFF overline. */
  overline?: string;
};

/**
 * Where the rider is going right now.
 *
 * This is the one thing the Active screen has to answer in the first glance,
 * so it gets the biggest type on the screen after the title and sits above
 * everything about the job itself. Three sizes in one card — overline, H2
 * address, body-large distance — is what makes the hierarchy read at arm's
 * length on a bike.
 */
export function NextStopCard({
  kind,
  heading,
  address,
  routeSummary,
  zone,
  overline,
}: Props) {
  const colors = useThemeColors();
  const Icon = kind === "pickup" ? Package : MapPin;

  return (
    <View className="gg-card gap-3">
      <View className="flex-row items-center gap-2">
        <Icon size={16} color={colors.textMuted} strokeWidth={2} />
        <Text className="text-overline text-text-muted">
          {overline ?? (kind === "pickup" ? "NEXT STOP · PICKUP" : "NEXT STOP · DROP-OFF")}
        </Text>
      </View>

      <View className="gap-1">
        <Text className="text-h2 text-text-primary">{address}</Text>
        <Text className="text-body text-text-secondary">{heading}</Text>
      </View>

      <View className="flex-row items-center gap-2 border-t border-outline-subtle pt-3">
        <Route size={16} color={colors.textMuted} strokeWidth={2} />
        <Text className="min-w-0 flex-1 text-body-lg text-text-primary">{routeSummary}</Text>
        {zone ? <Text className="text-caption text-text-muted">{zone}</Text> : null}
      </View>
    </View>
  );
}
