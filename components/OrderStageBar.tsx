import { Check, ClipboardCheck, MapPin, Navigation, Package, TriangleAlert } from "lucide-react-native";
import { Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import {
  ORDER_STAGES,
  stageState,
  type OrderStage,
  type OrderStageCode,
  type StageState,
} from "@/lib/orderStage";

const GLYPHS = {
  assigned: Package,
  checked: ClipboardCheck,
  on_the_way: Navigation,
  delivered: MapPin,
} as const satisfies Record<OrderStageCode, unknown>;

/** Disc diameter. 32dp keeps four steps and their labels on a 320dp screen. */
const DISC = 32;
/** Room for the current step's ring to sit outside the disc without moving it. */
const HALO = 42;

type Props = {
  progress: OrderStage;
};

/**
 * Where the job is, as four steps.
 *
 * Deliberately monochrome. The design system allows an active stepper step to
 * take `actionYellow`, and the legacy card this reproduces leaned on it hard —
 * but that card was the only thing on its screen, and these sit several to a
 * list. Four alerts would put four yellow discs on one screen and spend the
 * whole attention budget on a status readout nobody taps.
 *
 * So progress is said in fill and glyph instead: a done step is a filled disc
 * with a tick, the current step is filled and ringed, an upcoming step is an
 * outline, and a blocked step is the error tone with a warning glyph. Reads the
 * same in greyscale, which the colour version would not have.
 */
export function OrderStageBar({ progress }: Props) {
  const colors = useThemeColors();

  const spoken = ORDER_STAGES.map((stage, index) => {
    const state = stageState(index, progress);
    if (state === "blocked") return `${stage.spoken}: on hold`;
    if (state === "current") return `${stage.spoken}: now`;
    if (state === "done") return `${stage.spoken}: done`;
    return null;
  })
    .filter(Boolean)
    .join(". ");

  return (
    <View
      className="flex-row items-start"
      accessibilityRole="progressbar"
      accessibilityLabel={`${progress.summary}. ${spoken}`}
    >
      {ORDER_STAGES.map((stage, index) => {
        const state = stageState(index, progress);
        const Glyph = state === "blocked" ? TriangleAlert : GLYPHS[stage.code];
        const reached = state === "done" || state === "current";

        return (
          <View key={stage.code} className="flex-1 items-center gap-2">
            {/*
              The rail is drawn per step, behind the disc, rather than as one
              absolutely-positioned line: four columns of equal flex already
              know where their own neighbours are, and a measured overlay is one
              more thing to get wrong on a narrow phone.
            */}
            <View
              style={{ height: HALO }}
              className="w-full items-center justify-center"
            >
              <View className="absolute inset-x-0 top-1/2 h-0.5 flex-row">
                <View
                  className={
                    index === 0
                      ? "flex-1"
                      : reached
                        ? "flex-1 bg-accent"
                        : "flex-1 bg-outline"
                  }
                />
                <View
                  className={
                    index === ORDER_STAGES.length - 1
                      ? "flex-1"
                      : stageState(index + 1, progress) === "upcoming"
                        ? "flex-1 bg-outline"
                        : "flex-1 bg-accent"
                  }
                />
              </View>

              {/*
                The ring lives on a fixed-size wrapper so marking the current
                step never resizes the disc or nudges the row — the step the
                rider is watching is the one that must not move.
              */}
              <View
                style={{ width: HALO, height: HALO }}
                className={
                  state === "current"
                    ? "items-center justify-center rounded-pill border-2 border-accent bg-surface"
                    : "items-center justify-center rounded-pill"
                }
              >
                <View style={{ width: DISC, height: DISC }} className={discClass(state)}>
                  {state === "done" ? (
                    <Check size={16} color={colors.accentOn} strokeWidth={3} />
                  ) : (
                    <Glyph
                      size={16}
                      strokeWidth={2.5}
                      color={
                        state === "blocked"
                          ? colors.error
                          : state === "current"
                            ? colors.accentOn
                            : colors.textMuted
                      }
                    />
                  )}
                </View>
              </View>
            </View>

            <Text
              numberOfLines={2}
              maxFontSizeMultiplier={1.4}
              className={
                reached || state === "blocked"
                  ? "text-center text-caption font-medium text-text-primary"
                  : "text-center text-caption text-text-muted"
              }
            >
              {stage.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** Fill and border per state — the part that has to survive greyscale. */
function discClass(state: StageState): string {
  const base = "items-center justify-center rounded-pill";
  switch (state) {
    case "done":
      return `${base} bg-accent`;
    case "current":
      // Filled like a done step, but carrying its own glyph rather than a tick,
      // and wearing the ring above. Fill alone would be indistinguishable.
      return `${base} bg-accent`;
    case "blocked":
      return `${base} border-2 border-error bg-surface`;
    case "upcoming":
      return `${base} border border-outline bg-surface`;
  }
}
