import type { ReactNode } from "react";
import { View } from "react-native";

import { SecondaryButton } from "@/components/SecondaryButton";
import {
  SkeletonBlock,
  SkeletonButton,
  SkeletonCircle,
  SkeletonPill,
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
 * One offer card, in the shape of `OfferCard`: title, order id, the
 * spec caption, the fee and the route on one row, the map, both stops, and the
 * accept button at the bottom.
 */
function OfferCardSkeleton() {
  return (
    <View className="gg-card gap-4">
      <View className="gap-1">
        <SkeletonText width="55%" height={26} />
        <SkeletonText width="40%" height={16} />
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

/**
 * Dispatch alerts, in the shape `AlertCard` draws: an unread marker, three
 * lines, then the four-step stage bar under a divider. The bar is most of the
 * card's height, so a skeleton without it would let the list jump by ~70dp per
 * row the moment the orders land.
 */
export function AlertListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <Loading label="Loading alerts">
      <View className="gap-2">
        {Array.from({ length: count }).map((_, index) => (
          <View
            key={index}
            className="gap-4 rounded-card border border-outline bg-surface p-4"
          >
            <View className="flex-row gap-3">
              <SkeletonCircle size={10} />
              <View className="min-w-0 flex-1 gap-1">
                <SkeletonText width="70%" height={24} />
                <SkeletonText width="100%" height={20} />
                <SkeletonText width="45%" height={16} />
              </View>
            </View>
            <View className="flex-row gap-2 border-t border-outline-subtle pt-4">
              {Array.from({ length: 4 }).map((__, step) => (
                <View key={step} className="flex-1 items-center gap-2">
                  {/* 42dp halo box, then the 16dp caption row. */}
                  <SkeletonCircle size={42} />
                  <SkeletonText width="70%" height={16} />
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
    </Loading>
  );
}

/** The past-jobs ledger while it loads — same row height the list will take. */
export function PastJobsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Loading label="Loading past jobs">
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
              <SkeletonText width="70%" height={24} />
              <SkeletonText width="85%" height={20} />
              <SkeletonText width="40%" height={16} />
            </View>
            <View className="items-end gap-1">
              <SkeletonText width={72} height={24} />
              <SkeletonText width={64} height={16} />
            </View>
          </View>
        ))}
      </View>
    </Loading>
  );
}

/**
 * One past job while its record loads: title, order id, progress, the facts, then HISTORY.
 */
export function PastJobDetailSkeleton() {
  return (
    <Loading label="Loading this job">
      <View className="gap-3">
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1 gap-1">
            <SkeletonText width="80%" height={26} />
            <SkeletonText width="45%" height={16} />
          </View>
          <SkeletonText width={120} height={26} />
        </View>
        <SkeletonText width="70%" height={20} />
      </View>

      <View className="gg-card">
        <View className="flex-row gap-2">
          {Array.from({ length: 4 }).map((_, step) => (
            <View key={step} className="flex-1 items-center gap-2">
              <SkeletonCircle size={42} />
              <SkeletonText width="70%" height={16} />
            </View>
          ))}
        </View>
      </View>

      <View className="gg-card-flush px-4">
        <View className="flex-row justify-between py-3">
          <SkeletonText width={72} height={20} />
          <SkeletonText width="45%" height={20} />
        </View>
        <View className="flex-row justify-between py-3">
          <SkeletonText width={80} height={20} />
          <SkeletonText width="50%" height={20} />
        </View>
        <View className="flex-row justify-between py-3">
          <SkeletonText width={64} height={20} />
          <SkeletonText width={80} height={20} />
        </View>
      </View>

      <View className="gap-3">
        <SkeletonText width={80} height={16} />
        <View className="gap-4">
          <SkeletonText width="55%" height={20} />
          <SkeletonText width="70%" height={16} />
          <SkeletonText width="50%" height={20} />
        </View>
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

/** The header every pushed trip step opens with: overline, title, order id, stop. */
function TripStepHeaderSkeleton() {
  return (
    <View className="gap-1">
      <SkeletonText width={110} height={16} />
      <SkeletonText width="80%" height={30} />
      <SkeletonText width="40%" height={16} />
      <SkeletonText width="60%" height={24} />
    </View>
  );
}

/**
 * A pushed proof step while its job loads.
 *
 * These screens re-fetch the order rather than trusting a snapshot, so there is
 * always a wait here — and the real content is a header, an explanatory line
 * and an evidence card.
 */
export function ProofStepSkeleton() {
  return (
    <Loading label="Loading the job">
      <TripStepHeaderSkeleton />

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
 * The six-point checklist while its job loads.
 *
 * The tallest screen in the app, and the one a rider opens standing at a
 * counter with the supplier watching. Six rows at the height they really take —
 * two lines of text over a pair of 44dp answer pills — so the list does not
 * grow out from under a thumb already moving toward the first Pass.
 */
export function PickupChecklistSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Loading label="Loading the pickup checks">
      <TripStepHeaderSkeleton />

      <View className="gap-1">
        <SkeletonText width="100%" height={24} />
        <SkeletonText width="85%" height={24} />
      </View>

      <View className="gg-card-flush">
        {Array.from({ length: rows }).map((_, index) => (
          <View key={index} className="gap-3 border-b border-outline-subtle p-4">
            <View className="flex-row gap-3">
              <SkeletonText width={10} height={20} />
              <View className="min-w-0 flex-1 gap-0.5">
                <SkeletonText width="60%" height={24} />
                <SkeletonText width="95%" height={16} />
              </View>
            </View>
            <View className="flex-row gap-2">
              <View className="flex-1">
                <SkeletonPill />
              </View>
              <View className="flex-1">
                <SkeletonPill />
              </View>
            </View>
          </View>
        ))}
      </View>
    </Loading>
  );
}

/**
 * The quality checkpoint while its job loads.
 *
 * The spoken line is the largest thing on the finished screen, so the block
 * standing in for it is the largest thing here.
 */
export function SignOffSkeleton() {
  return (
    <Loading label="Loading the checkpoint">
      <TripStepHeaderSkeleton />

      <View className="gg-card gap-2">
        <SkeletonText width="55%" height={24} />
        <SkeletonText width="90%" height={20} />
      </View>

      <View className="gap-3 rounded-card border-2 border-outline bg-surface p-6">
        <SkeletonText width={180} height={16} />
        <SkeletonText width="95%" height={34} />
        <SkeletonText width="60%" height={34} />
      </View>

      <View className="gap-1">
        <SkeletonText width="100%" height={20} />
        <SkeletonText width="75%" height={20} />
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
