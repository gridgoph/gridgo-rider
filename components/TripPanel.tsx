import { useRouter } from "expo-router";
import { ChevronRight, CircleAlert, CircleCheck, CircleX, Clock, TriangleAlert } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { ContactBar } from "@/components/ContactBar";
import { BackupReceiverRow } from "@/components/BackupReceiverRow";
import { EarningAmount } from "@/components/EarningAmount";
import { GroupArrivalEstimate } from "@/components/GroupArrivalEstimate";
import { GroupOrderTag } from "@/components/GroupOrderTag";
import { useGroupBackup } from "@/hooks/useGroupBackup";
import { groupOrderOf } from "@/lib/groupOrder";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { useThemeColors } from "@/hooks/useTheme";
import type { Order } from "@/lib/api";
import type { LocationFreshness } from "@/lib/locationFreshness";
import { navigationHandoff } from "@/lib/mapsNavigation";
import { signOffPrompt, owesSignOff, type TripPhase } from "@/lib/riderOrder";
import { riderPay } from "@/lib/riderPay";
import type { TripChatParty } from "@/lib/tripChat";
import type { NextStop } from "@/lib/tripNav";
import type { CashStage } from "@/lib/cash";
import { tripStepNote, type TripStepAction, type TripStepKey } from "@/lib/tripSteps";

type Props = {
  trip: Order;
  phase: TripPhase;
  step: TripStepKey | "done";
  action: TripStepAction;
  /** Where the rider rides next, or null once nothing is left to ride to. */
  stop: NextStop | null;
  /** "2.4 km · 9 min", or a state such as "Waiting for GPS". */
  routeSummary: string | null;
  /** How old the position on the map is (`classifyLocation`); never a dot without its age. */
  position?: LocationFreshness | null;
  busy: boolean;
  error: string | null;
  onAction: () => void;
  onDone: () => void;
  /** Where a cash job's money stands; `none` for every other job. */
  cash?: CashStage;
  /** The map router's road time to the next stop, when it has one. */
  routeSeconds?: number | null;
};

/**
 * The job in hand, under the thumb, over the map.
 *
 * Three things, in this order: where the rider is going and what happens
 * there; the people and tools for that stop (navigate, call, message, report a
 * problem); and the one yellow button that moves the trip on. Everything else
 * about the job — artwork, specs, history — is one tap away on Trip details,
 * so this panel stays short enough to leave the map readable.
 */
export function TripPanel({
  trip,
  phase,
  step,
  action,
  stop,
  routeSummary,
  position = null,
  busy,
  error,
  onAction,
  onDone,
  cash = "none",
  routeSeconds = null,
}: Props) {
  const router = useRouter();
  const colors = useThemeColors();
  const note = tripStepNote(trip, phase, step, cash);
  const signOff = owesSignOff(trip) ? signOffPrompt(trip) : null;
  const backup = useGroupBackup(step === "done" ? null : trip);
  const backupOpen = backup.load.status === "ready" && backup.load.backup.unlocked;

  if (step === "done") {
    return (
      <View className="gap-4 rounded-t-card border border-b-0 border-outline bg-surface px-4 pb-4 pt-4" testID="trip-panel">
        <View className="flex-row items-center gap-2" accessibilityRole="alert">
          <CircleCheck size={22} color={colors.success} strokeWidth={2} />
          <Text className="text-h3 text-text-primary">{note}</Text>
        </View>
        {/* A cash no-show earns nothing yet: the fare follows the client's repayment. */}
        {cash === "returned" ? null : (
          <View className="gap-1">
            <Text className="text-caption text-text-secondary">You earned</Text>
            <EarningAmount minor={riderPay(trip).earnedMinor} size="h1" className="self-start" />
          </View>
        )}
        <PrimaryButton label="Back to the map" onPress={onDone} size="large" />
      </View>
    );
  }

  const party: TripChatParty = stop?.kind === "shop" ? "shop" : "client";
  const directions = stop?.point ? navigationHandoff(stop.point) : null;

  return (
    <View className="gap-4 rounded-t-card border border-b-0 border-outline bg-surface px-4 pb-4 pt-4" testID="trip-panel">
      <View className="gap-1">
        {stop ? (
          <>
            <Text className="text-caption text-text-secondary">
              {stop.kind === "shop" ? "Pick up at" : stop.kind === "office" ? "Drop off at" : "Deliver to"}
            </Text>
            <Text className="text-h3 text-text-primary" numberOfLines={2}>
              {stop.label}
            </Text>
          </>
        ) : null}
        {routeSummary ? <Text className="text-body text-text-secondary">{routeSummary}</Text> : null}
        {position ? <PositionAge position={position} /> : null}
        {note ? <Text className="text-body text-text-secondary">{note}</Text> : null}
        {groupOrderOf(trip) ? (
          <View className="mt-1">
            <GroupOrderTag order={trip} variant="compact" />
          </View>
        ) : null}
      </View>

      {/* Group order only. On the way: one tap tells the group. At the door, or once open: the backup. */}
      {step === "to_client" ? <GroupArrivalEstimate order={trip} routeSeconds={routeSeconds} /> : null}
      {step === "hand_over" || backupOpen ? (
        <BackupReceiverRow order={trip} load={backup.load} onRetry={() => void backup.refresh()} />
      ) : null}

      {signOff ? (
        <View className="gap-1 rounded-field border-2 border-accent p-3">
          <Text className="text-caption text-text-secondary">Say this to the shop before you ride</Text>
          <Text className="text-body-lg font-bold text-text-primary">{signOff}</Text>
        </View>
      ) : null}

      <ContactBar trip={trip} party={party} directions={phase === "pickup_blocked" ? undefined : directions} />

      {error ? (
        <View className="flex-row items-start gap-2" accessibilityRole="alert">
          <View className="pt-0.5">
            <CircleAlert size={16} color={colors.error} strokeWidth={2} />
          </View>
          <Text className="min-w-0 flex-1 text-body text-error">{error}</Text>
        </View>
      ) : null}

      {action.kind === "none" ? (
        <SecondaryButton label="Open my alerts" onPress={() => router.push("/alerts")} size="large" />
      ) : (
        <PrimaryButton label={busy ? "Saving…" : action.label} onPress={onAction} disabled={busy} size="large" />
      )}

      <Pressable
        onPress={() => router.push({ pathname: "/trip/details", params: { orderId: trip.id } })}
        accessibilityRole="button"
        accessibilityLabel="Trip details"
        accessibilityHint="Opens the job, its artwork and its history"
        className="min-h-11 flex-row items-center justify-between"
        testID="trip-details-link"
      >
        <Text className="text-body font-bold text-text-primary">Trip details</Text>
        <ChevronRight size={20} color={colors.textSecondary} strokeWidth={2} />
      </Pressable>
    </View>
  );
}

const POSITION_ICONS = {
  "circle-check": CircleCheck,
  "triangle-alert": TriangleAlert,
  clock: Clock,
  "circle-x": CircleX,
} as const;

/**
 * The fix's age beside the route it feeds. Icon + words + colour, so a stale
 * position reads in grayscale; the words stay on text tokens because the
 * warning hue fails contrast as small text on a Light surface.
 */
function PositionAge({ position }: { position: LocationFreshness }) {
  const colors = useThemeColors();
  const Icon = POSITION_ICONS[position.icon];
  const tint =
    position.tone === "success" ? colors.success : position.tone === "warning" ? colors.warning : colors.textMuted;
  const degraded = position.level === "stale" || position.level === "off";
  return (
    <View
      className="flex-row items-start gap-2"
      testID="trip-position-age"
      accessibilityRole={degraded ? "alert" : "text"}
      accessibilityLiveRegion={degraded ? "polite" : "none"}
    >
      <View className="pt-0.5">
        <Icon size={16} color={tint} strokeWidth={2} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className={degraded ? "text-body font-bold text-text-primary" : "text-body text-text-secondary"}>
          {position.label}
        </Text>
        {degraded && position.detail ? (
          <Text className="text-body text-text-secondary">{position.detail}</Text>
        ) : null}
      </View>
    </View>
  );
}
