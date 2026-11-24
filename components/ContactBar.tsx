import { useRouter, type Href } from "expo-router";
import { CircleAlert, MessageSquare, Navigation, Phone, type LucideIcon } from "lucide-react-native";
import { Text, View } from "react-native";
import { Pressable } from "@/components/Pressable";

import { useThemeColors } from "@/hooks/useTheme";
import type { Order } from "@/lib/api";
import { deliveryChatOf, deliveryChatRoute } from "@/lib/deliveryChat";
import { receiverWord } from "@/lib/groupOrder";
import { isHomePrinter } from "@/lib/homePrinter";
import { callWindow, pairOfParty } from "@/lib/orderCalls";
import { openNavigation, type NavigationHandoff } from "@/lib/mapsNavigation";
import { pickupChatOf, pickupChatRoute } from "@/lib/pickupChat";
import type { TripChatParty } from "@/lib/tripChat";
import { useCall } from "@/store/call";

type Props = {
  trip: Pick<Order, "id" | "state" | "deliveryChat" | "pickupChat" | "groupOrder"> & Partial<Pick<Order, "printerType" | "supplierContact">>;
  /** Who is at the stop: the shop until pick-up, the client after. */
  party: TripChatParty;
  /** The hand-off to the rider's maps app; omit to leave Navigate off the bar. */
  directions?: NavigationHandoff | null;
};

/**
 * The people at the stop, a thumb away: navigate there, call, message, and
 * report a problem to Operations (the support chat — the existing route for a
 * problem report). Each a 56pt square with a glyph and a word. A control whose
 * window is closed stays in its place, greyed, rather than moving the others.
 */
export function ContactBar({ trip, party, directions }: Props) {
  const router = useRouter();
  // A group order is handed to its host, the only member calls and chat reach.
  const who = party === "shop" ? (isHomePrinter(trip) ? "the home printer" : "the shop") : `the ${receiverWord(trip)}`;
  const chatOpen = party === "shop" ? Boolean(pickupChatOf(trip)) : Boolean(deliveryChatOf(trip));
  const callOpen = callWindow(trip, party).open;

  function call() {
    // An earlier call's ended screen is not this call.
    useCall.getState().clear();
    useCall.getState().arm(trip.id, pairOfParty(party));
    router.push(`/call?orderId=${encodeURIComponent(trip.id)}&pair=${pairOfParty(party)}` as Href);
  }

  return (
    <View className="flex-row gap-2">
      {directions !== undefined ? (
        <QuickAction
          icon={Navigation}
          label="Navigate"
          spoken={`Navigate to ${who} in your maps app`}
          disabled={!directions}
          onPress={() => directions && void openNavigation(directions).catch(() => undefined)}
        />
      ) : null}
      <QuickAction icon={Phone} label="Call" spoken={`Call ${who}`} disabled={!callOpen} onPress={call} />
      <QuickAction
        icon={MessageSquare}
        label="Message"
        spoken={`Message ${who}`}
        disabled={!chatOpen}
        onPress={() => router.push(party === "shop" ? pickupChatRoute(trip.id) : deliveryChatRoute(trip.id))}
      />
      <QuickAction
        icon={CircleAlert}
        label="Problem"
        spoken="Report a problem to GRIDGO Operations"
        onPress={() => router.push("/chat" as Href)}
      />
    </View>
  );
}

function QuickAction({
  icon: Icon,
  label,
  spoken,
  disabled = false,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  spoken: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityState={{ disabled }}
      className={
        disabled
          ? "min-h-14 flex-1 items-center justify-center gap-1 rounded-field border border-outline-subtle bg-surface-variant"
          : "min-h-14 flex-1 items-center justify-center gap-1 rounded-field border border-outline bg-surface"
      }
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <Icon size={20} color={disabled ? colors.textMuted : colors.textPrimary} strokeWidth={2} />
      <Text className={disabled ? "text-caption text-text-muted" : "text-caption font-bold text-text-primary"}>
        {label}
      </Text>
    </Pressable>
  );
}
