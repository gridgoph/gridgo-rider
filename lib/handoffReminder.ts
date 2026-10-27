import type { EvidenceUpload, ProofEvidence } from "@/lib/proofEvidence";

/**
 * The reminder card at the client's door (gridgo-rider#157).
 *
 * The rider is the only GRIDGO person a client meets, so after the delivery
 * photo the rider reads three short lines: thanks, a rating in the app, and a
 * share with a friend. "I reminded the client" has to be ticked to close a
 * door delivery; "Client agreed to a photo" is optional and opens a photo of
 * the package alone. Rider pay never depends on either (decided 27 Oct 2026).
 *
 * The server keeps the record (gridgo-api `docs/SHARING_AND_REMINDERS_API.md`
 * → *Rider delivery completion*). This build always sends
 * `handoffReminderVersion: 1`; omitting it is the released-app path, which the
 * server records as "not reminded". A drop at GRIDGO Office has no client to
 * remind, so it sends the version alone.
 */
export const HANDOFF_REMINDER_VERSION = 1;

/** Said to the client, in order. Short enough to say while they take the package. */
export const HANDOFF_SCRIPT: readonly string[] = [
  "Thank you for choosing GRIDGO.",
  "Please rate us in the GRIDGO app.",
  "And share your GRIDGO moment with a friend.",
];

export const REMINDED_TICK_LABEL = "I reminded the client";
export const PHOTO_CONSENT_TICK_LABEL = "Client agreed to a photo";
export const PACKAGE_PHOTO_HINT =
  "Photograph the package only. Never the documents inside or any shop signage.";

/** The package photo has no signature fallback, so its camera failures say so. */
export const PACKAGE_CAPTURE_FAILED =
  "No package photo taken. Open the camera again, or close the job without it.";

export type HandoffReminderFields = {
  handoffReminderVersion?: 1;
  remindedClient?: true;
  clientAgreedToPhoto?: boolean;
  packagePhotoFileId?: string;
};

/** What the delivery request carries for the reminder. */
export function handoffReminderFields({
  toOffice,
  reminded,
  photoConsent,
  packagePhotoFileId,
}: {
  toOffice: boolean;
  reminded: boolean;
  photoConsent: boolean;
  packagePhotoFileId: string | null;
}): HandoffReminderFields {
  if (toOffice) return { handoffReminderVersion: HANDOFF_REMINDER_VERSION };
  return {
    handoffReminderVersion: HANDOFF_REMINDER_VERSION,
    // Only ever literal true: the screen will not send an unticked reminder.
    ...(reminded ? { remindedClient: true as const } : {}),
    clientAgreedToPhoto: photoConsent,
    ...(photoConsent && packagePhotoFileId ? { packagePhotoFileId } : {}),
  };
}

/**
 * Why the reminder holds the confirm button, or null.
 *
 * A package photo the rider has taken must either reach the server or be
 * removed: closing while it is still sending would quietly drop something the
 * client agreed to. Not taking one never holds anything.
 */
export function handoffReminderBlockReason({
  toOffice,
  reminded,
  photoConsent,
  packageEvidence,
  packageUpload,
}: {
  toOffice: boolean;
  reminded: boolean;
  photoConsent: boolean;
  packageEvidence: ProofEvidence | null;
  packageUpload: EvidenceUpload;
}): string | null {
  if (toOffice) return null;
  if (!reminded) return `Read the card to the client, then tick "${REMINDED_TICK_LABEL}".`;
  if (!photoConsent || !packageEvidence) return null;
  switch (packageUpload.phase) {
    case "sending":
    case "processing":
      return `Wait for the package photo to save, or untick "${PHOTO_CONSENT_TICK_LABEL}" to close without it.`;
    case "failed":
      return `The package photo did not save. Send it again, or untick "${PHOTO_CONSENT_TICK_LABEL}" to close without it.`;
    default:
      return null;
  }
}

/** Refusals that mean the package photo on file is unusable; the delivery photo is not touched. */
export function isPackagePhotoRefusal(code: string | null | undefined): boolean {
  return (
    code === "package_photo_required" ||
    code === "invalid_package_photo" ||
    code === "package_photo_consent_required"
  );
}
