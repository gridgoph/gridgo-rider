import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  Pressable,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Animated, {
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GridgoLogo } from "@/components/GridgoLogo";
import { OnboardingMark } from "@/components/OnboardingMark";
import { PaginationDots } from "@/components/PaginationDots";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { onboardingSlides, type OnboardingArt } from "@/data/onboarding";
import { onboardingShouldPop, resolveOnboardingExit } from "@/lib/onboardingExit";
import { estimatePagerHeight, onboardingMarkSize } from "@/lib/onboardingStage";

/**
 * Rider onboarding.
 *
 * Three pages: offer, check, proof. Each beat is a PNG the captain picked,
 * loaded through `images.onboarding` — not a scene SVG. Those drawings
 * froze the first open and hitching Next on the phone.
 *
 * Entry points: first-run / public (`/onboarding`) and Settings replay
 * (`/onboarding?from=settings`). Exit is explicit via `resolveOnboardingExit`
 * — never dependent on navigation history alone.
 */

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { width, height: windowHeight } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const { from } = useLocalSearchParams<{ from?: string }>();

  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollX = useSharedValue(0);
  const [index, setIndex] = useState(0);
  const [measuredPager, setMeasuredPager] = useState(0);
  const pagerHeight =
    measuredPager > 0
      ? measuredPager
      : estimatePagerHeight(windowHeight, insets.top, insets.bottom);
  const last = onboardingSlides.length - 1;
  const markSize = onboardingMarkSize(width, pagerHeight);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
  });

  // The CTA label is React state, so it cannot read the shared value. Settle
  // it once per page rather than on every frame.
  function onMomentumScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    setIndex(Math.round(event.nativeEvent.contentOffset.x / width));
  }

  function goTo(next: number) {
    scrollRef.current?.scrollTo({ x: next * width, animated: !reducedMotion });
    setIndex(next);
  }

  function dismiss() {
    if (onboardingShouldPop(from) && router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(resolveOnboardingExit(from));
  }

  function onPagerLayout(event: LayoutChangeEvent) {
    const next = event.nativeEvent.layout.height;
    setMeasuredPager((current) => (current === next ? current : next));
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <View className="gg-page flex-row items-center justify-between py-3">
        <GridgoLogo role="rider" />
        <Pressable
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel="Skip onboarding"
          className="gg-touch items-end justify-center"
          style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
        >
          <Text className="text-button text-text-secondary">Skip</Text>
        </Pressable>
      </View>

      <View className="flex-1" onLayout={onPagerLayout}>
        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          onMomentumScrollEnd={onMomentumScrollEnd}
          scrollEventThrottle={16}
          style={{ flex: 1 }}
          bounces={false}
        >
          {onboardingSlides.map((slide, slideIndex) => (
            <Slide
              key={slide.id}
              active={slideIndex === index}
              index={slideIndex}
              art={slide.art}
              step={slide.step}
              title={slide.title}
              body={slide.body}
              scrollX={scrollX}
              width={width}
              height={pagerHeight}
              markSize={markSize}
            />
          ))}
        </Animated.ScrollView>
      </View>

      {/*
        The dots belong to the button, not to the empty space above it. Left
        adrift in the corner under a wide gap they read as debris; centred and
        pulled in tight, the pair reads as one control.
      */}
      <View className="gg-page gap-2 pb-2 pt-3">
        <View className="items-center">
          <PaginationDots
            count={onboardingSlides.length}
            activeIndex={index}
            scrollX={scrollX}
            width={width}
            onPress={goTo}
          />
        </View>
        <PrimaryButton
          label={onboardingSlides[index].cta}
          onPress={() => (index === last ? dismiss() : goTo(index + 1))}
        />
      </View>
    </Screen>
  );
}

type SlideProps = {
  /** The settled page, not the scroll position. Drives accessibility only. */
  active: boolean;
  index: number;
  art: OnboardingArt;
  step: string;
  title: string;
  body: string;
  scrollX: SharedValue<number>;
  width: number;
  /** Full pager height so the page captures vertical gesture space. */
  height: number;
  markSize: number;
};

/**
 * One page: the job mark, then the ticket number, then the words.
 *
 * The step number is the job-ticket language the design-system route already
 * uses, and it earns its place here because these three beats are the order
 * a delivery actually moves in — not a decorative count. It is also what
 * states position when motion is off.
 *
 * All three pages stay mounted so the pager can scroll, and fading one out
 * does not take it out of the accessibility tree.
 */
function Slide({
  active,
  index,
  art,
  step,
  title,
  body,
  scrollX,
  width,
  height,
  markSize,
}: SlideProps) {
  const reducedMotion = useReducedMotion();

  const style = useAnimatedStyle(() => {
    if (reducedMotion) return { opacity: 1 };
    const page = width > 0 ? scrollX.value / width : 0;
    return { opacity: Math.max(0, 1 - Math.abs(page - index)) };
  });

  return (
    <Animated.View
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? "auto" : "no-hide-descendants"}
      style={[{ width, height: height > 0 ? height : undefined }, style]}
    >
      <View className="flex-1 items-center justify-center" accessibilityElementsHidden>
        <OnboardingMark name={art} size={markSize} />
      </View>
      <View className="gg-page pb-1">
        <Text className="text-overline text-text-muted">{step}</Text>
        <Text className="mt-1.5 text-h1 text-text-primary" accessibilityRole="header">
          {title}
        </Text>
        <Text className="mt-2 text-body-lg text-text-secondary">{body}</Text>
      </View>
    </Animated.View>
  );
}
