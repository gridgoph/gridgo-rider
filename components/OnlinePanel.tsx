import { Circle, CircleDot } from "lucide-react-native";
import { Text, View } from "react-native";

import { OnlineSwitch } from "@/components/OnlineSwitch";
import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  online: boolean;
  /** Operations has approved the account; nothing can be offered before. */
  canWork: boolean;
  /** An offer is reserved for this rider while they are offline. */
  offerWaiting: boolean;
  /** "Dispatch opens at 8:00 AM", while GRIDGO is closed. */
  closedLine: string | null;
  /** What happened to the last offer, said once: timed out or declined. */
  lastOutcome: string | null;
  /** Why the offers did not load, with the retry beside it. */
  loadError: string | null;
  onToggle: () => void;
};

/**
 * The bottom of the map with no job in hand: whether this rider is online,
 * and the switch that changes it.
 *
 * The switch only changes what this phone shows. GRIDGO's offers follow its
 * own rotation, so an offer can still be reserved for a rider who is offline
 * here — and the panel says so, rather than letting it time out unseen.
 */
export function OnlinePanel({ online, canWork, offerWaiting, closedLine, lastOutcome, loadError, onToggle }: Props) {
  const colors = useThemeColors();
  const title = !canWork ? "Not taking jobs yet" : online ? "You're online" : "You're offline";
  const body = !canWork
    ? "Offers open once Operations approves your account."
    : loadError
      ? loadError
      : online
        ? closedLine
          ? `${closedLine} Offers appear here then.`
          : "Waiting for an offer. It appears here with your fee and a countdown."
        : offerWaiting
          ? "An offer is waiting for you. Go online to see it before it times out."
          : "Go online to get delivery offers on the map.";

  return (
    <View className="gap-2 rounded-t-card border border-b-0 border-outline bg-surface px-4 pb-4 pt-3" testID="online-panel">
      <View className="flex-row items-center gap-3">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          {online && canWork ? (
            <CircleDot size={20} color={colors.success} strokeWidth={2.5} />
          ) : (
            <Circle size={20} color={colors.textMuted} strokeWidth={2.5} />
          )}
          <Text className="shrink text-h3 text-text-primary" accessibilityRole="header">
            {title}
          </Text>
        </View>
        <OnlineSwitch online={online && canWork} disabled={!canWork} onToggle={onToggle} />
      </View>
      {lastOutcome ? (
        <Text className="text-body font-bold text-text-primary" accessibilityLiveRegion="polite">
          {lastOutcome}
        </Text>
      ) : null}
      <Text
        className={offerWaiting && !online ? "text-body font-bold text-text-primary" : loadError ? "text-body text-error" : "text-body text-text-secondary"}
      >
        {body}
      </Text>
    </View>
  );
}
