import { getApiBase, getToken } from "@/lib/api";
import type { EvidenceUpload, ProofEvidence } from "@/lib/proofEvidence";

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
 * The file part is `{ uri, name, type }`. React Native streams that off disk;
 * reading a 12 MP photo into JavaScript first is how a mid-range Android phone
 * runs out of memory at someone's front door.
 */

/**
 * The two purposes a rider may upload under.
 *
 * A delivery needs both, from the same moment at the door: the delivery photo
 * is the rider's evidence that the handover happened, and the delivered Proof
 * of Fulfilment is what releases the supplier's third milestone. The server
 * binds a file to exactly one purpose and will not rebind it, so one capture is
 * sent twice rather than asking a rider to photograph the same doorstep twice.
 */
export type EvidencePurpose = "delivery_photo" | "fulfilment_proof";

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
    case "forbidden":
      return "This job is not assigned to you any more. Refresh your trip.";
    case "unauthorized":
      return "Your session has expired. Sign in again, then send the evidence.";
    case "order_not_found":
      return "That job no longer exists. Refresh your trip and speak to Operations.";
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
      return false;
    default:
      return true;
  }
}

function parseFailure(text: string): ApiFailure {
  try {
    return JSON.parse(text) as ApiFailure;
  } catch {
    return {};
  }
}

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
  let inFlight: XMLHttpRequest | null = null;
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

  const result = (async (): Promise<StoredEvidence> => {
    if (evidence.sizeBytes != null && evidence.sizeBytes > MAX_EVIDENCE_BYTES) {
      fail(
        "That photo is larger than the 20 MB the server accepts. Retake it with the in-app camera.",
        false,
        new Error("file_too_large"),
      );
    }

    const token = getToken();
    const base = getApiBase();
    const stored: StoredEvidence = {};

    reportSending(0, 0, evidence.sizeBytes);

    for (const [index, target] of targets.entries()) {
      const xhr = new XMLHttpRequest();
      inFlight = xhr;

      const uploaded = await new Promise<StoredFile>((resolve, reject) => {
        const form = new FormData();
        // Exactly these two parts. Any extra text field is rejected by contract.
        form.append("purpose", target.purpose);
        form.append("file", {
          uri: evidence.uri,
          name: evidence.fileName,
          // iOS reports this unreliably; the server decides from magic bytes.
          type: evidence.mimeType || "application/octet-stream",
        } as unknown as Blob);

        xhr.open("POST", `${base}/files`);
        xhr.setRequestHeader("Accept", "application/json");
        if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        // Content-Type is left alone on purpose: React Native supplies the
        // multipart boundary, and overwriting it breaks the framing.
        xhr.timeout = 15 * 60 * 1000;

        xhr.upload.onprogress = (event) => {
          reportSending(index, event.loaded, event.lengthComputable ? event.total : null);
        };

        // Bytes have left the phone; the server is still validating and writing.
        xhr.upload.onload = () => onPhase({ phase: "processing" });

        xhr.onerror = () =>
          reject(
            new Error(
              "No connection while sending. Move to a spot with signal and send again.",
            ),
          );
        xhr.ontimeout = () =>
          reject(new Error("Sending timed out. Find better signal and send again."));
        xhr.onabort = () => reject(new Error("cancelled"));

        xhr.onload = () => {
          if (xhr.status === 201) {
            const body = parseFailure(xhr.responseText) as { file?: StoredFile };
            if (body.file?.fileId) {
              resolve(body.file);
              return;
            }
            reject(
              new Error("The server accepted the file but did not identify it. Send it again."),
            );
            return;
          }
          const failure = parseFailure(xhr.responseText);
          const error = new Error(storageErrorMessage(failure.error, xhr.status));
          Object.assign(error, { code: failure.error, status: xhr.status });
          reject(error);
        };

        xhr.send(form);
      }).catch((error: Error & { code?: string; status?: number }) => {
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
      });

      // Uploaded, but nothing points at it yet.
      onPhase({ phase: "processing" });

      const attachResponse = await fetch(`${base}/files/${uploaded.fileId}/attach`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
        const failure = parseFailure(attachText);
        fail(
          storageErrorMessage(failure.error, attachResponse.status),
          isRetryable(failure.error, attachResponse.status),
          new Error(failure.error ?? "attach_failed"),
        );
      }

      stored[target.purpose] = uploaded.fileId;
    }

    settled = true;
    inFlight = null;
    // The delivery photo is the id the delivery route is filed against; a
    // pickup failure escalation uses the same one.
    onPhase({ phase: "stored", fileId: stored.delivery_photo ?? "" });
    return stored;
  })();

  return {
    result,
    cancel: () => {
      if (settled) return;
      cancelled = true;
      inFlight?.abort();
    },
  };
}
