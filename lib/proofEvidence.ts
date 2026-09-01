/**
 * Proof evidence: the file a rider captures to prove a handover happened.
 *
 * A delivery is only proven when the server has the file. Everything in this
 * module is pure so the gate that blocks "Confirm delivery" can be tested
 * without a camera, a filesystem, or a network.
 */

/** Photo is the default. Signature is the fallback when the camera cannot run. */
export type EvidenceKind = "photo" | "signature";

export type ProofEvidence = {
  kind: EvidenceKind;
  /** Local `file://` URI. Uploads stream from here — never read into memory. */
  uri: string;
  fileName: string;
  mimeType: string;
  capturedAt: string;
  /** Bytes on disk when the platform reports it; null when it does not. */
  sizeBytes: number | null;
};

/**
 * Where a captured file is on its way to the server.
 *
 * `sending` and `processing` are deliberately separate: the transfer finishing
 * is not the same as the server having stored the file, and showing one as the
 * other is how an app ends up claiming proof it does not have.
 */
export type EvidenceUpload =
  | { phase: "idle" }
  | { phase: "sending"; sentBytes: number; totalBytes: number | null }
  | { phase: "processing" }
  | { phase: "stored"; fileId: string }
  | { phase: "failed"; message: string; retryable: boolean };

export const UPLOAD_IDLE: EvidenceUpload = { phase: "idle" };

/**
 * The camera handed us a URI the upload stack cannot open. That is a retake,
 * not a dropped connection — Android camera grants are often `content://`.
 */
export const UNREADABLE_CAPTURE_MESSAGE = "Could not read that photo. Retake it.";

/** True only once the server has confirmed the file and returned its id. */
export function isEvidenceStored(upload: EvidenceUpload): upload is {
  phase: "stored";
  fileId: string;
} {
  return upload.phase === "stored";
}

/** True while the app is mid-transfer or waiting on the server. */
export function isUploadInFlight(upload: EvidenceUpload): boolean {
  return upload.phase === "sending" || upload.phase === "processing";
}

/**
 * Transfer progress as 0–1, or null when the total size is unknown.
 * Never returns 1 while sending — a full bar next to "Sending" reads as done.
 */
export function uploadProgressFraction(upload: EvidenceUpload): number | null {
  if (upload.phase !== "sending") return null;
  if (!upload.totalBytes || upload.totalBytes <= 0) return null;
  const raw = upload.sentBytes / upload.totalBytes;
  if (!Number.isFinite(raw)) return null;
  return Math.min(0.99, Math.max(0, raw));
}

export type UploadStatusLine = {
  label: string;
  detail: string | null;
  tone: "info" | "success" | "error" | "neutral";
  icon: "clock" | "circle-check" | "circle-x";
};

/** Plain-language status for the capture card. Never an error code. */
export function uploadStatusLine(
  upload: EvidenceUpload,
  kind: EvidenceKind = "photo",
): UploadStatusLine | null {
  const noun = kind === "photo" ? "photo" : "signature";
  switch (upload.phase) {
    case "idle":
      return null;
    case "sending": {
      const fraction = uploadProgressFraction(upload);
      return {
        label: `Sending ${noun}`,
        detail:
          fraction == null
            ? "Keep this screen open."
            : `${Math.round(fraction * 100)}% sent. Keep this screen open.`,
        tone: "info",
        icon: "clock",
      };
    }
    case "processing":
      return {
        label: "Sent — the server is still saving it",
        detail: "This takes a few seconds. Do not close the screen.",
        tone: "info",
        icon: "clock",
      };
    case "stored":
      return {
        label: "Saved on the server",
        detail: "This evidence is now attached to the job.",
        tone: "success",
        icon: "circle-check",
      };
    case "failed":
      return {
        label: "Not sent",
        detail: upload.message,
        tone: "error",
        icon: "circle-x",
      };
  }
}

/**
 * Why the confirm button is blocked, in words the rider can act on.
 * Returns null when the step may proceed.
 *
 * This is the hard gate. A delivery without stored evidence is not a delivery.
 */
export function evidenceBlockReason(
  evidence: ProofEvidence | null,
  upload: EvidenceUpload,
  /** What to capture, in the words of the step asking for it. */
  missingPrompt = "Capture the evidence first.",
): string | null {
  if (!evidence) return missingPrompt;
  switch (upload.phase) {
    case "idle":
      return "Send the evidence to the server before confirming.";
    case "sending":
    case "processing":
      return "Wait for the server to save the evidence.";
    case "failed":
      return upload.retryable
        ? "The evidence did not reach the server. Send it again before confirming."
        : "This evidence cannot be stored, so the delivery cannot be proven. Do not hand the package over — call Operations.";
    case "stored":
      return null;
  }
}

/** File name for a capture: readable in a bucket listing, unique per second. */
export function evidenceFileName(
  step: "pickup" | "delivery" | "failed-attempt",
  kind: EvidenceKind,
  atMs: number,
  extension: string,
): string {
  const ext = extension.replace(/^\./, "").toLowerCase() || "jpg";
  return `${step}-${kind}-${atMs}.${ext}`;
}
