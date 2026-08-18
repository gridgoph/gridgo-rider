import { useRouter } from "expo-router";
import { Bell, Settings2 } from "lucide-react-native";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { ConfirmModal } from "@/components/ConfirmModal";
import { DestinationRow } from "@/components/DestinationRow";
import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusChip } from "@/components/StatusChip";
import { approvalPresentation } from "@/lib/riderApproval";
import { useActiveTrip } from "@/store/activeTrip";
import { useNotifications } from "@/store/notifications";
import { useSession } from "@/store/session";

/** First letter of the rider's name, for the identity mark. */
function initial(name: string | undefined): string {
  return (name?.trim()[0] ?? "?").toUpperCase();
}

/**
 * Who this phone is signed in as, and the way to everything that is not a
 * daily destination.
 */
export default function AccountScreen() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const logout = useSession((s) => s.logout);
  const unread = useNotifications((s) => s.unread);
  const trip = useActiveTrip((s) => s.order);
  const approval = approvalPresentation(user);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirmSignOut() {
    if (busy) return;
    setBusy(true);
    try {
      await logout();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <Screen edges={["top"]}>
      <ScrollView className="flex-1" contentContainerClassName="gg-page gap-6 pb-10 pt-3">
        <ScreenHeader title="Account" />

        <View className="gg-card flex-row items-center gap-4">
          <View className="h-14 w-14 items-center justify-center rounded-pill bg-accent">
            <Text className="text-h3 text-accent-on">{initial(user?.name)}</Text>
          </View>
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="text-h3 text-text-primary" numberOfLines={1}>
              {user?.name ?? "Signed out"}
            </Text>
            <Text className="text-body text-text-secondary" numberOfLines={1}>
              {user?.email ?? "—"}
            </Text>
            <Text className="text-caption text-text-muted">GRIDGO rider</Text>
          </View>
        </View>

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
            icon={Settings2}
            label="Settings"
            detail="Theme, and the introduction slides"
            onPress={() => router.push("/settings")}
            last
          />
        </View>

        <SecondaryButton label="Sign out" onPress={() => setConfirming(true)} />
      </ScrollView>

      <ConfirmModal
        visible={confirming}
        question="Sign out of GRIDGO?"
        body={
          trip
            ? "This phone will stop sharing your position. The job stays with Operations — signing out does not close it."
            : "Offers stop arriving on this phone. Sign in again when you are ready to ride."
        }
        confirmLabel="Sign out"
        cancelLabel="Stay signed in"
        busy={busy}
        busyLabel="Signing out…"
        onConfirm={() => void confirmSignOut()}
        onCancel={() => {
          if (!busy) setConfirming(false);
        }}
      />
    </Screen>
  );
}
