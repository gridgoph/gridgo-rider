import { useMemo } from "react";

import { attentionSummary, type AttentionSummary } from "@/lib/attention";
import { unseenNotices } from "@/lib/legal";
import { pushOffer } from "@/lib/push";
import { approvalPresentation } from "@/lib/riderApproval";
import { legalGateFor, useLegalConsent } from "@/store/legalConsent";
import { useLegalNotices } from "@/store/legalNotices";
import { usePush } from "@/store/push";
import { isSignedIn, useSession } from "@/store/session";

const NO_SEEN: string[] = [];
const NONE: never[] = [];

/**
 * The map's one warning chip, from the same sources the cards it replaces
 * read: approval, the alert permission and channel, unread agreement notices,
 * and the trip's location health (passed in, because only the trip view polls
 * it).
 */
export function useAttention(locationIssues = 0): AttentionSummary {
  const user = useSession((s) => s.user);
  const userId = user?.id ?? null;
  const supported = usePush((s) => s.supported);
  const permission = usePush((s) => s.permission);
  const error = usePush((s) => s.error);
  const channel = usePush((s) => s.channel);
  const notices = useLegalConsent((s) => (legalGateFor(s, userId) === "clear" ? s.notices : NONE));
  const noticesHydrated = useLegalNotices((s) => s.hydrated);
  const seen = useLegalNotices((s) => (userId ? s.seen[userId] : undefined) ?? NO_SEEN);

  const approval = approvalPresentation(user).canWork;
  const push =
    pushOffer({ supported, signedIn: isSignedIn(user), permission, failed: Boolean(error), channel }) !== "hidden";
  const legal = Boolean(userId) && noticesHydrated && unseenNotices(notices, seen).length > 0;

  return useMemo(
    () => attentionSummary({ location: locationIssues > 0, approval: !approval, push, legal }),
    [locationIssues, approval, push, legal],
  );
}
