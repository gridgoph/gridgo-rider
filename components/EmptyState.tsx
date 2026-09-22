import { Inbox, MapPinned, Wallet, type LucideIcon } from "lucide-react-native";
import { Text, View } from "react-native";

import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { useThemeColors } from "@/hooks/useTheme";

const ICONS = {
  offers: Inbox,
  trip: MapPinned,
  earnings: Wallet,
} satisfies Record<string, LucideIcon>;

export type EmptyStateIcon = keyof typeof ICONS;

type Props = {
  /** Which nothing this is — a glyph the rider already knows from the tab bar. */
  icon: EmptyStateIcon;
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
 *
 * Centred rather than left-aligned in a card, because an empty screen is the
 * whole screen: a small card pinned to the top of 700 empty pixels is what
 * makes an app look unfinished. The glyph is the one from the tab that owns
 * this list, so the rider recognises what is empty before reading a word.
 */
export function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
  secondaryAction = false,
}: Props) {
  const colors = useThemeColors();
  const Icon = ICONS[icon];

  return (
    <View className="items-center gap-4 px-2 py-10">
      <View
        className="h-16 w-16 items-center justify-center rounded-pill border border-outline bg-surface"
        accessibilityElementsHidden
      >
        <Icon size={26} color={colors.textMuted} strokeWidth={1.75} />
      </View>
      <View className="gap-2">
        <Text className="text-center text-h3 text-text-primary">{title}</Text>
        <Text className="text-center text-body text-text-secondary">{body}</Text>
      </View>
      {actionLabel && onAction ? (
        <View className="w-full max-w-72 pt-1">
          {secondaryAction ? (
            <SecondaryButton label={actionLabel} onPress={onAction} />
          ) : (
            <PrimaryButton label={actionLabel} onPress={onAction} />
          )}
        </View>
      ) : null}
    </View>
  );
}
