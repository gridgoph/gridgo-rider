import { MapPin, Package } from "lucide-react-native";
import { Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  /** "Pickup" or "Drop-off" — shape + label differentiate, not colour alone. */
  kind: "pickup" | "dropoff";
  address: string;
  zone?: string;
  /** Optional second line (supplier/client name, landmark). */
  detail?: string;
  /** Highlight the stop the rider is currently heading to. */
  active?: boolean;
};

/**
 * Structured address card for a stop on the job.
 * Pickup uses a package glyph and a square mark; drop-off uses a pin and a
 * circle — readable in grayscale without relying on colour alone.
 */
export function AddressStop({ kind, address, zone, detail, active = false }: Props) {
  const colors = useThemeColors();
  const isPickup = kind === "pickup";
  const label = isPickup ? "Pickup" : "Drop-off";
  const Icon = isPickup ? Package : MapPin;

  return (
    <View
      className={
        active
          ? "flex-row gap-3 rounded-card border border-accent bg-surface p-4"
          : "flex-row gap-3 rounded-card border border-outline bg-surface p-4"
      }
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${address}${zone ? `, ${zone}` : ""}`}
    >
      {/*
        Shape differentiation: square mark for pickup, circle for drop-off.
        Colour is secondary; the shape and label carry the meaning.
      */}
      <View
        className={
          isPickup
            ? "h-11 w-11 items-center justify-center rounded-sm border border-outline bg-surface-variant"
            : "h-11 w-11 items-center justify-center rounded-pill border border-outline bg-surface-variant"
        }
      >
        <Icon size={20} color={colors.textPrimary} strokeWidth={2} />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-overline text-text-muted">{label.toUpperCase()}</Text>
        <Text className="text-body-lg text-text-primary">{address}</Text>
        {detail ? <Text className="text-body text-text-secondary">{detail}</Text> : null}
        {zone ? <Text className="text-caption text-text-muted">{zone}</Text> : null}
      </View>
    </View>
  );
}
