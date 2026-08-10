import { CheckCheck } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";

import { OrderStageBar } from "@/components/OrderStageBar";
import { useThemeColors } from "@/hooks/useTheme";
import type { Notification, Order } from "@/lib/api";
import { orderStage } from "@/lib/orderStage";
import { formatAlertAt } from "@/lib/riderOrder";

type Props = {
  alert: Notification;
  /** The job this alert is about, when it names one and the rider can see it. */
  order: Order | null;
  read: boolean;
  onMarkRead: () => void;
};

/**
 * One alert, with where its job actually is.
 *
 * Three things this carries that a title-and-timestamp row does not:
 *
 * - **A stage bar.** "Dispatch available" does not tell a rider whether that is
 *   the job in their top box or one they closed on Tuesday. The bar answers it
 *   without opening anything, which is what the legacy GRIDGO card got right.
 *   It is drawn from the order, not from the message: the message was true when
 *   it was sent, the order is true now.
 * - **An unread state that survives greyscale.** A lifted surface, a filled
 *   marker, a bold title, and the word "Unread" — four signals, none of them
 *   colour alone.
 * - **Swipe to clear.** Left-to-right off the card marks it read, with the same
 *   action available on a tap for anyone who cannot swipe.
 *
 * The mark is kept on this phone; the demo API returns `read` but has no route
 * to set it. The list says so once at the bottom rather than on every card.
 */
export function AlertCard({ alert, order, read, onMarkRead }: Props) {
  const colors = useThemeColors();
  const progress = order ? orderStage(order) : null;

  const spoken = [
    read ? null : "Unread.",
    alert.title,
    alert.body,
    progress?.summary,
    formatAlertAt(alert.at),
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <ReanimatedSwipeable
      friction={2}
      rightThreshold={48}
      enabled={!read}
      onSwipeableWillOpen={onMarkRead}
      renderRightActions={() => (
        <View className="my-1 w-24 items-center justify-center rounded-card bg-surface-variant">
          <CheckCheck size={20} color={colors.textSecondary} strokeWidth={2} />
          <Text className="mt-1 text-caption text-text-secondary">Read</Text>
        </View>
      )}
    >
      <Pressable
        onPress={onMarkRead}
        disabled={read}
        accessibilityRole="button"
        accessibilityLabel={spoken}
        accessibilityHint={read ? undefined : "Marks this alert read"}
        /*
          Read alerts recede; unread ones stay on `surface`. The obvious move
          was to lift unread onto `surfaceHigh`, but in Light that token is
          `#FFFFFF` — the same as `surface` — so the whole unread state would
          have come to nothing on half the product. `surfaceVariant` differs
          from `surface` in both themes, so receding works where lifting could
          not, and the brighter card is the unread one either way.
        */
        className={
          read
            ? "my-1 gap-4 rounded-card border border-outline-subtle bg-surface-variant p-4"
            : "my-1 gap-4 rounded-card border border-outline bg-surface p-4"
        }
        style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
      >
        <View className="flex-row gap-3">
          {/*
            Unread is a filled disc against an outlined one — shape first, so
            the list still reads with the colour taken away.
          */}
          <View
            className={
              read
                ? "mt-1.5 h-2.5 w-2.5 rounded-pill border border-outline"
                : "mt-1.5 h-2.5 w-2.5 rounded-pill bg-accent"
            }
          />
          <View className="min-w-0 flex-1 gap-1">
            <Text
              className={
                read
                  ? "text-body-lg text-text-primary"
                  : "text-body-lg font-bold text-text-primary"
              }
            >
              {alert.title}
            </Text>
            <Text className="text-body text-text-secondary">{alert.body}</Text>
            <Text className="text-caption text-text-muted">
              {formatAlertAt(alert.at)}
              {read ? "" : " · Unread"}
            </Text>
          </View>
        </View>

        {progress && progress.index >= 0 ? (
          <View className="gap-2 border-t border-outline-subtle pt-4">
            <OrderStageBar progress={progress} />
            <Text className="text-caption text-text-muted">{progress.summary}</Text>
          </View>
        ) : null}
      </Pressable>
    </ReanimatedSwipeable>
  );
}
