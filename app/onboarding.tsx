import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import {
  Pressable,
  StyleSheet,
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
import Svg, { Circle, Defs, LinearGradient, Pattern, Rect, Stop } from "react-native-svg";

import { GridgoLogo } from "@/components/GridgoLogo";
import { PaginationDots } from "@/components/PaginationDots";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import {
  illustrations,
  type IllustrationName,
  type IllustrationPalette,
} from "@/components/illustrations";
import { onboardingSlides } from "@/data/onboarding";
import { useThemeColors } from "@/hooks/useTheme";
import { resolveOnboardingExit } from "@/lib/onboardingExit";
import { fitArt, stageHeight, stageWidth } from "@/lib/onboardingStage";

/**
 * Rider onboarding.
 *
 * Art sits in a fixed layer behind a full-height horizontal pager so a swipe
 * anywhere in the content area advances the page, while the art still drifts
 * at 40% of the text's speed and cross-fades between beats.
 *
 * The content area is split into two reserved regions: a stage across the top
 * that the art may never leave, and the copy below it. The three pieces are
 * drawn at very different proportions — one is half again as tall as it is
 * wide — so a single width cap let the tall one run straight down through the
 * heading. Each piece is fitted to the stage in both directions instead, which
 * makes a collision impossible at any aspect or screen height rather than
 * merely unlikely at the ones to hand.
 *
 * Stage geometry is arithmetic, so it lives in `@/lib/onboardingStage` where it
 * can be tested without a renderer.
 *
 * Entry points: first-run / public (`/onboarding`) and Settings replay
 * (`/onboarding?from=settings`). Exit is explicit via `resolveOnboardingExit`
 * — never dependent on navigation history alone.
 */

export default function OnboardingScreen() {
  const colors = useThemeColors();
  const { width } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const { from } = useLocalSearchParams<{ from?: string }>();

  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollX = useSharedValue(0);
  const [index, setIndex] = useState(0);
  const [pagerHeight, setPagerHeight] = useState(0);
  /*
    The tallest of the three copy blocks, so the stage is the same size on every
    page. Sizing it per page would resize the art mid-swipe as a two-line body
    gave way to a three-line one.
  */
  const [copyHeight, setCopyHeight] = useState(0);

  // `useWindowDimensions` reports 0 on the first web paint, and a negative
  // width is not a valid SVG dimension. The helpers clamp rather than let one
  // through.
  const artWidth = stageWidth(width);
  const artHeight = stageHeight(pagerHeight, copyHeight);
  const last = onboardingSlides.length - 1;

  const palette = {
    ink: colors.accent,
    shade: colors.textSecondary,
    mid: colors.textMuted,
    tint: colors.outline,
    highlight: colors.surface,
  };

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
    router.replace(resolveOnboardingExit(from));
  }

  function onPagerLayout(event: LayoutChangeEvent) {
    setPagerHeight(event.nativeEvent.layout.height);
  }

  const reportCopyHeight = useCallback((height: number) => {
    setCopyHeight((tallest) => (height > tallest ? height : tallest));
  }, []);

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

      {/*
        Content area: the stage behind (no gestures), full-height pager in front
        so a thumb swipe over the illustration, the text, or empty space all
        page.
      */}
      <View className="flex-1" onLayout={onPagerLayout}>
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: artHeight,
            overflow: "hidden",
          }}
        >
          <DotGround width={width} height={artHeight} />
          {onboardingSlides.map((slide, slideIndex) => (
            <Hero
              key={slide.id}
              index={slideIndex}
              art={slide.art}
              scrollX={scrollX}
              width={width}
              maxWidth={artWidth}
              maxHeight={artHeight}
              palette={palette}
            />
          ))}
        </View>

        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          onMomentumScrollEnd={onMomentumScrollEnd}
          scrollEventThrottle={16}
          style={{ flex: 1 }}
          // No vertical scrolling — horizontal pages only.
          bounces={false}
        >
          {onboardingSlides.map((slide, slideIndex) => (
            <Slide
              key={slide.id}
              active={slideIndex === index}
              index={slideIndex}
              step={slide.step}
              title={slide.title}
              body={slide.body}
              scrollX={scrollX}
              width={width}
              height={pagerHeight}
              onCopyHeight={reportCopyHeight}
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

type HeroProps = {
  index: number;
  art: IllustrationName;
  scrollX: SharedValue<number>;
  width: number;
  /** Widest the art may be drawn. */
  maxWidth: number;
  /** Tallest the art may be drawn. Below this the copy begins. */
  maxHeight: number;
  palette: IllustrationPalette;
};

/**
 * One piece of art, fading and drifting as its slide comes into view.
 *
 * All three are stacked and absolutely positioned rather than living inside
 * the pager. That is what lets them travel at 40% of the text's speed, and it
 * keeps the swap between beats a cross-fade rather than a hard cut.
 */
function Hero({
  index,
  art,
  scrollX,
  width,
  maxWidth,
  maxHeight,
  palette,
}: HeroProps) {
  const reducedMotion = useReducedMotion();
  const { Component, aspect } = illustrations[art];
  const size = fitArt(maxWidth, maxHeight, aspect);

  const style = useAnimatedStyle(() => {
    const page = width > 0 ? scrollX.value / width : 0;

    // Reduced motion means no drift and no cross-fade — the art cuts between
    // beats, the way the dots and the text pages already do. Zeroing the
    // translation alone would still leave two pieces dissolving into each
    // other on every swipe.
    if (reducedMotion) {
      return { opacity: Math.round(page) === index ? 1 : 0, transform: [{ translateX: 0 }] };
    }

    const delta = page - index;

    return {
      // Fades out over a little less than a full page, so two pieces never
      // sit on top of each other at half strength.
      opacity: Math.max(0, 1 - Math.abs(delta) * 1.6),
      transform: [{ translateX: -delta * width * 0.4 }],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      /*
        Sat on the bottom of the stage rather than centred in it. The stage is
        sized for the tallest of the three pieces, so centring left the two
        smaller ones hanging in the middle with a hole beneath them; standing
        all three on the same line gives them a common floor and closes it.
      */
      style={[
        StyleSheet.absoluteFillObject,
        { alignItems: "center", justifyContent: "flex-end" },
        style,
      ]}
    >
      <Component width={size.width} height={size.height} palette={palette} />
    </Animated.View>
  );
}

/** Dot pitch. Loose enough to stay texture rather than becoming a grid. */
const GROUND_PITCH = 22;
/**
 * Drawn from `textMuted` rather than `outline`, at a fraction of it.
 *
 * `outline` is a hairline colour picked to be nearly invisible against its own
 * background, which on the Dark canvas made the field mathematically present
 * and visually absent. This lands as texture in both themes: a touch above the
 * black, a touch below the near-white.
 */
const GROUND_OPACITY = 0.28;

/**
 * The ground the art stands on: the GRIDGO mark's own dot matrix, at a whisper.
 *
 * Three illustrations floating in an unbroken field of black read as
 * placeholders waiting for a background. This gives them somewhere to stand
 * using the one texture the brand already owns, and it does the job the
 * hairline rule was doing — separating art from copy — without drawing a line
 * across the picture. It fades out at both ends so it never crowds the logo
 * above or the heading below.
 */
function DotGround({ width, height }: { width: number; height: number }) {
  const colors = useThemeColors();
  if (width <= 0 || height <= 0) return null;

  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFillObject}>
      <Defs>
        <Pattern
          id="ground"
          x="0"
          y="0"
          width={GROUND_PITCH}
          height={GROUND_PITCH}
          patternUnits="userSpaceOnUse"
        >
          <Circle cx={GROUND_PITCH / 2} cy={GROUND_PITCH / 2} r={1.6} fill={colors.textMuted} />
        </Pattern>
        {/* Canvas-coloured, so the field dissolves into the screen rather than
            stopping at an edge of its own. */}
        <LinearGradient id="ground-fade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.canvas} stopOpacity="1" />
          <Stop offset="0.3" stopColor={colors.canvas} stopOpacity="0" />
          <Stop offset="0.72" stopColor={colors.canvas} stopOpacity="0" />
          <Stop offset="1" stopColor={colors.canvas} stopOpacity="1" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width={width} height={height} fill="url(#ground)" opacity={GROUND_OPACITY} />
      <Rect x="0" y="0" width={width} height={height} fill="url(#ground-fade)" />
    </Svg>
  );
}

type SlideProps = {
  /** The settled page, not the scroll position. Drives accessibility only. */
  active: boolean;
  index: number;
  step: string;
  title: string;
  body: string;
  scrollX: SharedValue<number>;
  width: number;
  /** Full pager height so the page captures vertical gesture space. */
  height: number;
  /** Reports this page's copy height, so the art can take what is left. */
  onCopyHeight: (height: number) => void;
};

/**
 * One text page. The step number is the job-ticket language the design-system
 * route already uses, and it earns its place here because these three beats
 * are the order a delivery actually moves in — not a decorative count. It is
 * also what states position when motion is off.
 *
 * The hairline above it is gone. It was drawn across the full width at the top
 * of the copy, which put a rule through the middle of whichever illustration
 * reached that far, and it separated two things the spacing already separates.
 *
 * The page is full-height and transparent above the copy so swipes over the
 * art hit the pager. All three pages stay mounted so the pager can scroll,
 * and fading one out does not take it out of the accessibility tree.
 */
function Slide({
  active,
  index,
  step,
  title,
  body,
  scrollX,
  width,
  height,
  onCopyHeight,
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
      <View className="flex-1 justify-end">
        <View
          className="gg-page pb-1"
          onLayout={(event) => onCopyHeight(event.nativeEvent.layout.height)}
        >
          <Text className="text-overline text-text-muted">{step}</Text>
          <Text className="mt-1.5 text-h1 text-text-primary" accessibilityRole="header">
            {title}
          </Text>
          <Text className="mt-2 text-body-lg text-text-secondary">{body}</Text>
        </View>
      </View>
    </Animated.View>
  );
}
