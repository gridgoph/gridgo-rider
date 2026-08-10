import type { ReactNode } from "react";
import { View } from "react-native";

import { SecondaryButton } from "@/components/SecondaryButton";
import {
  SkeletonBlock,
  SkeletonButton,
  SkeletonCircle,
  SkeletonText,
} from "@/components/Skeleton";

/**
 * Screen-shaped loading states.
 *
 * A skeleton has one job beyond looking busy: hold the layout the real content
 * will take, so nothing moves when it lands. A two-line placeholder under a
 * screen that resolves into a card, a map and a button reads as the page
 * jumping — which is what "the tab scrolls a bit when I switch" turns out to
 * be. So each of these mirrors one specific screen, block for block, at the
 * heights that screen actually uses.
 *
 * Every composition announces itself once to assistive technology and draws
 * shapes for everyone else. Both matter on a weak signal outside a Davao print
 * shop.
 */

function Loading({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityLiveRegion="polite"
      className="gap-6"
    >
      {children}
    </View>
  );
}

/** The map inside an offer card. Matches `OfferCard`'s `CARD_MAP_HEIGHT`. */
const OFFER_MAP_HEIGHT = 120;

/** Matches `MAP_HEIGHT` on the Active screen. */
const TRIP_MAP_HEIGHT = 200;

/**
 * One offer card, in the shape of `OfferCard`: title and payment chip, the
 * spec caption, the fee and the route on one row, the map, both stops, and the
 * accept button at the bottom.
 */
function OfferCardSkeleton() {
  return (
    <View className="gg-card gap-4">
      <View className="gap-1">
        <View className="flex-row items-start justify-between gap-3">
          <SkeletonText width="55%" height={26} />
          <SkeletonText width={110} height={26} />
        </View>
        <SkeletonText width="70%" height={16} />
      </View>

      <View className="flex-row items-end justify-between gap-4">
        <View className="gap-0.5">
          <SkeletonText width={72} height={16} />
          <SkeletonText width={120} height={34} />
        </View>
        <SkeletonText width={104} height={24} />
      </View>

      <SkeletonBlock height={OFFER_MAP_HEIGHT} />

      <View className="gap-3">
        <View className="flex-row items-center gap-3">
          <SkeletonCircle size={24} />
          <View className="min-w-0 flex-1">
            <SkeletonText width="80%" height={20} />
          </View>
        </View>
        <View className="flex-row items-center gap-3">
          <SkeletonCircle size={24} />
          <View className="min-w-0 flex-1">
            <SkeletonText width="65%" height={20} />
          </View>
        </View>
      </View>

      <SkeletonButton />
    </View>
  );
}

/** The dispatch pool while it loads. */
export function OfferListSkeleton({ count = 2 }: { count?: number }) {
  return (
    <Loading label="Loading open offers">
      {Array.from({ length: count }).map((_, index) => (
        <OfferCardSkeleton key={index} />
      ))}
    </Loading>
  );
}

/**
 * The Active screen while the job in hand loads.
 *
 * Same order as the real screen — next stop, the step, the map — so the one
 * control that matters does not arrive somewhere the eye was not already
 * looking.
 */
export function ActiveTripSkeleton() {
  return (
    <Loading label="Loading the job in hand">
      <View className="gg-card gap-3">
        <SkeletonText width={150} height={16} />
        <View className="gap-1">
          <SkeletonText width="85%" height={30} />
          <SkeletonText width="60%" height={20} />
        </View>
        <View className="border-t border-outline-subtle pt-3">
          <SkeletonText width="45%" height={24} />
        </View>
      </View>

      <SkeletonButton />

      <SkeletonBlock height={TRIP_MAP_HEIGHT} />

      <View className="gg-card gap-2">
        <SkeletonText width="40%" height={16} />
        <SkeletonText width="75%" height={20} />
      </View>
    </Loading>
  );
}

/** Dispatch alerts: a disc and three lines per row, as the real list draws. */
export function AlertListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <Loading label="Loading alerts">
      <View className="gg-card-flush">
        {Array.from({ length: count }).map((_, index) => (
          <View
            key={index}
            className={
              index === count - 1
                ? "flex-row gap-3 p-4"
                : "flex-row gap-3 border-b border-outline-subtle p-4"
            }
          >
            <SkeletonCircle size={32} />
            <View className="min-w-0 flex-1 gap-1">
              <SkeletonText width="70%" height={24} />
              <SkeletonText width="100%" height={20} />
              <SkeletonText width="35%" height={16} />
            </View>
          </View>
        ))}
      </View>
    </Loading>
  );
}

/** Today's total, then the deliveries behind it. */
export function EarningsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Loading label="Loading your earnings">
      <View className="gg-card gap-1">
        <SkeletonText width={110} height={16} />
        <SkeletonText width="60%" height={38} />
        <SkeletonText width="80%" height={20} />
      </View>

      <View className="gap-3">
        <SkeletonText width={90} height={16} />
        <View className="gg-card-flush">
          {Array.from({ length: rows }).map((_, index) => (
            <View
              key={index}
              className={
                index === rows - 1
                  ? "min-h-14 flex-row items-start justify-between gap-4 p-4"
                  : "min-h-14 flex-row items-start justify-between gap-4 border-b border-outline-subtle p-4"
              }
            >
              <View className="min-w-0 flex-1 gap-0.5">
                <SkeletonText width="75%" height={24} />
                <SkeletonText width="55%" height={20} />
                <SkeletonText width="40%" height={16} />
              </View>
              <SkeletonText width={80} height={26} />
            </View>
          ))}
        </View>
      </View>
    </Loading>
  );
}

/**
 * A pushed proof step while its job loads.
 *
 * These screens re-fetch the order rather than trusting a snapshot, so there is
 * always a wait here — and the real content is a header, a code field and an
 * evidence card, not the three lines the old placeholder drew.
 */
export function ProofStepSkeleton() {
  return (
    <Loading label="Loading the job">
      <View className="gap-1">
        <SkeletonText width={110} height={16} />
        <SkeletonText width="80%" height={30} />
        <SkeletonText width="60%" height={24} />
      </View>

      <View className="gap-2">
        <SkeletonText width={100} height={16} />
        {/* Four equal cells at `OtpInput`'s own h-16. */}
        <View className="flex-row gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <View key={index} className="flex-1">
              <SkeletonBlock height={64} />
            </View>
          ))}
        </View>
        <SkeletonText width="70%" height={16} />
      </View>

      <View className="gg-card gap-3">
        <SkeletonText width={160} height={20} />
        <SkeletonText width="90%" height={20} />
        <SkeletonText width="70%" height={20} />
        <SkeletonButton height={44} />
      </View>
    </Loading>
  );
}

/**
 * The cash screen while its job loads.
 *
 * Its own shape rather than the proof one: there is no code field and no
 * camera here, just the header and the bordered card the amount lands in. The
 * amount is the largest thing on the finished screen, so the block that stands
 * in for it is the largest thing here too.
 */
export function CashStepSkeleton() {
  return (
    <Loading label="Loading the job">
      <View className="gap-1">
        <SkeletonText width={110} height={16} />
        <SkeletonText width="80%" height={30} />
        <SkeletonText width="60%" height={24} />
      </View>

      <View className="gap-3 rounded-card border-2 border-outline bg-surface p-6">
        <SkeletonText width={130} height={16} />
        <SkeletonText width="55%" height={38} />
        <SkeletonText width="100%" height={24} />
        <SkeletonText width="70%" height={24} />
      </View>

      <View className="gap-1">
        <SkeletonText width="100%" height={20} />
        <SkeletonText width="80%" height={20} />
      </View>
    </Loading>
  );
}

/**
 * A confirmation sheet while its job loads.
 *
 * Two problems at once. The sheet is sized to its contents, so a short
 * placeholder followed by taller real content makes the panel grow up from the
 * bottom edge under the rider's thumb — this holds the height the answer will
 * take. And the cancel is a real button, not a placeholder: the question is
 * still loading, but backing out is already known, and a sheet whose only
 * escape during the wait is a drag gesture is a sheet some riders will not
 * find a way out of.
 */
export function ConfirmSheetSkeleton({
  cancelLabel,
  onCancel,
}: {
  cancelLabel: string;
  onCancel: () => void;
}) {
  return (
    <View className="gap-4 px-4 pb-2 pt-2">
      <View
        accessibilityRole="progressbar"
        accessibilityLabel="Loading the job"
        accessibilityLiveRegion="polite"
        className="gap-2"
      >
        <SkeletonText width="75%" height={26} />
        <SkeletonText width="100%" height={24} />
        <SkeletonText width="85%" height={24} />
      </View>
      <View className="gap-3 pt-1">
        <SkeletonButton />
        <SecondaryButton label={cancelLabel} onPress={onCancel} />
      </View>
    </View>
  );
}
