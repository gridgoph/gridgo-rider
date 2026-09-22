import {
  createUploadTask,
  FileSystemUploadType,
} from "expo-file-system/legacy";

import { getApiBase, resolveBearer } from "@/lib/api";
import {
  UNREADABLE_CAPTURE_MESSAGE,
  type EvidenceUpload,
  type ProofEvidence,
} from "@/lib/proofEvidence";

/**
 * Proof files, against the GRIDGO storage contract (`gridgo-api`
 * `docs/STORAGE_API.md`).
 *
 * Storing evidence is two server steps, and the rider is told about both:
 *
 * 1. `POST /files` streams the bytes. Exactly one binary `file` part and one
 *    text `purpose` part — any other field is rejected outright, so the order
 *    id does not travel with the upload. A `201` carrying `file.fileId` is the
 *    first honest success: MinIO has the object and the record says `ready`.
 * 2. `POST /files/:fileId/attach` binds that file to the order. Until this
 *    returns, the file exists but nothing points at it, so nothing is proven.
 *
 * Progress reaching 100% is not success — the contract says so explicitly, and
 * this module keeps "sending" and "saving" as separate states for that reason.
 *
 * The bytes leave the phone through the native file uploader, streamed from a
 * `file://` cache copy — never read into JavaScript, never sent as a camera
 * `content://` grant. That grant cannot be opened by XHR, which then reported
 * a dropped connection even while GET /orders still worked.
 */

/**
 * The purposes a rider may upload under.
 *
 * A delivery needs the first two, from the same moment at the door: the
 * delivery photo is the rider's evidence that the handover happened, and the
 * delivered Proof of Fulfilment is what releases the supplier's third
 * milestone. The server binds a file to exactly one purpose and will not
 * rebind it, so one capture is sent twice rather than asking a rider to
 * photograph the same doorstep twice.
 *
 * The third is the supplier's signature at the shop counter: a PNG of the
 * pad, attached before the pickup checklist names it.
 */
export type EvidencePurpose = "delivery_photo" | "fulfilment_proof" | "handoff_signature";

export type EvidenceTarget = {
  purpose: EvidencePurpose;
  /** Required for `fulfilment_proof`; the rider may only attach `delivered`. */
  milestoneCode?: "delivered";
};

/** What a delivery has to store before the server will record it. */
export const DELIVERY_TARGETS: readonly EvidenceTarget[] = [
  { purpose: "delivery_photo" },
  { purpose: "fulfilment_proof", milestoneCode: "delivered" },
];

/** What a failed pickup check has to store before it can be escalated. */
export const PICKUP_FAILURE_TARGETS: readonly EvidenceTarget[] = [
  { purpose: "delivery_photo" },
];

/** What the supplier's signature is stored as before the checklist can name it. */
export const HANDOFF_SIGNATURE_TARGETS: readonly EvidenceTarget[] = [
  { purpose: "handoff_signature" },
];

/** Contract limit for `delivery_photo` — the smaller of the two, so it governs. */
export const MAX_EVIDENCE_BYTES = 20 * 1024 * 1024;

export type StoredFile = {
  fileId: string;
  purpose: string;
  originalFilename: string;
  detectedContentType: string;
  size: number;
  state: string;
};

/** The server cannot store files at all right now — not a per-file failure. */
export class StorageUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageUnavailableError";
  }
}

/** File ids the server accepted, keyed by the purpose they were stored under. */
export type StoredEvidence = Partial<Record<EvidencePurpose, string>>;

export type UploadHandle = {
  result: Promise<StoredEvidence>;
  cancel: () => void;
};

type UploadArgs = {
  orderId: string;
  evidence: ProofEvidence;
  /** Every purpose this capture has to be stored under before it counts. */
  targets: readonly EvidenceTarget[];
  onPhase: (phase: EvidenceUpload) => void;
};

type ApiFailure = { error?: string; message?: string; maxMiB?: number };

/**
 * Turn a documented error code into something a rider can act on.
 *
 * The contract's `message` is written for a developer holding a curl command;
 * these are written for someone standing at a gate. The code itself never
 * reaches the screen.
 */
export function storageErrorMessage(code: string | undefined, status: number): string {
  switch (code) {
    case "heic_not_supported":
      return "Your phone saved that photo in a format the server cannot read. Set your camera to Most Compatible, or capture a signature instead.";
    case "file_type_mismatch":
    case "content_type_not_allowed":
    case "purpose_media_type_not_allowed":
      return "The server would not accept that image. Retake it with the in-app camera.";
    case "file_too_large":
      return "That photo is too large to send. Retake it — the in-app camera saves a smaller file.";
    case "file_empty":
    case "filename_required":
    case "file_required":
    case "invalid_multipart":
      return "The photo did not come through in one piece. Retake it and send again.";
    case "delivery_photo_upload_not_allowed":
      return "This job is not at a stage that accepts evidence. Pull down on your trip to refresh it.";
    case "handoff_signature_upload_not_allowed":
      return "This job has already left the shop, so a signature cannot be added now. Pull down on your trip to refresh it.";
    case "forbidden":
      return "This job is not assigned to you any more. Refresh your trip.";
    case "unauthorized":
      return "Your session has expired. Sign in again, then send the evidence.";
    case "order_not_found":
      return "That job no longer exists. Refresh your trip and speak to Operations.";
    case "invalid_milestone_code":
    case "milestone_not_found":
      return "This job has no payout step for that proof. The delivery photo is enough — confirm the drop-off.";
    case "file_already_attached":
    case "file_not_ready":
    case "file_state_conflict":
    case "file_metadata_invalid":
      return "That file could not be attached to the job. Retake the photo and send it again.";
    case "storage_object_missing":
    case "storage_object_mismatch":
      return "The server lost part of that upload. Retake the photo and send it again.";
    case "minio_unavailable":
      return "The file store is offline, so evidence cannot be saved. Tell Operations before you leave.";
    case "storage_initializing":
      return "The file store is still starting up. Wait a moment and send it again.";
    default:
      if (status >= 500) {
        return "The server could not save the file just now. Send it again in a moment.";
      }
      return "The server refused the file. Send it again, and call Operations if it keeps failing.";
  }
}

/** Failures worth offering a retry for. A rejected format will not fix itself. */
function isRetryable(code: string | undefined, status: number): boolean {
  if (status >= 500) return true;
  switch (code) {
    case "heic_not_supported":
    case "file_type_mismatch":
    case "content_type_not_allowed":
    case "purpose_media_type_not_allowed":
    case "file_too_large":
    case "unauthorized":
    case "forbidden":
    case "order_not_found":
    case "delivery_photo_upload_not_allowed":
    case "invalid_milestone_code":
    case "milestone_not_found":
      return false;
    default:
      return true;
  }
}

/**
 * A Proof of Fulfilment attach that names a `delivered` milestone this order
 * does not have.
 *
 * Completing a delivery only needs the delivery photo. Seeded jobs and some
 * collected office drops have no payout steps at all, so hanging a second
 * purpose on `delivered` is refused even though the photo already landed.
 * That refusal must not strand the rider on "Not sent".
 */
export function isOptionalFulfilmentProofFailure(code: string | undefined): boolean {
  return code === "invalid_milestone_code" || code === "milestone_not_found";
}

function parseFailure(text: string): ApiFailure {
  try {
    return JSON.parse(text) as ApiFailure;
  } catch {
    return {};
  }
}

type CancellableUpload = { cancelAsync: () => Promise<void> };

/**
 * Stream one capture to the server and bind it to the job.
 *
 * Resolves only once the attach call confirms the file is on the order. Any
 * other outcome rejects, and `onPhase` has already told the rider why.
 */
export function uploadEvidence({
  orderId,
  evidence,
  targets,
  onPhase,
}: UploadArgs): UploadHandle {
  let inFlight: CancellableUpload | null = null;
  let cancelled = false;
  let settled = false;

  function fail(message: string, retryable: boolean, error: Error): never {
    settled = true;
    onPhase({ phase: "failed", message, retryable });
    throw error;
  }

  /**
   * Progress across the whole set, not the current transfer.
   *
   * Two purposes means the same bytes go up twice, and a bar that reached 100%
   * and restarted would read as the upload having failed. One bar over the
   * total is the truth the rider needs: how much longer to stand there.
   */
  function reportSending(doneUploads: number, loaded: number, total: number | null) {
    const per = total ?? evidence.sizeBytes;
    onPhase({
      phase: "sending",
      sentBytes: per == null ? loaded : doneUploads * per + loaded,
      totalBytes: per == null ? null : per * targets.length,
    });
  }

  function rejectUpload(
    error: Error & { code?: string; status?: number },
  ): never {
    if (cancelled) {
      settled = true;
      onPhase({ phase: "idle" });
      throw error;
    }
    if (error.code === "minio_unavailable" || error.code === "storage_initializing") {
      settled = true;
      onPhase({ phase: "failed", message: error.message, retryable: true });
      throw new StorageUnavailableError(error.message);
    }
    fail(error.message, isRetryable(error.code, error.status ?? 0), error);
  }

  const result = (async (): Promise<StoredEvidence> => {
    if (evidence.sizeBytes != null && evidence.sizeBytes > MAX_EVIDENCE_BYTES) {
      fail(
        "That photo is larger than the 20 MB the server accepts. Retake it with the in-app camera.",
        false,
        new Error("file_too_large"),
      );
    }

    if (!evidence.uri.startsWith("file:")) {
      fail(UNREADABLE_CAPTURE_MESSAGE, true, new Error("unreadable_capture"));
    }

    const token = await resolveBearer();
    const base = getApiBase();
    const stored: StoredEvidence = {};

    reportSending(0, 0, evidence.sizeBytes);

    for (const [index, target] of targets.entries()) {
      if (cancelled) {
        settled = true;
        onPhase({ phase: "idle" });
        throw new Error("cancelled");
      }

      reportSending(index, 0, evidence.sizeBytes);

      const task = createUploadTask(
        `${base}/files`,
        evidence.uri,
        {
          httpMethod: "POST",
          uploadType: FileSystemUploadType.MULTIPART,
          fieldName: "file",
          mimeType: evidence.mimeType || "application/octet-stream",
          parameters: { purpose: target.purpose },
          headers: {
            Accept: "application/json",
            ...(token ? { Authorization: `Bearer ${token}`, "X-GRIDGO-Role": "rider" } : {}),
          },
        },
        (progress) => {
          reportSending(
            index,
            progress.totalBytesSent,
            progress.totalBytesExpectedToSend > 0 ? progress.totalBytesExpectedToSend : null,
          );
        },
      );
      inFlight = task;

      let uploadResult: { status: number; body: string } | null | undefined;
      try {
        uploadResult = await task.uploadAsync();
      } catch (error) {
        rejectUpload(
          error instanceof Error
            ? Object.assign(error, {
                message:
                  "No connection while sending. Move to a spot with signal and send again.",
              })
            : new Error(
                "No connection while sending. Move to a spot with signal and send again.",
              ),
        );
      } finally {
        inFlight = null;
      }

      if (cancelled || uploadResult == null) {
        settled = true;
        onPhase({ phase: "idle" });
        throw new Error("cancelled");
      }

      const failure = parseFailure(uploadResult.body);
      if (uploadResult.status !== 201) {
        const error = new Error(storageErrorMessage(failure.error, uploadResult.status));
        Object.assign(error, { code: failure.error, status: uploadResult.status });
        rejectUpload(error);
      }

      const uploaded = (failure as { file?: StoredFile }).file;
      if (!uploaded?.fileId) {
        fail(
          "The server accepted the file but did not identify it. Send it again.",
          true,
          new Error("file_metadata_invalid"),
        );
      }

      // Uploaded, but nothing points at it yet.
      onPhase({ phase: "processing" });

      const attachResponse = await fetch(`${base}/files/${uploaded.fileId}/attach`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}`, "X-GRIDGO-Role": "rider" } : {}),
        },
        body: JSON.stringify(
          target.milestoneCode
            ? { orderId, milestoneCode: target.milestoneCode }
            : { orderId },
        ),
      }).catch(() => null);

      if (!attachResponse) {
        fail(
          "The photo reached the server but could not be linked to this job. Send it again.",
          true,
          new Error("attach_network"),
        );
      }

      const attachText = await attachResponse.text();
      if (!attachResponse.ok) {
        const attachFailure = parseFailure(attachText);
        if (
          target.purpose === "fulfilment_proof" &&
          stored.delivery_photo &&
          isOptionalFulfilmentProofFailure(attachFailure.error)
        ) {
          continue;
        }
        fail(
          storageErrorMessage(attachFailure.error, attachResponse.status),
          isRetryable(attachFailure.error, attachResponse.status),
          new Error(attachFailure.error ?? "attach_failed"),
        );
      }

      stored[target.purpose] = uploaded.fileId;
    }

    settled = true;
    inFlight = null;
    // The first target is the id the step is filed against: the delivery photo
    // for a delivery or a pickup escalation, the signature for a handoff.
    onPhase({ phase: "stored", fileId: stored[targets[0]!.purpose] ?? "" });
    return stored;
  })();

  return {
    result,
    cancel: () => {
      if (settled) return;
      cancelled = true;
      void inFlight?.cancelAsync();
    },
  };
}
