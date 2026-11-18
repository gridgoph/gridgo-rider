import { useReadVersion } from "@/hooks/useReadVersion";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { History } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";

import { AlertsButton } from "@/components/AlertsButton";
import { ChatButton } from "@/components/ChatButton";
import { ApprovalChip } from "@/components/ApprovalChip";
import { ApprovalNotice } from "@/components/ApprovalNotice";
import { DestinationRow } from "@/components/DestinationRow";
import { EmptyState } from "@/components/EmptyState";
import { InlineNotice } from "@/components/InlineNotice";
import { PushEnableCard } from "@/components/PushEnableCard";
import { Screen } from "@/components/Screen";
import { OfferListSkeleton } from "@/components/SkeletonScreens";
import { OfferCard } from "@/components/OfferCard";
import { ScreenHeader } from "@/components/ScreenHeader";
import { TesterSlot } from "@/components/TesterSlot";
import { useDispatchHours } from "@/hooks/useDispatchHours";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { closedFromRefusal, DISPATCH_CLOSED_TITLE, dispatchClosedSentence } from "@/lib/dispatchHours";
import { approvalPresentation } from "@/lib/riderApproval";
import { cashAcceptKey, isCashOrder } from "@/lib/cash";
import { offerIdOf } from "@/lib/dispatchOffer";
import { selectOffers } from "@/lib/riderOrder";
import { useActiveTrip } from "@/store/activeTrip";
import { useSession } from "@/store/session";

/** Long enough to read "Job accepted" on the card, short enough not to wait on. */
const ACCEPTED_BEAT_MS = 900;

/**
 * The plain line for an accept that never reached GRIDGO: the app's own
 * connection copy, short enough to sit on one line above the button. The red
 * icon and the unchanged "Accept this job" say it did not go through.
 */
const ACCEPT_CONNECTION_FAILED = "Check this phone’s connection, then try again.";

/**
 * Jobs: the offer reserved for this rider and the way to past jobs.
 *
 * The map is home and shows the same offer with its countdown; this is the
 * list view of it, for a rider who wants every detail before accepting.
 *
 * A rider carries one job at a time, so the screen's first duty when a trip is
 * already in hand is to say so and send them back to it, rather than offering
 * jobs they cannot take.
 */
export default function JobsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ orderId?: string | string[] }>();
  const selectedId = typeof params.orderId === "string" ? params.orderId : null;
  const colors = useThemeColors();
  const user = useSession((s) => s.user);
  const userId = user?.id;
  const activeTrip = useActiveTrip((s) => s.order);
  const refreshTrip = useActiveTrip((s) => s.refresh);
  const setOrder = useActiveTrip((s) => s.setOrder);

  const [offers, setOffers] = useState<api.Order[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const acceptingIdRef = useRef<string | null>(null);
  /*
    The accepted card holds for one beat before Active opens, so the tap gets
    an answer on the card it was made on. Reloads wait it out: the pool would
    otherwise drop the card, and the "job in hand" notice would take its place.
  */
  const [acceptedId, setAcceptedId] = useState<string | null>(null);
  const acceptedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [error, setError] = useState<{ title: string; body: string } | null>(null);
  /** A refused accept: said on its own card while that card is still listed. */
  const [acceptError, setAcceptError] = useState<{ id: string; body: string; closed: boolean } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const hasActive = Boolean(activeTrip);
  const showJobInHand = hasActive && !acceptedId;
  const visibleOffers = selectedId ? offers?.filter(job => job.id === selectedId) : offers;
  const acceptErrorOnCard = Boolean(acceptError && visibleOffers?.some((job) => job.id === acceptError.id));
  const approval = approvalPresentation(user);
  const hours = useDispatchHours();
  const { refresh: refreshHours, adopt: adoptHours } = hours;
  const opensLine = approval.canWork ? hours.opensLine : null;
  // Refused for hours with the card gone: the closed notice already says it.
  const acceptNotice = acceptError && !acceptErrorOnCard && !acceptError.closed ? acceptError : null;
  const emptyPool =
    approval.canWork && offers !== null && !offers.length && !error && !acceptNotice && !hasActive && !selectedId;

  const nextRead = useReadVersion();
  const reload = useCallback(async () => {
    if (acceptedTimerRef.current) return;
    const current = nextRead();
    // Every dispatch route answers 403 for an unapproved rider. Asking anyway
    // would turn a state the app already knows into an error it has to explain.
    if (!approval.canWork || !approvalPresentation(useSession.getState().user).canWork) {
      setOffers([]);
      setError(null);
      return;
    }
    try {
      const [list] = await Promise.all([
        api.listOffers(),
        refreshTrip(userId ?? null, "refresh"),
        refreshHours(),
      ]);
      if (!current()) return;
      setOffers(selectOffers(list));
      setError(null);
    } catch (e) {
      if (!current()) return;
      setError({
        title: "Offers did not load",
        body: api.apiErrorMessage(
          e,
          "Offers did not load. Check the phone's connection and pull down to try again.",
        ),
      });
      setOffers((current) => current ?? []);
    }
  }, [nextRead, refreshTrip, refreshHours, userId, approval.canWork]);

  /*
    `refreshing` is the pull gesture's, and only the pull gesture's. Everything
    else re-fetches behind the list that is already there — the placeholder
    cards below cover the one case where there is nothing to keep.
  */
  const pullToRefresh = useCallback(async () => {
    setRefreshing(true);
    setAcceptError(null);
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  }, [reload]);

  useLiveRefresh(["dispatch", "orders", "identity", "approvals", "settings"], reload);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  useEffect(
    () => () => {
      if (acceptedTimerRef.current) clearTimeout(acceptedTimerRef.current);
    },
    [],
  );

  async function accept(id: string) {
    if (hasActive || acceptingIdRef.current || acceptedTimerRef.current) return;
    const finishAcceptance = useActiveTrip.getState().beginOfferAcceptance();
    acceptingIdRef.current = id;
    setBusyId(id);
    setError(null);
    setAcceptError(null);
    try {
      const listed = offers?.find((job) => job.id === id);
      const offerId = listed ? offerIdOf(listed) : null;
      // A cash accept is only reachable after the have-the-cash tick (`OfferCard`).
      setOrder(
        listed && isCashOrder(listed) && offerId
          ? await api.acceptOffer(id, offerId, { shopCashConfirmed: true, idempotencyKey: cashAcceptKey(offerId) })
          : await api.acceptOffer(id, offerId),
      );
      // A pool read already in flight would answer without this job and take
      // the card, confirmation and all, off the screen. Retire it.
      nextRead();
      setAcceptedId(id);
      acceptedTimerRef.current = setTimeout(() => {
        acceptedTimerRef.current = null;
        setAcceptedId(null);
        router.push("/(tabs)/map");
      }, ACCEPTED_BEAT_MS);
    } catch (e) {
      // A fetch that never reached GRIDGO throws a bare TypeError whose text
      // ("Network request failed") is the browser's, not ours.
      const closed = closedFromRefusal(e);
      const message = closed
        ? dispatchClosedSentence(closed.scheduledReviewAt)
        : e instanceof TypeError
          ? ACCEPT_CONNECTION_FAILED
          : api.apiErrorMessage(e, "That job could not be accepted. Pull down to refresh and take another.");
      if (closed) adoptHours(closed);
      await reload();
      // One answer to one tap: if the follow-up refresh failed too (a phone
      // that is fully offline), its own notice would repeat the failure with
      // the platform's raw text. The accept line says what to do.
      setError(null);
      setAcceptError({ id, body: message, closed: Boolean(closed) });
    } finally {
      finishAcceptance();
      acceptingIdRef.current = null;
      setBusyId(null);
    }
  }

  return (
    <Screen edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="gg-page gap-6 pb-10 pt-3"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void pullToRefresh()}
            tintColor={colors.textMuted}
          />
        }
      >
        <ScreenHeader
          title="Jobs"
          subtitle={
            approval.canWork ? "Your delivery offer, with every detail. You carry one at a time." : null
          }
          status={<ApprovalChip />}
          action={
            <View className="flex-row items-center gap-2">
              <ChatButton />
              <AlertsButton />
            </View>
          }
        />

        {!approval.canWork ? <ApprovalNotice /> : null}

        <PushEnableCard />

        {/*
          A Google Play tester's day (nothing for anyone else). Only with no
          job in hand, so it never moves a trip.
        */}
        {!approval.canWork || !hasActive ? <TesterSlot /> : null}

        {/*
          With nothing else to show, closed is the whole answer and takes the
          empty state's place below. Otherwise it sits above what is there.
        */}
        {opensLine && !emptyPool ? (
          <InlineNotice tone="neutral" icon="clock" title={DISPATCH_CLOSED_TITLE} body={opensLine} />
        ) : null}

        {selectedId && approval.canWork && offers !== null && !error && !acceptError ? (
          <InlineNotice
            tone="info"
            icon="info"
            title={
              visibleOffers?.length
                ? "Job from your alert"
                : opensLine
                  ? "This job is not open right now"
                  : "This job is no longer available"
            }
            body={
              visibleOffers?.length
                ? "Review the pickup and delivery before accepting."
                : opensLine
                  ? "Check again when dispatch opens."
                  : "Another rider may have accepted it, or its availability changed."
            }
            actionLabel="View all offers"
            onAction={() => router.setParams({ orderId: undefined })}
          />
        ) : null}

        {/*
          One job at a time. With a trip in hand and nothing else waiting, the
          rule is the whole answer, so it fills the screen rather than sitting
          as a notice above 600px of nothing.
        */}
        {approval.canWork && showJobInHand && offers?.length === 0 ? (
          <EmptyState
            icon="trip"
            title="You already have a job in hand"
            body={
              opensLine
                ? "Close it out, and the next offers appear here once dispatch opens."
                : "Close it out, and the next offers appear here straight away."
            }
            actionLabel="Open my trip on the map"
            onAction={() => router.push("/(tabs)/map")}
          />
        ) : approval.canWork && showJobInHand ? (
          <InlineNotice
            tone="info"
            icon="info"
            title="You already have a job in hand"
            body="Close it out before taking another. These stay open for other riders in the meantime."
            actionLabel="Open my trip on the map"
            onAction={() => router.push("/(tabs)/map")}
          />
        ) : null}

        {error ? (
          <InlineNotice
            tone="error"
            icon="circle-x"
            title={error.title}
            body={error.body}
            actionLabel="Try again"
            onAction={() => void reload()}
          />
        ) : null}

        {acceptNotice ? (
          <InlineNotice
            tone="error"
            icon="circle-x"
            title="Could not accept this job"
            body={acceptNotice.body}
            actionLabel="Try again"
            onAction={() => {
              setAcceptError(null);
              void reload();
            }}
          />
        ) : null}

        {offers === null && approval.canWork ? <OfferListSkeleton /> : null}

        {visibleOffers?.length && approval.canWork ? (
          <View className="gap-4">
            {visibleOffers.map((job) => (
              <OfferCard
                key={job.id}
                offer={job}
                accepting={busyId === job.id}
                accepted={acceptedId === job.id}
                acceptError={acceptError?.id === job.id ? acceptError.body : null}
                disabled={hasActive || (busyId != null && busyId !== job.id)}
                onAccept={() => void accept(job.id)}
              />
            ))}
          </View>
        ) : null}

        {/*
          When a trip is in hand the notice above already says what is going on
          and offers the next step, so an empty state repeating it would be a
          second invitation to the same place.
        */}
        {emptyPool && opensLine ? (
          <EmptyState icon="closed" title={DISPATCH_CLOSED_TITLE} body={opensLine} />
        ) : emptyPool ? (
          <EmptyState
            icon="offers"
            title="No open offers"
            body="GRIDGO offers you one job at a time, with what you earn and a countdown. Go online on the map to see it there too."
          />
        ) : null}

        <View className="gg-card-flush">
          <DestinationRow
            icon={History}
            label="Past jobs"
            detail="Jobs you delivered"
            onPress={() => router.push("/past-jobs")}
            last
          />
        </View>
      </ScrollView>
    </Screen>
  );
}
