import { StepRail } from "@/components/StepRail";
import { HANDOVER_STEPS, type HandoverStep } from "@/lib/shopHandover";

type Props = {
  /** The step this screen performs. */
  current: HandoverStep;
  /** A home printer signs, not a shop. */
  home?: boolean;
};

/**
 * Where the rider is in the counter sequence of a `rider_packs` job: check the
 * items unpacked, photograph them packed, the shop signs.
 *
 * The three screens are separate pushed steps, so without this a rider sees
 * one screen at a time and cannot tell how much of the counter is left, or why
 * a signature is not on offer yet. It is a real sequence, so the steps are
 * numbered, on the same rail Active draws the whole job on.
 */
export function HandoverSteps({ current, home = false }: Props) {
  const currentIndex = HANDOVER_STEPS.findIndex((item) => item.step === current);
  const steps = home
    ? HANDOVER_STEPS.map((item) => (item.step === "sign" ? { ...item, label: "Printer signs" } : item))
    : HANDOVER_STEPS;

  const spoken = steps.map((item, index) =>
    index < currentIndex ? `${item.label}: done` : index === currentIndex ? `${item.label}: now` : null,
  )
    .filter(Boolean)
    .join(". ");

  return (
    <StepRail
      steps={steps.map((item, index) => ({
        key: item.step,
        label: item.label,
        status: index < currentIndex ? "done" : index === currentIndex ? "now" : "upcoming",
      }))}
      accessibilityLabel={`Step ${currentIndex + 1} of ${HANDOVER_STEPS.length} at the counter. ${spoken}`}
    />
  );
}
