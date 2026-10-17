import { CircleAlert, MicOff, PhoneMissed, PhoneOff, WifiOff, type LucideIcon } from "lucide-react-native";
import { Text, View } from "react-native";

import { StatusChip } from "@/components/StatusChip";
import { useThemeColors } from "@/hooks/useTheme";
import { callDurationLabel, endReasonCopy, type CallEndReason, type CallPerson } from "@/lib/orderCalls";

type Props = {
  reason: CallEndReason;
  person: CallPerson | null;
  /** Time the voices were connected. Null when they never were. */
  durationMs: number | null;
};

type Look = { icon: LucideIcon; token: "textSecondary" | "warning" | "error" | "info" };

/** A hang-up is routine and stays grey; a lost connection is a warning; a refusal is information. */
function lookOf(reason: CallEndReason): Look {
  switch (reason) {
    case "ended":
    case "ended_by_them":
    case "cancelled":
      return { icon: PhoneOff, token: "textSecondary" };
    case "declined":
    case "declined_by_you":
    case "no_answer":
    case "missed":
      return { icon: PhoneMissed, token: "textSecondary" };
    case "network_lost":
    case "failed":
      return { icon: WifiOff, token: "warning" };
    case "mic_blocked":
      return { icon: MicOff, token: "error" };
    case "not_available":
    case "busy":
    case "too_many":
    case "unsupported":
      return { icon: CircleAlert, token: "info" };
  }
}

/**
 * How the call ended, where the timer was: icon and headline, then who ended
 * it or what went wrong, then how long it lasted. A hang-up and a lost
 * connection never share a glyph or a colour, so neither reads as the other;
 * the colour is on the glyph only, since warning ink on the canvas is too faint
 * for a headline.
 */
export function CallEndSummary({ reason, person, durationMs }: Props) {
  const colors = useThemeColors();
  const copy = endReasonCopy(reason, person);
  const { icon: Icon, token } = lookOf(reason);
  const duration = durationMs !== null ? callDurationLabel(durationMs) : null;

  return (
    <View className="items-center gap-2">
      <View className="flex-row items-center gap-2" accessible accessibilityRole="header" accessibilityLabel={copy.title}>
        <Icon size={22} color={colors[token]} strokeWidth={2} />
        <Text className="text-h3 text-text-primary">{copy.title}</Text>
      </View>
      <Text className="text-center text-body-lg text-text-secondary">{copy.body}</Text>
      {duration ? (
        <View className="mt-1" accessible accessibilityLabel={`Call time ${duration}`}>
          <StatusChip tone="neutral" icon="clock" label={`Call time ${duration}`} />
        </View>
      ) : null}
    </View>
  );
}
