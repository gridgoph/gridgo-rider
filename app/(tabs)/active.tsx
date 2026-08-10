import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { AlertsButton } from "@/components/AlertsButton";
import { EmptyState } from "@/components/EmptyState";
import { InlineNotice } from "@/components/InlineNotice";
import { Screen } from "@/components/Screen";
import { ActiveTripSkeleton } from "@/components/SkeletonScreens";
import { LocationSharingBanner } from "@/components/LocationSharingBanner";
import { NextStopCard } from "@/components/NextStopCard";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SpecRow } from "@/components/SpecRow";
import { StatusChip } from "@/components/StatusChip";
import { TripMap } from "@/components/TripMap";
import { TripTimeline } from "@/components/TripTimeline";
import { useLocationSharing } from "@/hooks/useLocationSharing";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useRiderAction } from "@/hooks/useRiderAction";
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
  stopLatLng,
  zoneLabel,
} from "@/lib/riderOrder";
import { useActiveTrip } from "@/store/activeTrip";
import { useSession } from "@/store/session";
import { useTripProof } from "@/store/tripProof";

/** How often the position age on screen is recomputed. */
const FRESHNESS_TICK_MS = 5_000;

/** Map height on the trip screen — enough to orient, not enough to bury the job. */
const MAP_HEIGHT = 200;

/**
 * The trip in hand.
 *
 * Reading order is the order a rider needs it in: where you are going, how far,
 * the step that gets it done, then the map, then what the job is, then its
 * history. The step used to sit under a spec table and a pair of address
 * cards, which put the one control that matters below the fold on every phone.
 *
 * Every proof step is its own pushed screen, so this screen never grows a
 * second yellow button and never asks for anything.
 */
export default function ActiveScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  const user = useSession((s) => s.user);

  const trip = useActiveTrip((s) => s.order);
  const loaded = useActiveTrip((s) => s.loaded);
  const tripError = useActiveTrip((s) => s.error);
  const refreshTrip = useActiveTrip((s) => s.refresh);
  const setOrder = useActiveTrip((s) => s.setOrder);

  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [focused, setFocused] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  const clearException = useTripProof((state) => state.clearException);
  const exceptions = useTripProof((state) => state.exceptions);

  const { phase } = useRiderAction();
  const exception = trip ? (exceptions[trip.id] ?? null) : null;
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
      await refreshTrip(user?.id ?? null, mode);
    },
    [refreshTrip, user?.id],
  );

  /*
    `refreshing` belongs to the pull gesture and nothing else. Driving it from
    the focus effect spun the pull-to-refresh control every time the rider
    tapped this tab — a spinner appearing over the title, under a thumb that
    never pulled anything. The re-fetch on focus still happens; it just does it
    quietly, behind the trip already on screen.
  */
  const pullToRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await reload("refresh");
    } finally {
      setRefreshing(false);
    }
  }, [reload]);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      void reload("refresh");
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
        router.push({ pathname: "/trip/start", params });
        return;
      case "collect_cod":
        router.push({ pathname: "/trip/cod", params });
        return;
      case "delivery_proof":
        router.push({ pathname: "/trip/delivery", params });
        return;
      case "returning":
        router.push({ pathname: "/trip/handback", params });
        return;
      default:
    }
  }

  async function undoReturn() {
    if (!trip) return;
    setBusy(true);
    setActionError(null);
    try {
      clearException(trip.id);
      setOrder(await api.getOrder(trip.id));
    } catch (e) {
      setActionError(
        api.apiErrorMessage(e, "The job did not refresh. Pull down and try again."),
      );
    } finally {
      setBusy(false);
    }
  }

  const chip = trip ? orderStateChip(trip.state) : null;
  const cta = primaryActionLabel(phase);
  const lastAttempt = exception?.attempts.at(-1) ?? null;
  const stopAddress = trip
    ? heading === "pickup"
      ? pickupLabel(trip)
      : dropoffLabel(trip)
    : "";
  const stopHeading =
    phase === "returning"
      ? "Take the package back to the shop it came from"
      : heading === "pickup"
        ? "Collect the finished job from the counter"
        : "Hand the package to the client";

  return (
    <Screen edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="gg-page gap-6 pb-8 pt-3"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void pullToRefresh()}
            tintColor={colors.textMuted}
          />
        }
      >
        <ScreenHeader
          title="Active trip"
          /*
            Only once the answer is in. While the job is still loading there is
            no basis for saying nothing is in hand — and saying it anyway, over
            a skeleton of the trip that is about to appear, is the screen
            contradicting itself.
          */
          subtitle={loaded && !trip ? "Nothing with you right now." : null}
          action={<AlertsButton />}
        />

        {tripError ? (
          <InlineNotice
            tone="error"
            icon="circle-x"
            title="Your trip did not load"
            body={tripError}
            actionLabel="Try again"
            onAction={() => void reload()}
          />
        ) : null}

        {!loaded && !trip ? <ActiveTripSkeleton /> : null}

        {loaded && !trip && !tripError ? (
          <EmptyState
            icon="trip"
            title="No job in hand"
            body="Accept an offer and it appears here with the route, the stops, and every step you need to close it."
            actionLabel="Browse offers"
            onAction={() => router.push("/(tabs)/offers")}
            /*
              Quiet on purpose: the raised disc below already offers this exact
              move in yellow, and the same action twice in the same colour makes
              both of them ordinary.
            */
            secondaryAction
          />
        ) : null}

        {trip ? (
          <>
            {heading ? (
              <NextStopCard
                kind={heading}
                heading={stopHeading}
                address={stopAddress}
                routeSummary={route ? routeSummaryLabel(route) : "Measuring the route…"}
                zone={zoneLabel(trip.zone)}
              />
            ) : null}

            {/*
              The step sits directly under where the rider is going, above the
              fold on every phone. It is deliberately NOT pinned above the tab
              bar: the raised disc already carries this same action from every
              screen, and stacking two yellows an inch apart makes both quieter.
            */}
            {cta ? (
              <Animated.View
                key={phase}
                entering={reducedMotion ? undefined : FadeIn.duration(200)}
                className="gap-2"
              >
                <PrimaryButton
                  label={busy ? "Working…" : cta}
                  onPress={openPrimary}
                  disabled={busy}
                  size="large"
                />
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
                    onPress={() => void undoReturn()}
                    disabled={busy}
                  />
                ) : null}
              </Animated.View>
            ) : null}

            <View style={{ height: MAP_HEIGHT }}>
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

            {route?.statusLabel ? (
              <Text className="text-caption text-text-muted">
                {route.statusLabel} Follow the addresses below.
              </Text>
            ) : null}

            <LocationSharingBanner sharing={sharing} freshness={freshness} />

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

            {actionError ? (
              <InlineNotice tone="error" icon="circle-x" title="That did not go through" body={actionError} />
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

            {/* The job itself — reference, not the headline. */}
            <View className="gap-3">
              <View className="flex-row items-start justify-between gap-3">
                <Text className="min-w-0 flex-1 text-h3 text-text-primary">{trip.title}</Text>
                {chip ? <StatusChip tone={chip.tone} label={chip.label} icon={chip.icon} /> : null}
              </View>

              <View className="gg-card-flush px-4">
                <SpecRow label="Size" value={trip.size} />
                <SpecRow label="Material" value={trip.material} />
                <SpecRow label="Quantity" value={String(trip.quantity)} />
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

            <View className="gap-3">
              <Text className="text-overline text-text-muted">HISTORY</Text>
              <TripTimeline timeline={trip.timeline} selfId={user?.id} />
            </View>
          </>
        ) : null}
      </ScrollView>

    </Screen>
  );
}
