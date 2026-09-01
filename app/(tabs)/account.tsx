import { useUser } from "@clerk/expo";
import { Bell, ChevronRight, History, Settings2 } from "lucide-react-native";
import { useCallback } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";

import { DestinationRow } from "@/components/DestinationRow";
import { RiderPortrait } from "@/components/RiderPortrait";
import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusChip } from "@/components/StatusChip";
import { useThemeColors } from "@/hooks/useTheme";
import { clerkDisplayName } from "@/lib/clerkAuth";
import { approvalPresentation } from "@/lib/riderApproval";
import { useActiveTrip } from "@/store/activeTrip";
import { useNotifications } from "@/store/notifications";
import { useSession } from "@/store/session";
import { askConfirm } from "@/store/sheets";

/**
 * Who this phone is signed in as, and the way to everything that is not a
 * daily destination.
 *
 * The identity card is also the way into correcting it. This is where a rider
 * reads their own name, so it is where a wrong one is noticed. The chevron is
 * the same one every destination below uses, so the card reads as a way through
 * rather than a panel that happens to respond to a tap.
 */
export default function AccountScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const user = useSession((s) => s.user);
  const logout = useSession((s) => s.logout);
  const refreshUser = useSession((s) => s.refreshUser);
  const { user: clerkUser } = useUser();
  const unread = useNotifications((s) => s.unread);
  const trip = useActiveTrip((s) => s.order);
  const approval = approvalPresentation(user);
  const personName = clerkDisplayName(clerkUser) || user?.name || "Signed out";

  useFocusEffect(
    useCallback(() => {
      void refreshUser();
    }, [refreshUser]),
  );

  async function signOut() {
    const confirmed = await askConfirm({
      question: "Sign out of GRIDGO on this phone?",
      consequence: trip
        ? "This phone will stop sharing your position. The job stays with Operations — signing out does not close it."
        : "Offers stop arriving on this phone. You will need your email and password to get back in.",
      confirmLabel: "Sign out",
      cancelLabel: "Stay signed in",
      destructive: true,
    });
    if (confirmed) void logout();
  }

  return (
    <Screen edges={["top"]}>
      <ScrollView className="flex-1" contentContainerClassName="gg-page gap-6 pb-10 pt-3">
        <ScreenHeader title="Account" />

        <Pressable
          onPress={() => router.push("/rider-details")}
          accessibilityRole="button"
          accessibilityLabel="Your details"
          accessibilityHint="Change your photo, name, number, vehicle, plate and licence"
          className="gg-card gap-3"
          style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
        >
          <View className="flex-row items-center gap-3">
            <RiderPortrait imageUrl={clerkUser?.imageUrl} name={personName} size={56} />
            <View className="min-w-0 flex-1 gap-0.5">
              <Text className="text-h3 text-text-primary" numberOfLines={1}>
                {personName}
              </Text>
              <Text className="text-body text-text-secondary" numberOfLines={1}>
                {user?.email ?? "—"}
              </Text>
              <Text className="text-caption text-text-muted">GRIDGO rider</Text>
            </View>
            <ChevronRight size={20} color={colors.textMuted} accessibilityElementsHidden />
          </View>
        </Pressable>

        {/*
          Accreditation is the one thing about a rider account that changes
          without them doing anything, and the one thing that decides whether
          the rest of the app works. It belongs on the identity screen — with
          Operations' own words when they left any.
        */}
        <View className="gg-card gap-2">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="text-overline text-text-muted">ACCREDITATION</Text>
            <StatusChip
              tone={
                approval.tone === "success"
                  ? "success"
                  : approval.tone === "error"
                    ? "error"
                    : approval.tone === "warning"
                      ? "warning"
                      : "info"
              }
              label={approval.chip}
              icon={approval.icon}
            />
          </View>
          <Text className="text-body text-text-secondary">{approval.body}</Text>
          {user?.riderProfile ? (
            <Text className="text-caption text-text-muted">
              {user.riderProfile.vehicleType} · {user.riderProfile.vehiclePlate} · licence{" "}
              {user.riderProfile.licenseNumber}
            </Text>
          ) : null}
        </View>

        <View className="gg-card-flush">
          <DestinationRow
            icon={Bell}
            label="Alerts"
            detail="Everything dispatch has sent you"
            value={unread > 0 ? `${unread} unread` : null}
            onPress={() => router.push("/alerts")}
          />
          <DestinationRow
            icon={History}
            label="Past jobs"
            detail="Jobs you already carried, and their trail"
            onPress={() => router.push("/past-jobs")}
          />
          <DestinationRow
            icon={Settings2}
            label="Settings"
            detail="Theme, and the introduction slides"
            onPress={() => router.push("/settings")}
            last
          />
        </View>

        <SecondaryButton label="Sign out" onPress={() => void signOut()} />
      </ScrollView>
    </Screen>
  );
}
