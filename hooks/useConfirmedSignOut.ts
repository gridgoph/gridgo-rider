import { useActiveTrip } from "@/store/activeTrip";
import { useSession } from "@/store/session";
import { askConfirm } from "@/store/sheets";

/**
 * Sign out, after saying what it costs. Account and the agreement screen both
 * offer it, and a rider carrying a job is told the job stays theirs.
 */
export function useConfirmedSignOut(): () => Promise<void> {
  const logout = useSession((s) => s.logout);
  const trip = useActiveTrip((s) => s.order);

  return async () => {
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
  };
}
