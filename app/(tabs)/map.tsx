import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { LocateFixed, X } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, Text, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AttentionChip } from "@/components/AttentionChip";
import { BrowseMap } from "@/components/BrowseMap";
import { MapStatusStrip } from "@/components/MapStatusStrip";
import { OfferSheet } from "@/components/OfferSheet";
import { OnlinePanel } from "@/components/OnlinePanel";
import { Screen } from "@/components/Screen";
import { StepRail } from "@/components/StepRail";
import { TripMap } from "@/components/TripMap";
import { TripPanel } from "@/components/TripPanel";
import { DAVAO_MAP_CENTER, DAVAO_MAP_ZOOM } from "@/data/placeholderShops";
import { useAttention } from "@/hooks/useAttention";
import { FRESHNESS_TICK_MS, fixNeedsAttention, useTripFixFreshness } from "@/hooks/useTripFixFreshness";
import { useDispatchHours } from "@/hooks/useDispatchHours";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useLocationHealth } from "@/hooks/useLocationHealth";
import { useOrderCash } from "@/hooks/useOrderCash";
import { useReadVersion } from "@/hooks/useReadVersion";
import { useRiderAction } from "@/hooks/useRiderAction";
import { useRiderLocation } from "@/hooks/useRiderLocation";
import { useRoute } from "@/hooks/useRoute";
import { useSnappedOrigin } from "@/hooks/useSnappedOrigin";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { firstOpenView, shopOrderBadges, shopsToMapPlaces, viewOn } from "@/lib/browseMap";
import { directoryShopsFromCatalog, withGridgoOffice, type DirectoryShop } from "@/lib/directoryShops";
import { closedFromRefusal, dispatchClosedSentence } from "@/lib/dispatchHours";
import {
  currentOffer,
  offerFractionLeft,
  offerIdOf,
  offerSecondsLeft,
  serverClockOffsetMs,
} from "@/lib/dispatchOffer";
import type { MapView } from "@/lib/mapHtml";
import { STALE_FIX_MS } from "@/lib/locationFreshness";
import { routeSummaryLabel } from "@/lib/osrm";
import { approvalPresentation } from "@/lib/riderApproval";
import { cashAcceptKey, cashStage, isCashOrder } from "@/lib/cash";
import { summariseEarnings } from "@/lib/riderEarnings";
import { locationAudience, pickupLabel, stopLatLng } from "@/lib/riderOrder";
import { nextStop, tripDestination, tripShop } from "@/lib/tripNav";
import { currentTripStep, tripRail, tripStepAction, TRIP_STEPS } from "@/lib/tripSteps";
import { useActiveTrip } from "@/store/activeTrip";
import { hydrateRiderOnline, setRiderOnline, useIsRiderOnline } from "@/store/riderOnline";
import { askConfirm } from "@/store/sheets";
import { useSession } from "@/store/session";
import { useTripArrivals } from "@/store/tripArrivals";
import { useTripLocation } from "@/store/tripLocation";

/** Fallback offer read while online and idle, under the live invalidations. */
const OFFER_POLL_MS = 15_000;
/** Countdown redraw; under a second so the bar drains smoothly enough. */
const COUNTDOWN_TICK_MS = 500;

const NO_ORDERS: api.Order[] = [];

/**
 * Home: the map, and the whole shift on it.
 *
 * Three shapes on one screen, so a rider never switches tabs mid-delivery:
 *
 *  - **Idle.** Davao with the partner shops (a shop holding this rider's
 *    offer or job wears a count), a recenter control, and a bottom panel with
 *    the online switch.
 *  - **Offer.** One offer at a time over the map (`OfferSheet`): countdown,
 *    the rider's own fee, distance, both stops, the cargo, Decline and Accept.
 *  - **Trip.** The route to the next stop, a four-step rail on top
 *    (`lib/tripSteps.ts`), and the step's one action under the thumb. The tab
 *    bar steps aside (`GridgoTabBar`); every proof step is still its own
 *    pushed screen holding its own server gate.
 *
 * Warnings are one chip (`useAttention`), not cards.
 */
export default function MapHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const user = useSession((s) => s.user);
  const userId = user?.id ?? null;
  const approval = approvalPresentation(user);
  const online = useIsRiderOnline(userId);
  // An offer alert tapped: its sheet opens even while offline (the tap is the ask).
  const params = useLocalSearchParams<{ offer?: string | string[] }>();
  const pushedOffer = typeof params.offer === "string" ? params.offer : null;

  const trip = useActiveTrip((s) => s.order);
  const refreshTrip = useActiveTrip((s) => s.refresh);
  const setOrder = useActiveTrip((s) => s.setOrder);
  const { phase } = useRiderAction();
  const local = useTripArrivals((s) => (trip ? s.byOrder[trip.id] : undefined));
  const markArrival = useTripArrivals((s) => s.mark);
  const step = approval.canWork ? currentTripStep(trip, phase, local) : null;
  const inTrip = step !== null;

  const [focused, setFocused] = useState(true);
  const [offers, setOffers] = useState<api.Order[] | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const [offersError, setOffersError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [offerBusy, setOfferBusy] = useState<"accept" | "decline" | null>(null);
  const [offerError, setOfferError] = useState<string | null>(null);
  const [lastOutcome, setLastOutcome] = useState<string | null>(null);
  const [stepBusy, setStepBusy] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [orders, setOrders] = useState<api.Order[] | null>(null);
  const [shops, setShops] = useState<DirectoryShop[]>(() => withGridgoOffice([]));
  const [view, setView] = useState<MapView | null>(null);
  // A pin tapped on the idle map: its name and address, until closed.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [topHeight, setTopHeight] = useState(0);
  const [bottomHeight, setBottomHeight] = useState(0);
  const acted = useRef(new Set<string>());
  const centeredOnMe = useRef(false);

  useEffect(() => {
    void hydrateRiderOnline();
  }, []);

  const hours = useDispatchHours();
  const { refresh: refreshHours, adopt: adoptHours } = hours;

  const nextOfferRead = useReadVersion();
  const reloadOffers = useCallback(async () => {
    const current = nextOfferRead();
    // Every dispatch route answers 403 before approval: never ask.
    if (!approvalPresentation(useSession.getState().user).canWork) {
      setOffers(NO_ORDERS);
      setOffersError(null);
      return;
    }
    const sentAt = Date.now();
    try {
      const result = await api.listDispatchOffers();
      if (!current()) return;
      // Half the round trip is the best guess at when the server read its clock.
      setClockOffset(serverClockOffsetMs(result.serverTime, (sentAt + Date.now()) / 2));
      setNow(Date.now());
      setOffers(result.offers);
      setOffersError(null);
    } catch (e) {
      if (!current()) return;
      setOffersError(api.apiErrorMessage(e, "Offers did not load. Check this phone's connection."));
    }
  }, [nextOfferRead]);

  const nextOrdersRead = useReadVersion();
  const reloadEarnings = useCallback(async () => {
    const current = nextOrdersRead();
    try {
      const list = await api.listOrders();
      if (current()) setOrders(list);
    } catch {
      // Today's figure stays as it was; Earnings says what failed.
    }
  }, [nextOrdersRead]);

  const nextShopsRead = useReadVersion();
  const reloadShops = useCallback(async () => {
    const current = nextShopsRead();
    try {
      const catalog = await api.listCatalogShops();
      if (current()) setShops(withGridgoOffice(directoryShopsFromCatalog(catalog)));
    } catch {
      // The office pin still draws; the shops come back on the next refresh.
    }
  }, [nextShopsRead]);

  const reloadAll = useCallback(async () => {
    await Promise.all([
      reloadOffers(),
      refreshTrip(userId, "refresh"),
      approval.canWork ? refreshHours() : Promise.resolve(),
      reloadEarnings(),
    ]);
  }, [reloadOffers, refreshTrip, userId, approval.canWork, refreshHours, reloadEarnings]);

  useLiveRefresh(["dispatch", "orders", "identity", "approvals", "settings"], reloadAll);
  useLiveRefresh(["catalog", "availability", "services"], reloadShops);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      void reloadAll();
      void reloadShops();
      return () => setFocused(false);
    }, [reloadAll, reloadShops]),
  );

  // A quiet fallback under the live invalidations while waiting for work.
  useEffect(() => {
    if (!focused || !online || inTrip || !approval.canWork) return;
    const handle = setInterval(() => void reloadOffers(), OFFER_POLL_MS);
    return () => clearInterval(handle);
  }, [focused, online, inTrip, approval.canWork, reloadOffers]);

  const serverNow = now + clockOffset;
  const offer = !trip && approval.canWork ? currentOffer(offers ?? NO_ORDERS, userId, serverNow) : null;
  const showOffer = Boolean(offer && !inTrip && (online || offer.id === pushedOffer));

  // The countdown ticks fast; otherwise a slow tick keeps a fix's age honest.
  const tickMs = offer ? COUNTDOWN_TICK_MS : focused ? FRESHNESS_TICK_MS : null;
  useEffect(() => {
    if (tickMs == null) return;
    const handle = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(handle);
  }, [tickMs]);

  /*
    An offer that leaves the screen without a tap timed out or was taken back.
    Say which, once, in the panel — then read the pool again, because the
    server has already moved it to the next rider.
  */
  const shown = useRef<api.Order | null>(null);
  useEffect(() => {
    const previous = shown.current;
    shown.current = showOffer ? offer : null;
    if (showOffer && offer && offer.id !== previous?.id) {
      setLastOutcome(null);
      setOfferError(null);
    }
    if (!previous || (offer && offer.id === previous.id) || acted.current.has(previous.id)) return;
    const expiresAt = Date.parse(previous.dispatchOffer?.expiresAt ?? "");
    setLastOutcome(
      Number.isFinite(expiresAt) && expiresAt <= Date.now() + clockOffset
        ? "That offer timed out. GRIDGO has offered it to the next rider."
        : "That offer is no longer available.",
    );
    void reloadOffers();
  }, [offer, showOffer, clockOffset, reloadOffers]);

  // The rider: their own fix while idle, the trip's tracked fix on a job.
  const idleLocation = useRiderLocation({ enabled: focused && !inTrip });
  // Published by the root-mounted `useTripTracking`, which owns GPS on a job.
  const tripLocation = useTripLocation();
  /*
    Never a position without its age (`lib/locationFreshness.ts`). On a job the
    panel says how old the fix is, and a fix that is not live draws no route —
    an old origin would make a confident line out of where the rider was. The
    idle map draws a dot that has gone stale as last known, hollow and grey.
  */
  const tripFreshness = useTripFixFreshness(inTrip ? trip : null);
  const liveFix = tripFreshness?.level === "live";
  const idleFresh = idleLocation.fixAtMs != null && now - idleLocation.fixAtMs < STALE_FIX_MS;
  const here = inTrip ? tripLocation.coords : idleLocation.coords;
  const heading = trip && step && step !== "done" ? nextStop(trip, phase) : null;
  const snapped = useSnappedOrigin(inTrip ? tripLocation.coords : null);
  const routeFrom = liveFix ? snapped : null;
  const { route } = useRoute({
    from: routeFrom,
    to: heading?.point ?? null,
    enabled: inTrip && Boolean(heading?.point) && Boolean(routeFrom),
  });
  const shownRoute = liveFix ? route : null;

  useEffect(() => {
    if (centeredOnMe.current || !idleLocation.coords) return;
    centeredOnMe.current = true;
    setView(firstOpenView(idleLocation.coords, DAVAO_MAP_CENTER, DAVAO_MAP_ZOOM));
  }, [idleLocation.coords]);

  // Look at the offer's shop once, when a new offer comes up.
  const offerPickup = offer ? stopLatLng(offer.pickup) : null;
  const [viewedOffer, setViewedOffer] = useState<string | null>(null);
  if (showOffer && offer && offerPickup && viewedOffer !== offer.id) {
    setViewedOffer(offer.id);
    setView(viewOn(offerPickup, 14));
  }

  const audience = trip ? locationAudience(trip.state) : null;
  const locationHealth = useLocationHealth({
    enabled: focused && approval.canWork && audience != null,
    watcher: audience ?? "client",
  });
  // A stale or switched-off fix on a job is a location problem too.
  const attention = useAttention(locationHealth.issues.length + (fixNeedsAttention(tripFreshness) ? 1 : 0));

  const todayMinor = useMemo(
    () => (orders ? summariseEarnings(orders, userId).todayMinor : null),
    [orders, userId],
  );
  const badges = useMemo(() => shopOrderBadges([offer, trip]), [offer, trip]);
  const selectedShop = shops.find((entry) => entry.id === selectedId) ?? null;
  const places = useMemo(() => shopsToMapPlaces(shops, badges), [shops, badges]);

  async function toggleOnline() {
    if (!userId || !approval.canWork) return;
    if (online && trip && step && step !== "done") {
      const ok = await askConfirm({
        question: "Go offline during this job?",
        consequence:
          "This job carries on, and your location is still shared until it is delivered. You will not see new offers until you go online again.",
        confirmLabel: "Go offline",
        cancelLabel: "Stay online",
      });
      if (!ok) return;
    }
    setRiderOnline(userId, !online);
    setLastOutcome(null);
    if (!online) void reloadOffers();
  }

  async function accept() {
    if (!offer || offerBusy) return;
    const finishAcceptance = useActiveTrip.getState().beginOfferAcceptance();
    setOfferBusy("accept");
    setOfferError(null);
    try {
      const offerId = offerIdOf(offer);
      // A cash accept is only reachable after the have-the-cash tick (`OfferSheet`).
      const accepted =
        isCashOrder(offer) && offerId
          ? await api.acceptOffer(offer.id, offerId, { shopCashConfirmed: true, idempotencyKey: cashAcceptKey(offerId) })
          : await api.acceptOffer(offer.id, offerId);
      acted.current.add(offer.id);
      nextOfferRead();
      setOffers(NO_ORDERS);
      setOrder(accepted);
      // Tell the shop the rider is on the way. A notice, never a gate.
      if (accepted.fulfillmentMode === "delivery") {
        void api
          .recordShopMilestone(accepted.id, "heading_to_shop")
          .then((next) => {
            if (useActiveTrip.getState().order?.id === next.id) setOrder(next);
          })
          .catch(() => undefined);
      }
    } catch (e) {
      const closed = closedFromRefusal(e);
      if (closed) adoptHours(closed);
      setOfferError(
        closed
          ? dispatchClosedSentence(closed.scheduledReviewAt)
          : e instanceof TypeError
            ? "Check this phone's connection, then try again."
            : api.apiErrorMessage(e, "That offer could not be accepted. Try again."),
      );
      void reloadOffers();
    } finally {
      finishAcceptance();
      setOfferBusy(null);
    }
  }

  async function decline() {
    const offerId = offer ? offerIdOf(offer) : null;
    if (!offer || !offerId || offerBusy) return;
    setOfferBusy("decline");
    setOfferError(null);
    try {
      await api.declineOffer(offer.id, offerId);
      acted.current.add(offer.id);
      nextOfferRead();
      setOffers((current) => current?.filter((order) => order.id !== offer.id) ?? current);
      setLastOutcome("Declined. GRIDGO is offering it to the next rider.");
      void reloadOffers();
    } catch (e) {
      setOfferError(api.apiErrorMessage(e, "That offer could not be declined. Try again."));
      void reloadOffers();
    } finally {
      setOfferBusy(null);
    }
  }

  const tripCash = useOrderCash(inTrip ? trip : null);
  const cash = trip ? cashStage(trip, tripCash.detail) : "none";
  const action = trip && step ? tripStepAction(trip, phase, step, cash) : null;

  async function runStep() {
    if (!trip || !action || stepBusy) return;
    setStepError(null);
    if (action.kind === "open") {
      router.push({ pathname: action.route, params: { orderId: trip.id } });
      return;
    }
    if (action.kind !== "arrive_shop" && action.kind !== "arrive_destination") return;
    const door = trip.fulfillmentMode === "delivery";
    setStepBusy(true);
    try {
      if (door) {
        const next =
          action.kind === "arrive_shop"
            ? await api.recordShopMilestone(trip.id, "at_shop")
            : await api.recordArrival(trip.id);
        setOrder(next);
      }
    } catch (e) {
      // A progress notice, never a gate: the step still opens, and the
      // delivery screen asks for the arrival again if the receipt needs it.
      setStepError(
        action.kind === "arrive_shop"
          ? "The shop was not told you arrived. Carry on with the check."
          : api.tripRefusal(e, "Your arrival was not recorded. The handover screen will ask again.").message,
      );
    } finally {
      markArrival(trip.id, action.kind === "arrive_shop" ? "shop" : "destination");
      setStepBusy(false);
    }
    if (action.kind === "arrive_destination") {
      router.push({ pathname: action.then, params: { orderId: trip.id } });
    }
  }

  function recenter() {
    const target = idleLocation.coords ?? DAVAO_MAP_CENTER;
    setView(viewOn(target, idleLocation.coords ? 15 : DAVAO_MAP_ZOOM));
  }

  const shop = trip ? tripShop(trip) : null;
  const destination = trip ? tripDestination(trip) : null;
  const status = !approval.canWork ? "review" : online ? "online" : "offline";
  const held = phase === "pickup_blocked";
  const railSteps = tripRail(step, held);
  const railCurrent = TRIP_STEPS.findIndex((s) => s.key === step);
  // With the tab bar gone, the panel itself has to clear the home indicator.
  const bottomInset = inTrip && step !== "done" ? insets.bottom : 0;

  return (
    <Screen edges={[]}>
      <View
        className="flex-1"
        pointerEvents={focused ? "auto" : "none"}
        // The Leaflet iframe is its own compositor surface on web: hide it
        // with the tab, or it keeps eating clicks on the next one.
        style={Platform.OS === "web" ? ({ visibility: focused ? "visible" : "hidden" } as ViewStyle) : undefined}
      >
        {inTrip && trip ? (
          <TripMap
            pickup={shop?.point ?? null}
            dropoff={destination?.point ?? null}
            pickupLabel={shop?.label ?? "Shop"}
            dropoffLabel={destination?.label ?? "Client"}
            pickupKind="shop"
            dropoffKind={destination?.kind === "office" ? "office" : "client"}
            focus={heading?.cardKind ?? null}
            routeCoordinates={shownRoute?.coordinates ?? []}
            routeUnavailable={Boolean(shownRoute && !shownRoute.routed)}
            rider={tripLocation.coords}
            riderAccuracy={tripLocation.accuracy}
            riderHeading={liveFix ? tripLocation.heading : null}
            riderStale={Boolean(tripLocation.coords) && !liveFix}
            safeTop={topHeight}
            safeBottom={bottomHeight}
          />
        ) : (
          <BrowseMap
            places={places}
            rider={here}
            riderHeading={idleFresh ? idleLocation.heading : null}
            riderStale={Boolean(here) && !idleFresh}
            view={view}
            interactive={focused}
            safeTop={topHeight}
            safeBottom={bottomHeight}
            selectedPlaceId={selectedId}
            onSelectPlace={(id) => setSelectedId(id)}
            stops={
              showOffer && offer
                ? {
                    pickup: offerPickup,
                    dropoff: tripDestination(offer).point,
                    pickupLabel: pickupLabel(offer),
                    dropoffLabel: tripDestination(offer).label,
                  }
                : null
            }
          />
        )}

        <View
          pointerEvents="box-none"
          className="absolute inset-x-0 top-0 gap-2 px-4"
          style={{ paddingTop: insets.top + 8 }}
          onLayout={(event) => setTopHeight(Math.round(event.nativeEvent.layout.height))}
        >
          <MapStatusStrip
            status={status}
            todayMinor={approval.canWork ? todayMinor : null}
            online={online}
            onToggleOnline={approval.canWork ? () => void toggleOnline() : undefined}
          />
          {inTrip && step !== "done" ? (
            <View className="rounded-card border border-outline bg-surface px-2 pb-2 pt-3" testID="trip-rail">
              <StepRail
                steps={railSteps}
                accessibilityLabel={
                  held
                    ? "Trip on hold at the shop check."
                    : `Trip step ${railCurrent + 1} of ${TRIP_STEPS.length}: ${TRIP_STEPS[railCurrent]?.label ?? ""}.`
                }
              />
            </View>
          ) : null}
          {attention ? <AttentionChip summary={attention} /> : null}
        </View>

        <View pointerEvents="box-none" className="absolute inset-x-0 bottom-0">
          {!inTrip && !showOffer && selectedShop ? (
            <View className="mx-4 mb-3 flex-row items-start gap-3 rounded-card border border-outline bg-surface p-4" testID="map-place-card">
              <View className="min-w-0 flex-1">
                <Text className="text-h3 text-text-primary">{selectedShop.name}</Text>
                <Text className="mt-0.5 text-body text-text-secondary">{selectedShop.address}</Text>
              </View>
              <Pressable
                onPress={() => setSelectedId(null)}
                accessibilityRole="button"
                accessibilityLabel={selectedShop.kind === "office" ? "Close office details" : "Close shop details"}
                className="-mr-2 -mt-2 h-11 w-11 items-center justify-center"
              >
                <X size={20} color={colors.textSecondary} strokeWidth={2} />
              </Pressable>
            </View>
          ) : null}
          {!inTrip ? (
            <View pointerEvents="box-none" className="items-end px-4 pb-3">
              <Pressable
                onPress={recenter}
                accessibilityRole="button"
                accessibilityLabel="Center the map on you"
                className="h-12 w-12 items-center justify-center rounded-pill border border-outline bg-surface"
                testID="map-recenter"
              >
                <LocateFixed size={22} color={colors.textPrimary} strokeWidth={2} />
              </Pressable>
            </View>
          ) : null}

          <View
            style={{ paddingBottom: bottomInset }}
            className={bottomInset ? "bg-surface" : undefined}
            onLayout={(event) => setBottomHeight(Math.round(event.nativeEvent.layout.height))}
          >
            {inTrip && trip && step && action ? (
              <TripPanel
                trip={trip}
                phase={phase}
                step={step}
                action={action}
                stop={heading}
                routeSummary={
                  !heading
                    ? null
                    : tripFreshness?.level === "stale"
                      ? "Route paused until your position updates"
                      : tripFreshness?.level === "off"
                        ? "Route paused while location is off"
                        : !routeFrom
                          ? "Waiting for your position…"
                          : shownRoute
                            ? routeSummaryLabel(shownRoute)
                            : "Measuring the route…"
                }
                position={tripFreshness}
                busy={stepBusy}
                error={stepError}
                onAction={() => void runStep()}
                onDone={() => void refreshTrip(userId, "refresh")}
                cash={cash}
                routeSeconds={shownRoute?.durationSeconds ?? null}
              />
            ) : showOffer && offer ? (
              <OfferSheet
                offer={offer}
                secondsLeft={offerSecondsLeft(offer, serverNow)}
                fractionLeft={offerFractionLeft(offer, serverNow)}
                busy={offerBusy}
                error={offerError}
                onAccept={() => void accept()}
                onDecline={() => void decline()}
              />
            ) : (
              <OnlinePanel
                online={online}
                canWork={approval.canWork}
                offerWaiting={Boolean(offer) && !online}
                closedLine={approval.canWork ? hours.opensLine : null}
                lastOutcome={lastOutcome}
                loadError={online ? offersError : null}
                onToggle={() => void toggleOnline()}
              />
            )}
          </View>
        </View>
      </View>
    </Screen>
  );
}
