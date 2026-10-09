import { useRouter } from "expo-router";
import { Phone } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CallTimer } from "@/components/CallTimer";
import { useThemeColors } from "@/hooks/useTheme";
import { CALL_ROUTE } from "@/hooks/useIncomingCalls";
import { counterpartOf, roleWord } from "@/lib/orderCalls";
import { callInProgress, useCall } from "@/store/call";

/**
 * The way back to a call the rider stepped away from — to read the map, or a
 * message — the way every phone shows a call that is still going.
 *
 * A dark pill (light in Dark) at the top of whatever screen is showing. It
 * names who the call is with, by first name and role, and the time on it.
 * Never yellow: the screen underneath keeps its own one yellow action.
 */
export function OngoingCallBar() {
  const router = useRouter();
  const colors = useThemeColors();
  const { top } = useSafeAreaInsets();
  const snapshot = useCall((s) => s.snapshot);
  const screenOpen = useCall((s) => s.screenOpen);

  if (!snapshot || !callInProgress(snapshot) || screenOpen) return null;

  const person = snapshot.call ? counterpartOf(snapshot.call) : null;
  const role = roleWord(person?.role ?? (snapshot.pair === "pickup" ? "supplier" : "client"));
  const name = person && person.firstName !== role ? `${person.firstName} (${role.toLowerCase()})` : `the ${role.toLowerCase()}`;
  const ringingIn = snapshot.phase === "incoming";
  const label = ringingIn ? `${person?.firstName ?? role} is calling` : `On call with ${name}`;

  return (
    <View style={{ pointerEvents: "box-none", position: "absolute", top: top + 6, left: 16, right: 16, alignItems: "center" }}>
      <Pressable
        onPress={() => router.push(CALL_ROUTE)}
        accessibilityRole="button"
        accessibilityLabel={`${label}. Return to the call`}
        className="min-h-12 flex-row items-center gap-3 rounded-pill bg-accent px-4 py-2"
        style={({ pressed }) => ({
          opacity: pressed ? 0.85 : 1,
          shadowColor: colors.scrim,
          shadowOpacity: 0.25,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
          elevation: 6,
        })}
      >
        <Phone size={18} color={colors.accentOn} strokeWidth={2} />
        <Text className="shrink text-body font-bold text-accent-on" numberOfLines={1}>
          {label}
        </Text>
        {snapshot.phase === "connected" && snapshot.connectedAtMs ? (
          <CallTimer since={snapshot.connectedAtMs} className="text-body text-accent-on" />
        ) : null}
        <Text className="text-body font-medium text-accent-on underline">{ringingIn ? "Answer" : "Return"}</Text>
      </Pressable>
    </View>
  );
}
