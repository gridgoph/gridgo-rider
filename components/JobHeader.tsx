import type { ReactNode } from "react";
import { Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { PrimaryButton } from "@/components/PrimaryButton";
import { StepRail } from "@/components/StepRail";
import { StopList } from "@/components/StopList";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import type { JobProgress } from "@/lib/jobProgress";

type Props = {
  pickup: string;
  dropoff: string;
  progress: JobProgress;
  /** The step's own move, or null while there is none (on hold, closed). */
  action: { label: string; onPress: () => void } | null;
  /** What the step asks of the rider, under its button. */
  children?: ReactNode;
};

/**
 * The top of the job in hand (#163): where it is collected, where it goes, and
 * the one step that is next — then that step's button and its instruction.
 *
 * A rider glancing down at a counter or a door should not have to hunt for
 * any of the three, so they sit together above everything else on Active, and
 * the step's action directly under them is the screen's only yellow button.
 * Every step stays on the rail with its done mark, so the rider can see how
 * much of the job is behind them and how much is left.
 */
export function JobHeader({ pickup, dropoff, progress, action, children }: Props) {
  const reducedMotion = useReducedMotion();
  const spoken = progress.steps.map((step) => `${step.label}: ${SPOKEN[step.status]}`).join(". ");

  return (
    <View className="gap-3">
      <View className="gg-card gap-4">
        <StopList
          pickup={pickup}
          dropoff={dropoff}
          done={{ pickup: progress.pickupDone, dropoff: progress.dropoffDone }}
        />
        <View className="gap-3 border-t border-outline-subtle pt-3">
          <View className="gap-0.5">
            <Text className="text-overline text-text-muted">{progress.overline}</Text>
            <Text className="text-h3 text-text-primary">{progress.title}</Text>
          </View>
          <StepRail steps={progress.steps} accessibilityLabel={`${progress.overline}. ${spoken}`} />
        </View>
      </View>

      {/*
        Status is the rail; this button is the move. Straight under the card so
        it stays above the tab bar on a 360×640 phone — the step's instruction
        follows it, and the screen the button opens says the rest. Keyed on the
        step so a new step arrives as a new button rather than the old one
        changing its words.
      */}
      {action ? (
        <Animated.View
          key={action.label}
          entering={reducedMotion ? undefined : FadeIn.duration(200)}
        >
          <PrimaryButton label={action.label} onPress={action.onPress} size="large" />
        </Animated.View>
      ) : null}

      {children}
    </View>
  );
}

const SPOKEN = { done: "done", now: "next", held: "on hold", upcoming: "to do" } as const;
