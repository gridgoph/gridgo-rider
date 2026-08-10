import { useRouter } from "expo-router";
import { useCallback } from "react";
import { Text, View } from "react-native";

import { InlineNotice } from "@/components/InlineNotice";
import { SecondaryButton } from "@/components/SecondaryButton";
import { approvalPresentation } from "@/lib/riderApproval";
import { useSession } from "@/store/session";

/**
 * What a rider who cannot yet take work sees where the work would be.
 *
 * Riders sign themselves up now, so there is a real account, correctly signed
 * in, that every dispatch route refuses. Left to the ordinary empty state that
 * reads as "no offers today" and a rider keeps pulling to refresh a list that
 * will never fill. This says what is actually happening and offers the only two
 * moves that exist: check whether the decision has landed, and read what is
 * expected of them in the meantime.
 */
export function ApprovalNotice() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const refreshUser = useSession((s) => s.refreshUser);
  const approval = approvalPresentation(user);

  const check = useCallback(() => {
    void refreshUser();
  }, [refreshUser]);

  if (approval.canWork) return null;

  return (
    <View className="gap-4">
      <InlineNotice
        tone={approval.tone === "success" ? "info" : approval.tone}
        icon={approval.icon}
        title={approval.title}
        body={approval.body}
        actionLabel="Check for a decision"
        onAction={check}
      />

      {user?.riderProfile ? (
        <View className="gg-card gap-2">
          <Text className="text-overline text-text-muted">WHAT OPERATIONS IS REVIEWING</Text>
          <Text className="text-body-lg text-text-primary">
            {user.riderProfile.vehicleType} · {user.riderProfile.vehiclePlate}
          </Text>
          <Text className="text-body text-text-secondary">
            Licence {user.riderProfile.licenseNumber}
          </Text>
          <Text className="text-caption text-text-muted">
            Wrong details hold up the review. Tell Operations if any of this needs correcting.
          </Text>
        </View>
      ) : null}

      <SecondaryButton
        label="See how a GRIDGO delivery works"
        onPress={() => router.push("/onboarding")}
      />
    </View>
  );
}
