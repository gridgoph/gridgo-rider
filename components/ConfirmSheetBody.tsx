import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";

type Props = {
  /** A specific question naming what is about to happen. Never "Are you sure?". */
  question: string;
  /** The consequence, in the rider's terms. */
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  busy?: boolean;
  /** Shown on the confirm control while the action is in flight. */
  busyLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** An error from the last attempt, shown above the buttons. */
  children?: ReactNode;
};

/**
 * The contents of a confirmation sheet.
 *
 * The presentation is the platform's — a `formSheet` route, so the rider gets
 * the system's own spring, drag-to-dismiss and back-gesture handling. This
 * component only owns what is inside it, which is why it draws no scrim, no
 * container and no dismiss affordance of its own.
 *
 * The question names the specific action and the body names the consequence,
 * because "Are you sure?" asks the rider to remember what they just tapped.
 * Inside this sheet the confirm is the only action that matters, so it keeps
 * the yellow.
 */
export function ConfirmSheetBody({
  question,
  body,
  confirmLabel,
  cancelLabel,
  busy = false,
  busyLabel,
  onConfirm,
  onCancel,
  children,
}: Props) {
  return (
    <View className="gap-4 px-4 pb-2 pt-2">
      <View className="gap-2">
        <Text className="text-h3 text-text-primary">{question}</Text>
        <Text className="text-body-lg text-text-secondary">{body}</Text>
      </View>
      {children}
      <View className="gap-3 pt-1">
        <PrimaryButton
          label={busy ? (busyLabel ?? confirmLabel) : confirmLabel}
          onPress={onConfirm}
          disabled={busy}
          size="large"
        />
        <SecondaryButton
          label={cancelLabel}
          onPress={onCancel}
          disabled={busy}
          size="large"
        />
      </View>
    </View>
  );
}
