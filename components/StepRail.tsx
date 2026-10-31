import { Check, X } from "lucide-react-native";
import { Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import type { JobStepStatus } from "@/lib/jobProgress";

/** Disc diameter: five steps and their labels fit a 320dp screen at 1.3× text. */
const DISC = 28;

type Props = {
  steps: readonly { key: string; label: string; status: JobStepStatus }[];
  /** The whole rail in one sentence for a screen reader. */
  accessibilityLabel: string;
};

/**
 * A numbered sequence of steps on one rail.
 *
 * The current step takes `actionYellow` — the stepper allowance in the yellow
 * rule — because it is the same step the yellow button beside it performs.
 * Done is a filled disc with a tick, upcoming an outline with its number, and
 * a step held by a failed check an error outline with a cross: nothing on it
 * can be performed, so it gives the yellow back. Each reads in greyscale.
 */
export function StepRail({ steps, accessibilityLabel }: Props) {
  const colors = useThemeColors();
  const reached = steps.reduce((last, item, index) => (item.status === "upcoming" ? last : index), -1);

  return (
    <View
      className="flex-row items-start"
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
    >
      {steps.map((item, index) => {
        const done = item.status === "done";
        const now = item.status === "now";
        const held = item.status === "held";

        return (
          <View key={item.key} className="flex-1 items-center gap-2">
            <View style={{ height: DISC }} className="w-full items-center justify-center">
              {/* Rail halves behind the disc: dark up to the step reached, quiet after it. */}
              <View className="absolute inset-x-0 top-1/2 h-0.5 flex-row">
                <View
                  className={index === 0 ? "flex-1" : index <= reached ? "flex-1 bg-accent" : "flex-1 bg-outline"}
                />
                <View
                  className={
                    index === steps.length - 1
                      ? "flex-1"
                      : index < reached
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
                      : held
                        ? "items-center justify-center rounded-pill border-2 border-error bg-surface"
                        : "items-center justify-center rounded-pill border border-outline bg-surface"
                }
              >
                {done ? (
                  <Check size={14} color={colors.accentOn} strokeWidth={3} />
                ) : held ? (
                  <X size={14} color={colors.error} strokeWidth={3} />
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
                now || held
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
