import { Text, View } from "react-native";

import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";

type Props = {
  /** What is empty, in plain language. */
  title: string;
  /** What to do next — empty screens invite action. */
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Use secondary styling when the empty state is not the screen's yellow CTA. */
  secondaryAction?: boolean;
};

/**
 * Empty screens invite a next step. Never a shrug.
 */
export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
  secondaryAction = false,
}: Props) {
  return (
    <View className="gg-card mt-6 items-start gap-3">
      <Text className="text-h3 text-text-primary">{title}</Text>
      <Text className="text-body text-text-secondary">{body}</Text>
      {actionLabel && onAction ? (
        secondaryAction ? (
          <SecondaryButton label={actionLabel} onPress={onAction} />
        ) : (
          <PrimaryButton label={actionLabel} onPress={onAction} />
        )
      ) : null}
    </View>
  );
}
