import { useLocalSearchParams } from "expo-router";
import { ScrollView, Text, View } from "react-native";

import { InlineNotice } from "@/components/InlineNotice";
import { OrderStageBar } from "@/components/OrderStageBar";
import { Screen } from "@/components/Screen";
import { PastJobDetailSkeleton } from "@/components/SkeletonScreens";
import { RiderPayRows } from "@/components/RiderPayRows";
import { SpecRow } from "@/components/SpecRow";
import { OrderReference } from "@/components/OrderReference";
import { StatusChip } from "@/components/StatusChip";
import { TripTimeline } from "@/components/TripTimeline";
import { useTripOrder } from "@/hooks/useTripOrder";
import { orderStage } from "@/lib/orderStage";
import {
  dropoffLabel,
  orderStateChip,
  pickupLabel,
} from "@/lib/riderOrder";
import { useSession } from "@/store/session";

/**
 * One accepted job, after the fact: where it ended, how far it got, and the
 * full newest-first trail — the same HISTORY language as the live trip.
 */
export default function PastJobScreen() {
  const user = useSession((s) => s.user);
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const id = typeof orderId === "string" ? orderId : null;
  const { order, loading, error, reload } = useTripOrder(id);

  const chip = order ? orderStateChip(order) : null;
  const progress = order ? orderStage(order) : null;

  return (
    <Screen edges={["bottom"]}>
      <ScrollView className="flex-1" contentContainerClassName="gg-page gap-6 pb-10 pt-4">
        {loading ? <PastJobDetailSkeleton /> : null}

        {!loading && error ? (
          <InlineNotice
            tone="error"
            icon="circle-x"
            title="This job did not load"
            body={error}
            actionLabel="Try again"
            onAction={() => void reload()}
          />
        ) : null}

        {!loading && order ? (
          <>
            <View className="gap-3">
              <View className="flex-row items-start justify-between gap-3">
                <View className="min-w-0 flex-1 gap-1">
                  <Text className="text-h3 text-text-primary">{order.title}</Text>
                  <OrderReference id={order.id} />
                </View>
                {chip ? <StatusChip tone={chip.tone} label={chip.label} icon={chip.icon} /> : null}
              </View>
              <Text className="text-body text-text-secondary">{progress?.summary}</Text>
            </View>

            {progress ? (
              <View className="gg-card">
                <OrderStageBar progress={progress} />
              </View>
            ) : null}

            {order.state === "cancelled" && order.cancellationReason ? (
              <Text className="text-body text-text-secondary">{order.cancellationReason}</Text>
            ) : null}

            <View className="gg-card-flush px-4">
              <SpecRow label="Pickup" value={pickupLabel(order)} />
              <SpecRow label="Drop-off" value={dropoffLabel(order)} />
              {/* A cancelled job paid nothing, so its share is not called earnings. */}
              <RiderPayRows
                order={order}
                label={order.state === "cancelled" ? "Your share" : "You earned"}
                last
              />
            </View>

            <View className="gap-3">
              <Text className="text-overline text-text-muted">HISTORY</Text>
              <TripTimeline timeline={order.timeline} selfId={user?.id} />
            </View>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
