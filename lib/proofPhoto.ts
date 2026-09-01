import { File, Paths } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";

import { evidenceFileName, type ProofEvidence } from "@/lib/proofEvidence";

export type CaptureStep = "pickup" | "delivery" | "failed-attempt";

/**
 * Why a capture produced nothing. The rider needs a different next step for
 * each, so "it didn't work" is not an acceptable answer.
 */
export type CaptureOutcome =
  | { ok: true; evidence: ProofEvidence }
  | { ok: false; reason: "cancelled" }
  | { ok: false; reason: "permission_denied" }
  | { ok: false; reason: "camera_unavailable" };

/** Size on disk, or null when the platform will not say. */
function fileSize(uri: string): number | null {
  try {
    const size = new File(uri).size;
    return typeof size === "number" && Number.isFinite(size) ? size : null;
  } catch {
    return null;
  }
}

/**
 * Copy a capture into app cache as a real `file://` the upload stack can open.
 *
 * Camera URIs on Android 14+ are often `content://` grants the network stack
 * cannot read. XMLHttpRequest then fires `onerror` and the rider sees "No
 * connection" even though the API is reachable — JSON fetches still work.
 */
export function persistCaptureUri(uri: string, fileName: string): string {
  try {
    const source = new File(uri);
    if (!source.exists) return uri;
    const dest = new File(Paths.cache, fileName);
    if (dest.exists) dest.delete();
    source.copy(dest);
    return dest.uri || uri;
  } catch {
    return uri;
  }
}

/**
 * Capture a proof photo with the device camera.
 *
 * The MIME type is taken from the picker and passed through untouched: iOS
 * reports these unreliably and the server is the one that decides what it
 * accepts, so guessing here only rejects files that would have been fine.
 */
export async function captureProofPhoto(step: CaptureStep): Promise<CaptureOutcome> {
  let permission: ImagePicker.PermissionResponse;
  try {
    permission = await ImagePicker.requestCameraPermissionsAsync();
  } catch {
    return { ok: false, reason: "camera_unavailable" };
  }
  if (!permission.granted) {
    return { ok: false, reason: "permission_denied" };
  }

  let result: ImagePicker.ImagePickerResult;
  try {
    result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.6,
      allowsEditing: false,
      exif: false,
    });
  } catch {
    return { ok: false, reason: "camera_unavailable" };
  }

  if (result.canceled || !result.assets?.length) {
    return { ok: false, reason: "cancelled" };
  }

  const asset = result.assets[0]!;
  const extension =
    asset.fileName?.split(".").pop()?.toLowerCase() ||
    (asset.mimeType?.includes("png") ? "png" : "jpg");
  const capturedAtMs = Date.now();
  const fileName = evidenceFileName(step, "photo", capturedAtMs, extension);
  const uri = persistCaptureUri(asset.uri, fileName);

  return {
    ok: true,
    evidence: {
      kind: "photo",
      uri,
      fileName,
      mimeType: asset.mimeType || (extension === "png" ? "image/png" : "image/jpeg"),
      capturedAt: new Date(capturedAtMs).toISOString(),
      sizeBytes: asset.fileSize ?? fileSize(uri),
    },
  };
}

/** Copy for each way a capture can fail, with the recovery in the sentence. */
export function captureFailureMessage(
  reason: Exclude<CaptureOutcome, { ok: true }>["reason"],
): string {
  switch (reason) {
    case "cancelled":
      return "No photo taken. Open the camera again, or capture a signature instead.";
    case "permission_denied":
      return "GRIDGO cannot open the camera. Allow camera access in your phone settings, or capture a signature instead.";
    case "camera_unavailable":
      return "The camera would not start on this phone. Capture a signature instead.";
  }
}

/** Wrap a rendered signature file as evidence. */
export function signatureEvidence(uri: string, capturedAtMs: number): ProofEvidence {
  const fileName = evidenceFileName("delivery", "signature", capturedAtMs, "png");
  const persisted = persistCaptureUri(uri, fileName);
  return {
    kind: "signature",
    uri: persisted,
    fileName,
    mimeType: "image/png",
    capturedAt: new Date(capturedAtMs).toISOString(),
    sizeBytes: fileSize(persisted),
  };
}
