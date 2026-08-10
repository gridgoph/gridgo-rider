import type { User, VerificationStatus } from "@/lib/api";

/**
 * Where a rider account stands with Operations, said honestly.
 *
 * Riders create their own accounts now, so the app has a state it never had
 * before: signed in, correct, and unable to do anything. Every dispatch route
 * answers `403` for it. Showing that as an error, or as an empty offer list,
 * would tell a rider to keep pulling to refresh a screen that will never fill —
 * so it gets its own state, with the wait named and no action invented.
 */

export type ApprovalPresentation = {
  /** True only when Operations has approved the account. */
  canWork: boolean;
  title: string;
  body: string;
  tone: "info" | "warning" | "error" | "success";
  icon: "clock" | "triangle-alert" | "circle-x" | "circle-check";
  /** Short label for the account screen's status row. */
  chip: string;
};

/**
 * An older account with no status field predates self sign-up, and every one of
 * those was created by Operations — so it is approved. Guessing "pending"
 * instead would lock a working rider out of a shift.
 */
export function verificationStatusOf(user: User | null): VerificationStatus {
  return user?.verificationStatus ?? "approved";
}

export function approvalPresentation(user: User | null): ApprovalPresentation {
  const status = verificationStatusOf(user);
  const note = user?.verificationNote?.trim();

  switch (status) {
    case "approved":
      return {
        canWork: true,
        title: "Approved to ride",
        body: "Operations has accredited this account. Offers appear as suppliers mark jobs ready.",
        tone: "success",
        icon: "circle-check",
        chip: "Approved",
      };
    case "pending":
    case "unverified":
      return {
        canWork: false,
        title: "Operations is reviewing your account",
        body: "Your vehicle and licence details are with the GRIDGO team. Nothing is dispatched to a rider until that review is done — you will get an alert here the moment it is.",
        tone: "info",
        icon: "clock",
        chip: "Awaiting approval",
      };
    case "suspended":
      return {
        canWork: false,
        title: "This account is suspended",
        body: note
          ? `Operations has paused dispatch to this account: ${note}`
          : "Operations has paused dispatch to this account. Speak to the GRIDGO team before your next shift.",
        tone: "warning",
        icon: "triangle-alert",
        chip: "Suspended",
      };
    case "rejected":
      return {
        canWork: false,
        title: "This account was not accredited",
        body: note
          ? `Operations did not accredit this account: ${note}`
          : "Operations did not accredit this account. Speak to the GRIDGO team if you think that is wrong.",
        tone: "error",
        icon: "circle-x",
        chip: "Not accredited",
      };
  }
}
