import { useEffect } from "react";

import { TesterCheckInCard } from "@/components/TesterCheckInCard";
import { TesterFeedbackCard } from "@/components/TesterFeedbackCard";
import { feedbackAllowed, feedbackToShow, testerCardView } from "@/lib/testerProgram";
import { useSession } from "@/store/session";
import { useTesterProgram } from "@/store/testerProgram";

/**
 * The Google Play tester's one line on Active: the check-in card, or — once
 * today is in and GRIDGO has a feedback ask due — the feedback card in its
 * place, so the screen never grows by two cards. Nothing for anyone not
 * enrolled. Active draws it only with no job in hand, so a trip never moves.
 */
export function TesterSlot() {
  const userId = useSession((s) => s.user?.id ?? null);
  const owner = useTesterProgram((s) => s.owner);
  const program = useTesterProgram((s) => (owner === userId ? s.program : null));
  const held = useTesterProgram((s) => s.held);
  const busy = useTesterProgram((s) => s.checkingIn);
  const failed = useTesterProgram((s) => s.checkInFailed);
  const readAt = useTesterProgram((s) => s.readAt);

  const view = testerCardView(program);
  const feedback =
    program?.enrolled && feedbackAllowed(program) ? feedbackToShow(program.nudge, held, userId, readAt) : null;
  const freshTrigger = feedback?.fresh ? feedback.trigger : null;

  // A card GRIDGO offered is "shown" the moment it is drawn, and held from then on.
  useEffect(() => {
    if (freshTrigger) useTesterProgram.getState().feedbackShown(freshTrigger);
  }, [freshTrigger]);

  if (feedback) {
    return (
      <TesterFeedbackCard
        onOpen={() => void useTesterProgram.getState().feedbackTapped()}
        onDismiss={() => useTesterProgram.getState().feedbackDismissed()}
      />
    );
  }
  if (!view) return null;
  return (
    <TesterCheckInCard
      view={view}
      busy={busy}
      failed={failed}
      onCheckIn={() => void useTesterProgram.getState().checkIn()}
    />
  );
}
