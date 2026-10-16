import { PhoneMissed } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { SecondaryButton } from "@/components/SecondaryButton";
import { useThemeColors } from "@/hooks/useTheme";
import { callTimeLabel, roleWord, type MissedCall } from "@/lib/orderCalls";

type Props = { missed: MissedCall; onCallBack: () => void; onDismiss: () => void };

/**
 * A call to this rider that went unanswered, with the way to return it.
 *
 * Shown on the trip while that person can still be called, and gone as soon
 * as either side calls again. Icon, words and the warning colour together, so
 * it reads in greyscale; never yellow, which belongs to the trip's next step.
 */
export function MissedCallCard({ missed, onCallBack, onDismiss }: Props) {
  const colors = useThemeColors();
  const role = roleWord(missed.person.role).toLowerCase();
  const name = missed.person.firstName.toLowerCase() === role ? `the ${role}` : missed.person.firstName;
  const title = missed.declined ? `You declined a call from ${name}` : `Missed call from ${name}`;
  const body = `The ${role} called at ${callTimeLabel(missed.call.createdAt)}.`;

  return (
    <View className="gap-3 rounded-card border border-warning bg-surface p-4" accessibilityLiveRegion="polite">
      <View className="flex-row gap-3" accessible accessibilityLabel={`${title}. ${body}`}>
        <View className="pt-0.5">
          <PhoneMissed size={18} color={colors.warning} strokeWidth={2} />
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-body font-bold text-text-primary">{title}</Text>
          <Text className="text-body text-text-secondary">{body}</Text>
        </View>
      </View>
      <View className="flex-row flex-wrap items-center gap-3">
        <View className="min-w-[160px] flex-1">
          <SecondaryButton label="Call back" onPress={onCallBack} />
        </View>
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss the missed call"
          className="gg-touch justify-center px-2"
          style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
        >
          <Text className="text-button text-text-primary underline">Dismiss</Text>
        </Pressable>
      </View>
    </View>
  );
}
