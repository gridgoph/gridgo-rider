import { Check, CircleX } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import {
  ARRIVAL_ESTIMATE_CHOICES,
  arrivalClockLabel,
  canShareArrivalEstimate,
  groupRefusalMessage,
} from "@/lib/groupOrder";
import { useGroupArrivalEstimate } from "@/store/groupArrivalEstimate";

type Props = {
  order: { id: string; state: string; groupOrder?: unknown };
  /** The map router's road time, when it has one; only a hint. */
  routeSeconds?: number | null;
};

/**
 * "When will you get there?" — one tap tells the whole group.
 *
 * A handful of plain choices, each sent the moment it is tapped. The one the
 * rider last shared stays filled (monochrome, with a tick) and the line under
 * it says the clock time the group now sees, so nobody wonders whether it
 * went. Tapping another time updates it. It is the rider's own estimate, and
 * says so: the map's road time is only offered as a hint. Shows only on a
 * group order after pick-up.
 */
export function GroupArrivalEstimate({ order, routeSeconds = null }: Props) {
  const colors = useThemeColors();
  const shared = useGroupArrivalEstimate((s) => s.byOrder[order.id] ?? null);
  const record = useGroupArrivalEstimate((s) => s.record);
  const [sending, setSending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!canShareArrivalEstimate(order)) return null;
  const routeMinutes = routeSeconds != null && routeSeconds > 0 ? Math.max(1, Math.round(routeSeconds / 60)) : null;

  async function share(minutes: number) {
    if (sending !== null) return;
    setSending(minutes);
    setError(null);
    try {
      const result = await api.shareGroupArrivalEstimate(order.id, minutes);
      record(order.id, { minutes, estimatedArrivalAt: result.estimatedArrivalAt });
    } catch (e) {
      setError(groupRefusalMessage(api.apiErrorCode(e), "Your arrival time did not reach the group. Tap it again."));
    } finally {
      setSending(null);
    }
  }

  const clock = shared?.estimatedArrivalAt ? arrivalClockLabel(shared.estimatedArrivalAt) : null;

  return (
    <View className="gap-2" testID="group-arrival-estimate">
      <Text className="text-body font-bold text-text-primary">
        {shared ? "Arrival time shared with the group" : "Tell the group when you will arrive"}
      </Text>
      <View className="flex-row gap-2" accessibilityRole="radiogroup" accessibilityLabel="Your arrival estimate">
        {ARRIVAL_ESTIMATE_CHOICES.map((minutes) => {
          const selected = shared?.minutes === minutes;
          const busy = sending === minutes;
          return (
            <Pressable
              key={minutes}
              onPress={() => void share(minutes)}
              disabled={sending !== null}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: sending !== null }}
              accessibilityLabel={`Arriving in ${minutes} minutes`}
              accessibilityHint="Tells the host and the group now"
              className={
                selected
                  ? "min-h-11 flex-1 flex-row items-center justify-center gap-1 rounded-field bg-accent"
                  : "min-h-11 flex-1 items-center justify-center rounded-field border border-outline bg-surface"
              }
              style={({ pressed }) => (pressed || busy ? { opacity: 0.6 } : undefined)}
            >
              {selected ? <Check size={14} color={colors.accentOn} strokeWidth={2.5} /> : null}
              <Text className={selected ? "text-caption font-bold text-accent-on" : "text-caption font-bold text-text-primary"}>
                {`${minutes} min`}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <View className="flex-row items-start gap-2" accessibilityRole="alert">
          <View className="pt-0.5">
            <CircleX size={16} color={colors.error} strokeWidth={2} />
          </View>
          <Text className="min-w-0 flex-1 text-caption text-error">{error}</Text>
        </View>
      ) : (
        <Text className="text-caption text-text-secondary" accessibilityLiveRegion="polite">
          {sending !== null
            ? "Sending…"
            : shared
              ? `The group sees about ${clock ?? `${shared.minutes} minutes`}. Running late? Tap a new time.`
              : routeMinutes
                ? `Your own estimate. The map says about ${routeMinutes} min of riding.`
                : "Your own estimate. The group gets one notice."}
        </Text>
      )}
    </View>
  );
}
