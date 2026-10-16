import { useRouter } from "expo-router";

import { REFUSAL_STEP_ACTION, type RefusalStep, type RiderRefusal } from "@/lib/riderRefusals";

type NoticeAction = { actionLabel?: string; onAction?: () => void };

/**
 * The way to the step a refusal names, as an `InlineNotice` action.
 *
 * `here` is the step this screen already is, so a refusal never offers the
 * screen the rider is standing on. Proof steps replace one another, as they do
 * when the rider walks them in order; "Back to the trip" leaves the step.
 */
export function useRefusalAction(orderId: string | null, here: RefusalStep | null) {
  const router = useRouter();

  return function actionFor(refusal: RiderRefusal | null): NoticeAction {
    const step = refusal?.step;
    if (!step || step === here || !orderId) return {};
    const target = REFUSAL_STEP_ACTION[step];
    return {
      actionLabel: target.label,
      onAction: () => {
        if (target.pathname) {
          router.replace({ pathname: target.pathname, params: { orderId } });
        } else if (router.canGoBack()) {
          router.back();
        } else {
          router.replace("/(tabs)/active");
        }
      },
    };
  };
}
