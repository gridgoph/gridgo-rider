import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { AddressStop } from "@/components/AddressStop";
import { EmptyState } from "@/components/EmptyState";
import { InlineNotice } from "@/components/InlineNotice";
import { LocationSharingBanner } from "@/components/LocationSharingBanner";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SpecRow } from "@/components/SpecRow";
import { StatusChip } from "@/components/StatusChip";
import { TripMap } from "@/components/TripMap";
import { TripTimeline } from "@/components/TripTimeline";
import { useLocationSharing } from "@/hooks/useLocationSharing";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useRiderLocation } from "@/hooks/useRiderLocation";
import { useRoute } from "@/hooks/useRoute";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { classifyLocation } from "@/lib/locationFreshness";
import { routeSummaryLabel } from "@/lib/osrm";
import {
  activeStopKind,
  codAmountDueMinor,
  dropoffLabel,
  formatTimelineAt,
  orderStateChip,
  pickupLabel,
  primaryActionLabel,
  selectActiveTrip,
  stopLatLng,
  tripPhase,
  zoneLabel,
} from "@/lib/riderOrder";
import { exceptionSummary, useTripProof } from "@/store/tripProof";
import { useSession } from "@/store/session";

/** How often the position age on screen is recomputed. */
const FRESHNESS_TICK_MS = 5_000;

/**
 * The trip in hand.
 *
 * Map first, then what the job is, then where it is going, then the one thing
 * to do next. Every proof step is its own pushed screen, so this screen never
 * grows a second yellow button or asks for anything.
 */
export default function ActiveScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  const { user } = useSession();

  const [trip, setTrip] = useState<api.Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  const hydrate = useTripProof((state) => state.hydrate);
  const recordReturned = useTripProof((state) => state.recordReturned);
  const clearException = useTripProof((state) => state.clearException);
  const exceptions = useTripProof((state) => state.exceptions);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const exception = trip ? (exceptions[trip.id] ?? null) : null;
  const phase = tripPhase(trip, exceptionSummary(exception));
  const pickup = stopLatLng(trip?.pickup);
  const dropoff = stopLatLng(trip?.dropoff);
  const heading = activeStopKind(phase);

  // Route to the stop the rider is actually heading to, so a package on its way
  // back to the shop is not drawn as a delivery.
  const { route } = useRoute({
    from: heading === "pickup" ? dropoff : pickup,
    to: heading === "pickup" ? pickup : dropoff,
    enabled: Boolean(trip),
  });

  const needsGps = focused && Boolean(trip) && phase !== "complete" && phase !== "idle";
  const riderLocation = useRiderLocation({ enabled: needsGps });

  const { sharing } = useLocationSharing({
    orderId: trip?.id ?? null,
    state: trip?.state ?? null,
    coords: riderLocation.coords,
    accuracy: riderLocation.accuracy,
    enabled: focused,
  });

  // A fix does not go stale because something re-rendered, so its age is on its
  // own clock.
  useEffect(() => {
    if (!needsGps) return;
    const handle = setInterval(() => setNow(Date.now()), FRESHNESS_TICK_MS);
    return () => clearInterval(handle);
  }, [needsGps]);

  const freshness = useMemo(
    () =>
      needsGps
        ? classifyLocation({
            fixAtMs: riderLocation.fixAtMs,
            nowMs: now,
            permission: riderLocation.permission,
            accuracyMetres: riderLocation.accuracy,
          })
        : null,
    [needsGps, riderLocation.fixAtMs, riderLocation.permission, riderLocation.accuracy, now],
  );

  const reload = useCallback(
    async (mode: "load" | "refresh" = "load") => {
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);
      try {
        const orders = await api.listOrders();
        setTrip(user ? selectActiveTrip(orders, user.id) : null);
        setError(null);
      } catch (e) {
        setError(
          api.apiErrorMessage(
            e,
            "Could not load your trip. Check your connection and pull down to try again.",
          ),
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user],
  );

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      void reload();
      return () => setFocused(false);
    }, [reload]),
  );

  function openPrimary() {
    if (!trip) return;
    const params = { orderId: trip.id };
    switch (phase) {
      case "pickup":
        router.push({ pathname: "/trip/pickup", params });
        return;
      case "start_delivery":
        void startDelivery();
        return;
      case "collect_cod":
        router.push({ pathname: "/trip/cod", params });
        return;
      case "delivery_proof":
        router.push({ pathname: "/trip/delivery", params });
        return;
      case "returning":
        void confirmHandback();
        return;
      default:
    }
  }

  async function startDelivery() {
    if (!trip) return;
    setBusy(true);
    setError(null);
    try {
      setTrip(await api.transitionOrder(trip.id, "out_for_delivery"));
    } catch (e) {
      setError(api.apiErrorMessage(e, "Could not start the delivery. Pull down and try again."));
    } finally {
      setBusy(false);
    }
  }

  async function confirmHandback() {
    if (!trip) return;
    setBusy(true);
    setError(null);
    try {
      const { proof } = await api.submitProof(trip.id, {
        kind: "failure",
        reason: "returned",
        note: `Package handed back to ${pickupLabel(trip)}`,
      });
      recordReturned(trip.id, proof.at);
    } catch (e) {
      setError(
        api.apiErrorMessage(
          e,
          "The handover was not recorded. Try again before you leave the shop.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  const chip = trip ? orderStateChip(trip.state) : null;
  const cta = primaryActionLabel(phase);
  const lastAttempt = exception?.attempts.at(-1) ?? null;

  return (
    <SafeAreaView className="gg-screen" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-12"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void reload("refresh")}
            tintColor={colors.textMuted}
          />
        }
      >
        {trip ? (
          <View className="px-4 pt-3" style={{ height: 280 }}>
            <TripMap
              pickup={pickup}
              dropoff={dropoff}
              pickupLabel={pickupLabel(trip)}
              dropoffLabel={dropoffLabel(trip)}
              routeCoordinates={route?.coordinates ?? []}
              routeUnavailable={Boolean(route && !route.routed)}
              rider={riderLocation.coords}
            />
          </View>
        ) : null}

        <View className="gg-page gap-8 pt-6">
          <View className="gap-2">
            <Text className="text-h1 text-text-primary">Active trip</Text>
            {trip && route && heading ? (
              <Text className="text-body-lg text-text-secondary">
                {phase === "returning"
                  ? "Back to the shop"
                  : heading === "pickup"
                    ? "To the shop"
                    : "To the client"}{" "}
                · {routeSummaryLabel(route)}
              </Text>
            ) : null}
          </View>

          {error ? (
            <InlineNotice
              tone="error"
              icon="circle-x"
              title="Your trip did not load"
              body={error}
              actionLabel="Try again"
              onAction={() => void reload()}
            />
          ) : null}

          {loading && !trip ? (
            <View className="items-center gap-3 pt-6">
              <ActivityIndicator color={colors.textMuted} />
              <Text className="text-body text-text-muted">Loading your trip…</Text>
            </View>
          ) : null}

          {!loading && !trip ? (
            <EmptyState
              title="No trip in hand"
              body="Accept an offer to start earning. Each offer shows the route, the distance, and the fee before you commit."
              actionLabel="Browse offers"
              onAction={() => router.push("/(tabs)/offers")}
            />
          ) : null}

          {trip ? (
            <>
              {route?.statusLabel ? (
                <InlineNotice
                  tone="neutral"
                  icon="info"
                  title="Routing unavailable"
                  body={`${route.statusLabel} The addresses below are what to follow.`}
                />
              ) : null}

              <LocationSharingBanner sharing={sharing} freshness={freshness} />

              {/* The job */}
              <View className="gap-4">
                <View className="flex-row items-start justify-between gap-3">
                  <Text className="min-w-0 flex-1 text-h2 text-text-primary">{trip.title}</Text>
                  {chip ? (
                    <StatusChip tone={chip.tone} label={chip.label} icon={chip.icon} />
                  ) : null}
                </View>

                <View className="gg-card-flush px-4">
                  <SpecRow label="Size" value={trip.size} />
                  <SpecRow label="Material" value={trip.material} />
                  <SpecRow label="Quantity" value={String(trip.quantity)} />
                  <SpecRow label="Zone" value={zoneLabel(trip.zone)} />
                  {trip.paymentMethod === "cod" ? (
                    <SpecRow
                      label="Cash to collect"
                      value={api.formatPhp(codAmountDueMinor(trip))}
                      last
                    />
                  ) : (
                    <SpecRow label="Payment" value="Already paid" last />
                  )}
                </View>
              </View>

              {/* Where */}
              <View className="gap-2">
                <AddressStop
                  kind="pickup"
                  address={pickupLabel(trip)}
                  detail={
                    heading === "pickup" && phase === "returning"
                      ? "Hand the package back here"
                      : "Collect the finished job"
                  }
                  zone={zoneLabel(trip.zone)}
                  active={heading === "pickup"}
                />
                <AddressStop
                  kind="dropoff"
                  address={dropoffLabel(trip)}
                  zone={zoneLabel(trip.zone)}
                  active={heading === "dropoff"}
                />
              </View>

              {lastAttempt ? (
                <InlineNotice
                  tone="warning"
                  icon="triangle-alert"
                  title={
                    exception && exception.attempts.length > 1
                      ? `${exception.attempts.length} failed attempts recorded`
                      : "Failed attempt recorded"
                  }
                  body={`${lastAttempt.note} · ${formatTimelineAt(lastAttempt.at)}. Kept on this phone; Operations has the report.`}
                />
              ) : null}

              {/* The one thing to do next */}
              <Animated.View
                key={phase}
                entering={reducedMotion ? undefined : FadeIn.duration(200)}
                className="gap-3"
              >
                {cta ? (
                  <PrimaryButton
                    label={busy ? "Working…" : cta}
                    onPress={openPrimary}
                    disabled={busy}
                    size="large"
                  />
                ) : null}

                {phase === "delivery_proof" || phase === "collect_cod" ? (
                  <SecondaryButton
                    label="Report a failed attempt"
                    onPress={() =>
                      router.push({ pathname: "/trip/failed", params: { orderId: trip.id } })
                    }
                    disabled={busy}
                  />
                ) : null}

                {phase === "returning" ? (
                  <SecondaryButton
                    label="The client can take it after all"
                    onPress={() => clearException(trip.id)}
                    disabled={busy}
                  />
                ) : null}

                {phase === "returned" ? (
                  <InlineNotice
                    tone="success"
                    icon="circle-check"
                    title={`Package handed back to ${pickupLabel(trip)}`}
                    body="Operations reschedules this delivery from here. You are free to take the next offer."
                    actionLabel="Browse offers"
                    onAction={() => router.push("/(tabs)/offers")}
                  />
                ) : null}

                {phase === "complete" ? (
                  <InlineNotice
                    tone="success"
                    icon="circle-check"
                    title="Delivered"
                    body="The client has 24 hours to raise an issue. Nothing else is needed from you."
                    actionLabel="Browse offers"
                    onAction={() => router.push("/(tabs)/offers")}
                  />
                ) : null}
              </Animated.View>

              <View className="gap-4">
                <Text className="text-overline text-text-muted">HISTORY</Text>
                <TripTimeline timeline={trip.timeline} selfId={user?.id} />
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
