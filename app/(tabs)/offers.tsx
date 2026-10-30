import { useReadVersion } from "@/hooks/useReadVersion";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";

import { AlertsButton } from "@/components/AlertsButton";
import { ChatButton } from "@/components/ChatButton";
import { ApprovalChip } from "@/components/ApprovalChip";
import { ApprovalNotice } from "@/components/ApprovalNotice";
import { EmptyState } from "@/components/EmptyState";
import { InlineNotice } from "@/components/InlineNotice";
import { PushEnableCard } from "@/components/PushEnableCard";
import { Screen } from "@/components/Screen";
import { OfferListSkeleton } from "@/components/SkeletonScreens";
import { OfferCard } from "@/components/OfferCard";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { approvalPresentation } from "@/lib/riderApproval";
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
 * The open dispatch pool.
 *
 * A rider carries one job at a time, so the screen's first duty when a trip is
 * already in hand is to say so and send them back to it, rather than offering
 * jobs they cannot take.
 */
export default function OffersScreen() {
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
  const [acceptError, setAcceptError] = useState<{ id: string; body: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const hasActive = Boolean(activeTrip);
  const showJobInHand = hasActive && !acceptedId;
  const visibleOffers = selectedId ? offers?.filter(job => job.id === selectedId) : offers;
  const acceptErrorOnCard = Boolean(acceptError && visibleOffers?.some((job) => job.id === acceptError.id));
  const approval = approvalPresentation(user);

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
  }, [nextRead, refreshTrip, userId, approval.canWork]);

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

  useLiveRefresh(["dispatch", "orders", "identity", "approvals"], reload);

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
    acceptingIdRef.current = id;
    setBusyId(id);
    setError(null);
    setAcceptError(null);
    try {
      setOrder(await api.acceptOffer(id));
      setAcceptedId(id);
      acceptedTimerRef.current = setTimeout(() => {
        acceptedTimerRef.current = null;
        setAcceptedId(null);
        router.push("/(tabs)/active");
      }, ACCEPTED_BEAT_MS);
    } catch (e) {
      // A fetch that never reached GRIDGO throws a bare TypeError whose text
      // ("Network request failed") is the browser's, not ours.
      const message =
        e instanceof TypeError
          ? ACCEPT_CONNECTION_FAILED
          : api.apiErrorMessage(e, "That job could not be accepted. Pull down to refresh and take another.");
      await reload();
      setAcceptError({ id, body: message });
    } finally {
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
          title="Offers"
          subtitle={
            approval.canWork ? "Jobs ready for pickup. You carry one at a time." : null
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

        {selectedId && approval.canWork && offers !== null && !error && !acceptError ? (
          <InlineNotice
            tone="info"
            icon="info"
            title={visibleOffers?.length ? "Job from your alert" : "This job is no longer available"}
            body={visibleOffers?.length ? "Review the pickup and delivery before accepting." : "Another rider may have accepted it, or its availability changed."}
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
            body="Close it out, and the next offers appear here straight away."
            actionLabel="Open my trip"
            onAction={() => router.push("/(tabs)/active")}
          />
        ) : approval.canWork && showJobInHand ? (
          <InlineNotice
            tone="info"
            icon="info"
            title="You already have a job in hand"
            body="Close it out before taking another. These stay open for other riders in the meantime."
            actionLabel="Open my trip"
            onAction={() => router.push("/(tabs)/active")}
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

        {acceptError && !acceptErrorOnCard ? (
          <InlineNotice
            tone="error"
            icon="circle-x"
            title="Could not accept this job"
            body={acceptError.body}
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
        {approval.canWork && offers !== null && !offers.length && !error && !acceptError && !hasActive && !selectedId ? (
          <EmptyState
            icon="offers"
            title="No open offers"
            body="A job appears here the moment a supplier marks it ready, with its route and what you earn. Pull down to check again."
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}
