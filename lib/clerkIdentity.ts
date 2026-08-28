import * as ImagePicker from "expo-image-picker";

import { clerkErrorMessage, splitPersonName } from "@/lib/clerkAuth";

/**
 * The half of a rider's identity Clerk owns: the portrait and the sign-in name.
 *
 * GRIDGO owns the phone, vehicle, plate and licence — those go through
 * `/me/rider-profile`. These two do not. The portrait is never uploaded through
 * GRIDGO's own file store in this slice.
 */

export type ClerkPortraitUser = {
  setProfileImage: (params: { file: Blob | File | string | null }) => Promise<unknown>;
  reload?: () => Promise<unknown>;
};

export type ClerkNameUser = {
  update: (params: { firstName: string; lastName?: string }) => Promise<unknown>;
  reload?: () => Promise<unknown>;
};

export type PortraitOutcome =
  | { status: "ok" }
  /** The rider closed the picker. Nothing happened and nothing is said. */
  | { status: "cancelled" }
  | { status: "failed"; message: string };

export const PORTRAIT_LIBRARY_REFUSED =
  "GRIDGO needs access to your photos to set a profile picture. Turn it on for this app in your phone's settings.";

const PORTRAIT_FAILED =
  "That picture could not be saved to your GRIDGO sign-in. Check this phone's connection and try again.";

const NAME_FAILED =
  "Your name could not be saved to your GRIDGO sign-in. Check this phone's connection and try again.";

/**
 * What React Native can actually hand Clerk.
 *
 * Clerk sends a `file` that is a string as the raw request body under
 * `application/octet-stream`, so a `file://` path would be uploaded verbatim.
 * The descriptor is the shape React Native's `FormData` understands.
 */
export type PortraitFile = { uri: string; name: string; type: string };

export function portraitFile(asset: {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
}): PortraitFile {
  const type = asset.mimeType || "image/jpeg";
  const suffix = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  return { uri: asset.uri, name: asset.fileName || `rider-portrait.${suffix}`, type };
}

export async function changeRiderPortrait(
  user: ClerkPortraitUser,
): Promise<PortraitOutcome> {
  let picked: ImagePicker.ImagePickerResult;
  try {
    picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
  } catch {
    return { status: "failed", message: PORTRAIT_LIBRARY_REFUSED };
  }

  const asset = picked.canceled ? null : picked.assets[0];
  if (!asset) return { status: "cancelled" };

  try {
    await user.setProfileImage({
      file: portraitFile(asset) as unknown as Blob,
    });
    await user.reload?.();
    return { status: "ok" };
  } catch (error) {
    return { status: "failed", message: clerkErrorMessage(error, PORTRAIT_FAILED) };
  }
}

export type NameOutcome =
  | { status: "ok" }
  | { status: "failed"; message: string };

/** Write the typed name onto the GRIDGO sign-in. */
export async function changeRiderSignInName(
  user: ClerkNameUser,
  name: string,
): Promise<NameOutcome> {
  const person = splitPersonName(name);
  try {
    await user.update({
      firstName: person.firstName,
      lastName: person.lastName ?? "",
    });
    await user.reload?.();
    return { status: "ok" };
  } catch (error) {
    return { status: "failed", message: clerkErrorMessage(error, NAME_FAILED) };
  }
}
