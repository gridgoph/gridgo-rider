import { Text, View } from "react-native";

import type { Order } from "@/lib/api";
import {
  formatTimelineAt,
  orderStateLabel,
  timelineActorLabel,
} from "@/lib/riderOrder";

type Props = {
  timeline: Order["timeline"];
  selfId?: string | null;
};

/**
 * Chronological accountability: who moved the job, when, and to what state.
 * Ordering is causal, so timestamps and actors are required — not decoration.
 */
export function TripTimeline({ timeline, selfId }: Props) {
  if (!timeline.length) {
    return (
      <Text className="text-body text-text-muted">No history yet for this job.</Text>
    );
  }

  // API stores oldest-first; show oldest at top so the story reads down.
  const rows = [...timeline];

  return (
    <View className="gap-0">
      {rows.map((entry, index) => {
        const isLast = index === rows.length - 1;
        return (
          <View key={`${entry.at}-${entry.state}-${index}`} className="flex-row gap-3">
            <View className="items-center">
              <View
                className={
                  isLast
                    ? "mt-1.5 h-2.5 w-2.5 rounded-pill bg-accent"
                    : "mt-1.5 h-2.5 w-2.5 rounded-pill border border-outline bg-surface"
                }
              />
              {!isLast ? <View className="w-px flex-1 bg-outline" /> : null}
            </View>
            <View className={`min-w-0 flex-1 ${isLast ? "pb-0" : "pb-4"}`}>
              <Text className="text-body text-text-primary">
                {orderStateLabel(entry.state)}
              </Text>
              <Text className="mt-0.5 text-caption text-text-muted">
                {timelineActorLabel(entry.by, selfId)} · {formatTimelineAt(entry.at)}
              </Text>
              {entry.note ? (
                <Text className="mt-1 text-caption text-text-secondary">{entry.note}</Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
