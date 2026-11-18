import { ScrollView } from "react-native";

import { ApprovalNotice } from "@/components/ApprovalNotice";
import { EmptyState } from "@/components/EmptyState";
import { LegalNoticeBanner } from "@/components/legal/LegalNoticeBanner";
import { LocationHealthCard } from "@/components/LocationHealthCard";
import { LocationSharingBanner } from "@/components/LocationSharingBanner";
import { PushEnableCard } from "@/components/PushEnableCard";
import { Screen } from "@/components/Screen";
import { useAttention } from "@/hooks/useAttention";
import { useLocationHealth } from "@/hooks/useLocationHealth";
import { fixNeedsAttention, useTripFixFreshness } from "@/hooks/useTripFixFreshness";
import { approvalPresentation } from "@/lib/riderApproval";
import { locationAudience } from "@/lib/riderOrder";
import { useActiveTrip } from "@/store/activeTrip";
import { useSession } from "@/store/session";

/**
 * What the map's warning chip stands for, in full (#180).
 *
 * The cards are the same ones that used to sit at the top of every tab —
 * approval, job alerts, a changed agreement, location health and a stale fix
 * on a job — each with its own fix. Pushed from `AttentionChip`; nothing here is new state.
 */
export default function AttentionScreen() {
  const user = useSession((s) => s.user);
  const trip = useActiveTrip((s) => s.order);
  const canWork = approvalPresentation(user).canWork;
  const audience = trip ? locationAudience(trip.state) : null;
  const health = useLocationHealth({ enabled: canWork && audience != null, watcher: audience ?? "client" });
  const freshness = useTripFixFreshness(trip, canWork);
  const attention = useAttention(health.issues.length + (fixNeedsAttention(freshness) ? 1 : 0));

  return (
    <Screen edges={[]}>
      <ScrollView className="flex-1" contentContainerClassName="gg-page gap-6 pb-10 pt-4">
        {audience ? (
          <LocationHealthCard issues={health.issues} watcher={audience} onFix={(fix) => void health.fix(fix)} />
        ) : null}
        {/* An aged fix with every setting right: the health card has nothing to say about it. */}
        {audience && freshness?.level === "stale" ? (
          <LocationSharingBanner sharing={false} freshness={freshness} audience={audience} />
        ) : null}
        {!canWork ? <ApprovalNotice /> : null}
        <PushEnableCard />
        <LegalNoticeBanner />
        {!attention ? (
          <EmptyState
            icon="trip"
            title="Nothing needs you"
            body="Alerts, location and your account are all set. Anything that needs fixing shows as a chip on the map."
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}
