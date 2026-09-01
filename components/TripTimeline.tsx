import { Text, View } from "react-native";

import type { Order } from "@/lib/api";
import {
  formatTimelineAt,
  orderStateLabel,
  sortTimelineNewestFirst,
  timelineActorLabel,
} from "@/lib/riderOrder";

type Props = {
  timeline: Order["timeline"];
  selfId?: string | null;
};

/**
 * Accountability for a job: who moved it, when, and to what state.
 *
 * Newest first. A rider opening HISTORY needs the current status at the top,
 * not after a scroll through older events. The filled accent dot is the latest
 * row — the one you see first — and the rail still runs down through older
 * events so the trail reads as one log.
 */
export function TripTimeline({ timeline, selfId }: Props) {
  if (!timeline.length) {
    return (
      <Text className="text-body text-text-muted">No history yet for this job.</Text>
    );
  }

  const rows = sortTimelineNewestFirst(timeline);

  return (
    <View className="gap-0">
      {rows.map((entry, index) => {
        const isLatest = index === 0;
        const isOldest = index === rows.length - 1;
        const label = orderStateLabel(entry.state);
        return (
          <View key={`${entry.at}-${entry.state}-${index}`} className="flex-row gap-3">
            <View className="items-center">
              <View
                testID={isLatest ? "timeline-current-dot" : undefined}
                className={
                  isLatest
                    ? "mt-1.5 h-2.5 w-2.5 rounded-pill bg-accent"
                    : "mt-1.5 h-2.5 w-2.5 rounded-pill border border-outline bg-surface"
                }
              />
              {!isOldest ? <View className="w-px flex-1 bg-outline" /> : null}
            </View>
            <View
              className={`min-w-0 flex-1 ${isOldest ? "pb-0" : "pb-4"}`}
              accessibilityLabel={isLatest ? `${label}, current status` : label}
            >
              <Text className="text-body text-text-primary">{label}</Text>
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
