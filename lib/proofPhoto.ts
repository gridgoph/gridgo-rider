import { File, Paths } from "expo-file-system";
import { copyAsync } from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";

import {
  evidenceFileName,
  UNREADABLE_CAPTURE_MESSAGE,
  type ProofEvidence,
} from "@/lib/proofEvidence";

export type CaptureStep = "pickup" | "delivery" | "failed-attempt";

/**
 * Why a capture produced nothing. The rider needs a different next step for
 * each, so "it didn't work" is not an acceptable answer.
 */
export type CaptureOutcome =
  | { ok: true; evidence: ProofEvidence }
  | { ok: false; reason: "cancelled" }
  | { ok: false; reason: "permission_denied" }
  | { ok: false; reason: "camera_unavailable" }
  | { ok: false; reason: "unreadable" };

/** Size on disk, or null when the platform will not say. */
function fileSize(uri: string): number | null {
  try {
    const size = new File(uri).size;
    return typeof size === "number" && Number.isFinite(size) ? size : null;
  } catch {
    return null;
  }
}

function cacheFileReady(file: File): boolean {
  try {
    return file.uri.startsWith("file:") && file.exists && file.size > 0;
  } catch {
    return false;
  }
}

/**
 * Copy a capture into app cache as a real `file://` the upload stack can open.
 *
 * Camera URIs on Android 14+ are often `content://` grants. The File class
 * reports those as missing and cannot copy them, and `fetch` cannot read them
 * either. Returning the original URI made the send fail on the phone while the
 * rider was told the connection dropped. `copyAsync` opens the grant through
 * the system content resolver.
 */
export async function persistCaptureUri(uri: string, fileName: string): Promise<string> {
  const dest = new File(Paths.cache, fileName);
  const destUri = dest.uri;
  if (!destUri.startsWith("file:")) {
    throw new Error("unreadable_capture");
  }
  if (uri === destUri && cacheFileReady(dest)) return destUri;

  try {
    const source = new File(uri);
    if (source.exists) {
      if (dest.exists) dest.delete();
      source.copy(dest);
      if (cacheFileReady(dest)) return dest.uri;
    }
  } catch {
    // content:// throws on File.copy — the resolver copy is next.
  }

  try {
    if (dest.exists) dest.delete();
    await copyAsync({ from: uri, to: destUri });
    if (cacheFileReady(dest)) return dest.uri;
  } catch {
    // Fall through to reading the bytes.
  }

  try {
    const bytes = await new File(uri).bytes();
    if (bytes.byteLength > 0) {
      if (dest.exists) dest.delete();
      dest.create();
      dest.write(bytes);
      if (cacheFileReady(dest)) return dest.uri;
    }
  } catch {
    // Last chance: fetch, which only helps for some file:// URIs.
  }

  try {
    const response = await fetch(uri);
    if (response.ok) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength) {
        if (dest.exists) dest.delete();
        dest.create();
        dest.write(bytes);
        if (cacheFileReady(dest)) return dest.uri;
      }
    }
  } catch {
    // Give up rather than handing the original grant to the uploader.
  }

  throw new Error("unreadable_capture");
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
  let uri: string;
  try {
    uri = await persistCaptureUri(asset.uri, fileName);
  } catch {
    return { ok: false, reason: "unreadable" };
  }

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
    case "unreadable":
      return UNREADABLE_CAPTURE_MESSAGE;
  }
}

/** Wrap a rendered signature file as evidence. */
export async function signatureEvidence(
  uri: string,
  capturedAtMs: number,
  step: CaptureStep = "delivery",
): Promise<ProofEvidence> {
  const fileName = evidenceFileName(step, "signature", capturedAtMs, "png");
  const persisted = await persistCaptureUri(uri, fileName);
  return {
    kind: "signature",
    uri: persisted,
    fileName,
    mimeType: "image/png",
    capturedAt: new Date(capturedAtMs).toISOString(),
    sizeBytes: fileSize(persisted),
  };
}

/** The supplier's signature from the pad at the shop counter, as evidence. */
export function handoffSignatureEvidence(uri: string): Promise<ProofEvidence> {
  return signatureEvidence(uri, Date.now(), "pickup");
}
