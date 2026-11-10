import { useEffect } from "react";
import { router, type Href } from "expo-router";

import { PlayOptInCard } from "@/components/PlayOptInCard";
import { TesterCheckInCard } from "@/components/TesterCheckInCard";
import { TesterFeedbackCard } from "@/components/TesterFeedbackCard";
import { optInCardVisible, PLAY_OPTIN_ROUTE } from "@/lib/playOptIn";
import { feedbackAllowed, feedbackToShow, testerCardView } from "@/lib/testerProgram";
import { playOptInInstall, usePlayOptIn } from "@/store/playOptIn";
import { useSession } from "@/store/session";
import { useTesterProgram } from "@/store/testerProgram";

/**
 * The Google Play tester's one line on Active: the check-in card, or — once
 * today is in and GRIDGO has a feedback ask due — the feedback card in its
 * place, so the screen never grows by two cards. Nothing for anyone not
 * enrolled. Active draws it only with no job in hand, so a trip never moves.
 *
 * Ahead of both, while GRIDGO says to ask an Android APK rider to become a
 * Play tester (`lib/playOptIn.ts`), that ask takes the line — enrolled or
 * not, because enrolment by Operations is not a Play opt-in and an APK never
 * counts. Once the Play build reports in, or the ask is closed for the
 * session, the check-in and feedback cards return.
 */
export function TesterSlot() {
  const userId = useSession((s) => s.user?.id ?? null);
  const owner = useTesterProgram((s) => s.owner);
  const program = useTesterProgram((s) => (owner === userId ? s.program : null));
  const held = useTesterProgram((s) => s.held);
  const busy = useTesterProgram((s) => s.checkingIn);
  const failed = useTesterProgram((s) => s.checkInFailed);
  const readAt = useTesterProgram((s) => s.readAt);
  const optInOwner = usePlayOptIn((s) => s.owner);
  const optIn = usePlayOptIn((s) => (optInOwner === userId ? s.state : null));
  const optInClosed = usePlayOptIn((s) => s.closed);

  const askOptIn = optInCardVisible(optIn, playOptInInstall(), optInClosed);
  const view = askOptIn ? null : testerCardView(program);
  const feedback =
    !askOptIn && program?.enrolled && feedbackAllowed(program) ? feedbackToShow(program.nudge, held, userId, readAt) : null;
  const freshTrigger = feedback?.fresh ? feedback.trigger : null;

  // A card GRIDGO offered is "shown" the moment it is drawn, and held from then on.
  useEffect(() => {
    if (freshTrigger) useTesterProgram.getState().feedbackShown(freshTrigger);
  }, [freshTrigger]);

  // The Play ask is "shown" only once it is actually on screen.
  useEffect(() => {
    if (askOptIn) usePlayOptIn.getState().shown();
  }, [askOptIn]);

  if (askOptIn) {
    return (
      <PlayOptInCard
        onOpen={() => {
          // Before any Gmail input, so a rider who stops there is still seen.
          usePlayOptIn.getState().tapped();
          router.push(`${PLAY_OPTIN_ROUTE}?from=card` as Href);
        }}
        onDismiss={() => usePlayOptIn.getState().dismiss()}
      />
    );
  }
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
