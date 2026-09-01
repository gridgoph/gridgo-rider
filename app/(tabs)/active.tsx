import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Dimensions, RefreshControl, ScrollView, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { AlertsButton } from "@/components/AlertsButton";
import { ApprovalChip } from "@/components/ApprovalChip";
import { ApprovalNotice } from "@/components/ApprovalNotice";
import { EmptyState } from "@/components/EmptyState";
import { InlineNotice } from "@/components/InlineNotice";
import { Screen } from "@/components/Screen";
import { ActiveTripSkeleton } from "@/components/SkeletonScreens";
import { LocationSharingBanner } from "@/components/LocationSharingBanner";
import { NextStopCard } from "@/components/NextStopCard";
import { PrimaryButton } from "@/components/PrimaryButton";
import { PushEnableCard } from "@/components/PushEnableCard";
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
import { useSnappedOrigin } from "@/hooks/useSnappedOrigin";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { classifyLocation } from "@/lib/locationFreshness";
import { routeSummaryLabel } from "@/lib/osrm";
import { checklistSummary } from "@/lib/pickupChecklist";
import { approvalPresentation } from "@/lib/riderApproval";
import {
  endsAtOffice,
  issueWindowLabel,
  orderStateChip,
  owesSignOff,
  primaryActionLabel,
  signOffPrompt,
  zoneLabel,
} from "@/lib/riderOrder";
import { nextStop, tripDestination, tripShop } from "@/lib/tripNav";
import { useActiveTrip } from "@/store/activeTrip";
import { useSession } from "@/store/session";

/** How often the position age on screen is recomputed. */
const FRESHNESS_TICK_MS = 5_000;

/**
 * Map height on the trip screen.
 *
 * Most of the screen, because a rider on the road is reading the map and
 * glancing at the job, not the other way round. At 268 it was a strip: enough
 * to see a line, not enough to see the turn coming, and too small to pinch
 * without fighting the page scrolling underneath it.
 *
 * Bounded so it cannot swallow the whole screen on a tall phone — the job's
 * next action has to stay reachable without scrolling.
 */
const MAP_HEIGHT = Math.min(520, Math.max(320, Math.round(Dimensions.get("window").height * 0.52)));

/**
 * The trip in hand.
 *
 * Reading order is the order a rider needs it in: where you are going, how far,
 * the step that gets it done, then the map, then what the job is, then its
 * history. Every proof step is its own pushed screen, so this screen never
 * grows a second yellow button and never asks for anything.
 *
 * Two states outrank the ladder, and both replace the step rather than sitting
 * beside it: a failed pickup check, where there is no next step until
 * Operations says so, and the spoken sign-off, which the rider owes the
 * supplier before the wheels turn.
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

  const [refreshing, setRefreshing] = useState(false);
  const [focused, setFocused] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [issueWindowHours, setIssueWindowHours] = useState<number | null>(null);

  const approval = approvalPresentation(user);
  const { phase } = useRiderAction();
  const shop = trip ? tripShop(trip) : null;
  const destination = trip ? tripDestination(trip) : null;
  const heading = trip ? nextStop(trip, phase) : null;

  const needsGps = focused && Boolean(trip) && phase !== "complete" && phase !== "idle";
  const riderLocation = useRiderLocation({ enabled: needsGps });
  const routeFrom = useSnappedOrigin(riderLocation.coords);

  const { route } = useRoute({
    from: routeFrom,
    to: heading?.point ?? null,
    enabled: Boolean(trip) && Boolean(heading?.point) && Boolean(routeFrom),
  });

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

  // The issue window is one global setting Operations can change without a
  // release, so the length is read rather than written into the copy.
  useEffect(() => {
    let cancelled = false;
    void api
      .getSettings()
      .then((settings) => {
        if (!cancelled) setIssueWindowHours(settings.issueWindowHours);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

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
      case "pickup_checks":
        router.push({ pathname: "/trip/pickup", params });
        return;
      case "start_delivery":
        router.push({ pathname: "/trip/start", params });
        return;
      case "delivery_proof":
        router.push({ pathname: "/trip/delivery", params });
        return;
      default:
    }
  }

  const chip = trip ? orderStateChip(trip) : null;
  const cta = primaryActionLabel(phase, trip ? endsAtOffice(trip) : false);
  const signOff = trip && owesSignOff(trip) ? signOffPrompt(trip) : null;

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
          subtitle={approval.canWork && loaded && !trip ? "Nothing with you right now." : null}
          status={<ApprovalChip />}
          action={<AlertsButton />}
        />

        {!approval.canWork ? <ApprovalNotice /> : null}

        <PushEnableCard />

        {approval.canWork ? (
          <>
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
              />
            ) : null}
          </>
        ) : null}

        {trip && approval.canWork ? (
          <>
            {heading ? (
              <NextStopCard
                kind={heading.cardKind}
                heading={heading.heading}
                address={heading.label}
                overline={heading.overline}
                routeSummary={
                  !routeFrom
                    ? "Finding your position…"
                    : route
                      ? routeSummaryLabel(route)
                      : "Measuring the route…"
                }
                zone={zoneLabel(trip.zone)}
              />
            ) : null}

            {/*
              Transport is refused, so the step is refused with it. A yellow
              button here would be the app offering a move the business has
              already stopped.
            */}
            {phase === "pickup_blocked" ? (
              <InlineNotice
                tone="error"
                icon="circle-x"
                title="Do not transport this package"
                body={`${checklistSummary(trip) ?? "A pickup check failed."} GRIDGO has logged it against the supplier and raised it with the founder. Leave the package at the shop and wait — you will get an alert here with what to do next.`}
              />
            ) : null}

            {/*
              The step sits directly under where the rider is going, above the
              fold on every phone. Status is the chip; this button is the move.
            */}
            {cta ? (
              <Animated.View
                key={phase}
                entering={reducedMotion ? undefined : FadeIn.duration(200)}
                className="gap-2"
              >
                <PrimaryButton label={cta} onPress={openPrimary} size="large" />
              </Animated.View>
            ) : null}

            {/*
              The trained sign-off, for as long as it is owed. Not a phase: no
              server record clears it, and a step only this phone could tick
              would sit there forever.
            */}
            {signOff ? (
              <View className="gap-3 rounded-card border-2 border-accent bg-surface p-4">
                <Text className="text-overline text-text-muted">
                  SAY THIS TO THE SUPPLIER BEFORE YOU RIDE
                </Text>
                <Text className="text-h3 text-text-primary">{signOff}</Text>
                <SecondaryButton
                  label="Show me the checkpoint again"
                  onPress={() =>
                    router.push({ pathname: "/trip/sign-off", params: { orderId: trip.id } })
                  }
                />
              </View>
            ) : null}

            {/*
              A picture of the trip with one control on it. A map inside a
              scrolling page can never really be panned — the page underneath
              claims the drag, and a rider trying to look one street ahead
              scrolls the job instead — so the card does not pretend to be
              driveable. Expand opens it where the gesture is unambiguous.
            */}
            <View style={{ height: MAP_HEIGHT }}>
              <TripMap
                pickup={shop?.point ?? null}
                dropoff={destination?.point ?? null}
                pickupLabel={shop?.label ?? "Shop"}
                dropoffLabel={destination?.label ?? "Client"}
                pickupKind="shop"
                dropoffKind={destination?.kind === "office" ? "office" : "client"}
                focus={heading?.cardKind ?? null}
                routeCoordinates={route?.coordinates ?? []}
                routeUnavailable={Boolean(route && !route.routed)}
                rider={riderLocation.coords}
                riderAccuracy={riderLocation.accuracy}
                riderHeading={riderLocation.heading}
                navTitle={heading?.navTitle ?? null}
                navSummary={
                  !routeFrom
                    ? "Waiting for GPS"
                    : route
                      ? routeSummaryLabel(route)
                      : "Measuring the road…"
                }
                onExpand={() =>
                  router.push({ pathname: "/trip/map", params: { orderId: trip.id } })
                }
              />
            </View>

            {route?.statusLabel ? (
              <Text className="text-caption text-text-muted">
                {route.statusLabel} Follow the addresses below.
              </Text>
            ) : null}

            <LocationSharingBanner sharing={sharing} freshness={freshness} />

            {phase === "complete" ? (
              <InlineNotice
                tone="success"
                icon="circle-check"
                title="Delivered"
                body={`The client has ${issueWindowLabel(issueWindowHours)} to raise an issue. Nothing else is needed from you.`}
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
                <SpecRow label="Your fee" value={api.formatPhp(trip.deliveryFeeMinor)} last />
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
