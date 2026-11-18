import * as ImagePicker from "expo-image-picker";

import { uploadChatImage } from "@/lib/chatImages";

/**
 * Photos that prove a cash movement (gridgo-api `docs/CASH_ON_DELIVERY_API.md`
 * → *Transactions and evidence*).
 *
 * Unlike delivery proof these are never attached to the order: the cash route
 * binds the file itself, atomically with the money it proves, and refuses a
 * file that is already bound. So the upload is one step — `POST /files` with
 * the cash purpose — and the file id goes into the cash request. Bytes stream
 * from the picked file through the same XHR upload the chat photos use, never
 * read into JavaScript.
 */
export type CashPhotoPurpose = "cash_shop_receipt" | "cash_no_show_photo" | "cash_topup_proof";

export type CashPhotoAsset = { uri: string; name: string; mimeType: string; size: number | null };

export type CashPhotoPick =
  | { ok: true; asset: CashPhotoAsset }
  | { ok: false; reason: "cancelled" | "permission_denied" | "unavailable" | "unsupported" };

/** The contract's limit for every rider cash purpose. */
export const CASH_PHOTO_MAX_BYTES = 15 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function asAsset(result: ImagePicker.ImagePickerResult, prefix: string): CashPhotoPick {
  if (result.canceled || !result.assets?.length) return { ok: false, reason: "cancelled" };
  const asset = result.assets[0]!;
  const mimeType = asset.mimeType === "image/jpg" ? "image/jpeg" : asset.mimeType || "image/jpeg";
  if (!TYPES.has(mimeType)) return { ok: false, reason: "unsupported" };
  const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  return {
    ok: true,
    asset: {
      uri: asset.uri,
      name: asset.fileName || `${prefix}-${Date.now()}.${extension}`,
      mimeType,
      size: asset.fileSize ?? null,
    },
  };
}

/**
 * A receipt or a doorway is photographed now; a payment screenshot already
 * exists, so it is chosen from the phone's photos.
 */
export async function pickCashPhoto(source: "camera" | "library", prefix: string): Promise<CashPhotoPick> {
  try {
    if (source === "camera") {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) return { ok: false, reason: "permission_denied" };
      return asAsset(
        await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.6, allowsEditing: false, exif: false }),
        prefix,
      );
    }
    return asAsset(
      await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, allowsMultipleSelection: false }),
      prefix,
    );
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export function cashPickFailure(reason: Exclude<CashPhotoPick, { ok: true }>["reason"], source: "camera" | "library"): string | null {
  switch (reason) {
    case "cancelled":
      return null;
    case "permission_denied":
      return source === "camera"
        ? "GRIDGO cannot open the camera. Allow camera access in your phone settings, then try again."
        : "GRIDGO cannot open your photos. Allow photo access in your phone settings, then try again.";
    case "unsupported":
      return "GRIDGO takes a JPEG, PNG or WebP photo. Choose another one.";
    default:
      return source === "camera"
        ? "The camera would not start on this phone. Try again, or call Operations."
        : "Your photos would not open. Try again.";
  }
}

/** Stores the photo under its cash purpose and returns the server's file id. */
export async function uploadCashPhoto(asset: CashPhotoAsset, purpose: CashPhotoPurpose): Promise<string> {
  if (asset.size != null && asset.size > CASH_PHOTO_MAX_BYTES) {
    throw new Error("That photo is larger than the 15 MB GRIDGO accepts. Take it again.");
  }
  return uploadChatImage(asset, purpose);
}
