import { Check } from "lucide-react-native";
import { Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { HANDOVER_STEPS, type HandoverStep } from "@/lib/shopHandover";

/** Disc diameter: three steps and their labels fit a 320dp screen at 1.3× text. */
const DISC = 28;

type Props = {
  /** The step this screen performs. */
  current: HandoverStep;
};

/**
 * Where the rider is in the counter sequence of a `rider_packs` job: check the
 * items unpacked, photograph them packed, the shop signs.
 *
 * The three screens are separate pushed steps, so without this a rider sees
 * one screen at a time and cannot tell how much of the counter is left, or why
 * a signature is not on offer yet. It is a real sequence, so the steps are
 * numbered.
 *
 * The current step takes `actionYellow` — the stepper allowance in the yellow
 * rule — because it is the same step the yellow button below performs. Done is
 * a filled disc with a tick, upcoming an outline with its number, so it reads
 * the same in greyscale.
 */
export function HandoverSteps({ current }: Props) {
  const colors = useThemeColors();
  const currentIndex = HANDOVER_STEPS.findIndex((item) => item.step === current);

  const spoken = HANDOVER_STEPS.map((item, index) =>
    index < currentIndex ? `${item.label}: done` : index === currentIndex ? `${item.label}: now` : null,
  )
    .filter(Boolean)
    .join(". ");

  return (
    <View
      className="flex-row items-start"
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${currentIndex + 1} of ${HANDOVER_STEPS.length} at the counter. ${spoken}`}
    >
      {HANDOVER_STEPS.map((item, index) => {
        const done = index < currentIndex;
        const now = index === currentIndex;

        return (
          <View key={item.step} className="flex-1 items-center gap-2">
            <View style={{ height: DISC }} className="w-full items-center justify-center">
              {/* Rail halves behind the disc: dark up to the current step, quiet after it. */}
              <View className="absolute inset-x-0 top-1/2 h-0.5 flex-row">
                <View
                  className={index === 0 ? "flex-1" : index <= currentIndex ? "flex-1 bg-accent" : "flex-1 bg-outline"}
                />
                <View
                  className={
                    index === HANDOVER_STEPS.length - 1
                      ? "flex-1"
                      : index < currentIndex
                        ? "flex-1 bg-accent"
                        : "flex-1 bg-outline"
                  }
                />
              </View>

              <View
                style={{
                  width: DISC,
                  height: DISC,
                  ...(now ? { backgroundColor: colors.actionYellow } : null),
                }}
                className={
                  done
                    ? "items-center justify-center rounded-pill bg-accent"
                    : now
                      ? "items-center justify-center rounded-pill"
                      : "items-center justify-center rounded-pill border border-outline bg-surface"
                }
              >
                {done ? (
                  <Check size={14} color={colors.accentOn} strokeWidth={3} />
                ) : (
                  <Text
                    maxFontSizeMultiplier={1.2}
                    className={now ? "text-caption font-bold" : "text-caption font-bold text-text-muted"}
                    style={now ? { color: colors.actionYellowOn } : undefined}
                  >
                    {index + 1}
                  </Text>
                )}
              </View>
            </View>

            <Text
              numberOfLines={2}
              maxFontSizeMultiplier={1.4}
              className={
                now
                  ? "text-center text-caption font-bold text-text-primary"
                  : done
                    ? "text-center text-caption text-text-secondary"
                    : "text-center text-caption text-text-muted"
              }
            >
              {item.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
