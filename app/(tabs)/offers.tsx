import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";

import { AlertsButton } from "@/components/AlertsButton";
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

/**
 * The open dispatch pool.
 *
 * A rider carries one job at a time, so the screen's first duty when a trip is
 * already in hand is to say so and send them back to it, rather than offering
 * jobs they cannot take.
 */
export default function OffersScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const user = useSession((s) => s.user);
  const activeTrip = useActiveTrip((s) => s.order);
  const refreshTrip = useActiveTrip((s) => s.refresh);
  const setOrder = useActiveTrip((s) => s.setOrder);

  const [offers, setOffers] = useState<api.Order[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const acceptingIdRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const hasActive = Boolean(activeTrip);
  const approval = approvalPresentation(user);

  const reload = useCallback(async () => {
    // Every dispatch route answers 403 for an unapproved rider. Asking anyway
    // would turn a state the app already knows into an error it has to explain.
    if (!approvalPresentation(useSession.getState().user).canWork) {
      setOffers([]);
      setError(null);
      return;
    }
    try {
      const [list] = await Promise.all([
        api.listOffers(),
        refreshTrip(user?.id ?? null, "refresh"),
      ]);
      setOffers(selectOffers(list));
      setError(null);
    } catch (e) {
      setError(
        api.apiErrorMessage(
          e,
          "Offers did not load. Check the phone's connection and pull down to try again.",
        ),
      );
      setOffers((current) => current ?? []);
    }
  }, [refreshTrip, user?.id]);

  /*
    `refreshing` is the pull gesture's, and only the pull gesture's. Everything
    else re-fetches behind the list that is already there — the placeholder
    cards below cover the one case where there is nothing to keep.
  */
  const pullToRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  }, [reload]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  async function accept(id: string) {
    if (hasActive || acceptingIdRef.current) return;
    acceptingIdRef.current = id;
    setBusyId(id);
    setError(null);
    try {
      setOrder(await api.acceptOffer(id));
      router.push("/(tabs)/active");
    } catch (e) {
      setError(
        api.apiErrorMessage(
          e,
          "That job could not be accepted. Pull down to refresh and take another.",
        ),
      );
      void reload();
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
          action={<AlertsButton />}
        />

        {!approval.canWork ? <ApprovalNotice /> : null}

        <PushEnableCard />

        {/*
          One job at a time. With a trip in hand and nothing else waiting, the
          rule is the whole answer, so it fills the screen rather than sitting
          as a notice above 600px of nothing.
        */}
        {approval.canWork && hasActive && offers?.length === 0 ? (
          <EmptyState
            icon="trip"
            title="You already have a job in hand"
            body="Close it out, and the next offers appear here straight away."
            actionLabel="Open my trip"
            onAction={() => router.push("/(tabs)/active")}
          />
        ) : approval.canWork && hasActive ? (
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
            title="Offers did not load"
            body={error}
            actionLabel="Try again"
            onAction={() => void reload()}
          />
        ) : null}

        {offers === null && approval.canWork ? <OfferListSkeleton /> : null}

        {offers?.length && approval.canWork ? (
          <View className="gap-4">
            {offers.map((job) => (
              <OfferCard
                key={job.id}
                offer={job}
                accepting={busyId === job.id}
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
        {approval.canWork && offers !== null && !offers.length && !error && !hasActive ? (
          <EmptyState
            icon="offers"
            title="No open offers"
            body="A job appears here the moment a supplier marks it ready, with its route and its fee. Pull down to check again."
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}
