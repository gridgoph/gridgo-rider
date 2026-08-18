import { StatusChip } from "@/components/StatusChip";
import { approvalPresentation } from "@/lib/riderApproval";
import { useSession } from "@/store/session";

/**
 * Where this account stands with Operations, in two words, on the title line.
 *
 * Nothing at all once the rider is accredited. A permanent green "Approved" on
 * every screen would be the app congratulating itself in the corner of a working
 * shift, and the normal state does not need announcing — only the state that
 * explains why nothing is arriving does.
 *
 * This is the quiet half of a pair. The chip says *what* is true at a glance and
 * never moves; the notice on the screen below says what it means and offers the
 * one thing worth doing about it. It replaced a raised yellow disc in the centre
 * of the tab bar labelled "Not yet" — the same fact, said in the slot the app
 * reserves for whatever moves the rider forward, which made a wait look like a
 * missed action. See `riderAction` for why there is no disc now.
 *
 * Deliberately not a button. A rider under review has nowhere to be sent that
 * they are not already looking at, and a tap that lands on the same screen is
 * worse than no tap at all.
 */
export function ApprovalChip() {
  const user = useSession((s) => s.user);
  const approval = approvalPresentation(user);

  if (approval.canWork) return null;

  return <StatusChip tone={approval.tone} label={approval.chip} icon={approval.icon} />;
}
