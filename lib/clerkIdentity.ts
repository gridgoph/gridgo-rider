import { clerkErrorCode, clerkErrorMessage, splitPersonName } from "@/lib/clerkAuth";
import { checkSignupField, EMPTY_SIGNUP, MIN_PASSWORD_LENGTH } from "@/lib/signup";
import { canPickOnWeb, pickFileOnWeb } from "@/lib/webFilePick";

/**
 * The half of a rider's identity Clerk owns: the portrait, the sign-in name,
 * and the sign-in password.
 *
 * GRIDGO owns the phone, vehicle, plate and licence — those go through
 * `/me/rider-profile`. These do not. The portrait is never uploaded through
 * GRIDGO's own file store in this slice. The password is Clerk's user resource
 * (`user.updatePassword`), not the signed-out recover-password flow.
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
  if (canPickOnWeb()) {
    let webPicked: Awaited<ReturnType<typeof pickFileOnWeb>>;
    try {
      webPicked = await pickFileOnWeb("image/*");
    } catch {
      return { status: "failed", message: PORTRAIT_LIBRARY_REFUSED };
    }
    if (!webPicked) return { status: "cancelled" };
    try {
      await user.setProfileImage({ file: webPicked.file });
      await user.reload?.();
      return { status: "ok" };
    } catch (error) {
      return { status: "failed", message: clerkErrorMessage(error, PORTRAIT_FAILED) };
    }
  }

  let picked: {
    canceled: boolean;
    assets: {
      uri: string;
      fileName?: string | null;
      mimeType?: string | null;
    }[] | null;
  };
  try {
    // Lazy: this file is also loaded by Change password, which must not die
    // because a binary was built without the photo-library native module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ImagePicker = require("expo-image-picker") as typeof import("expo-image-picker");
    picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
  } catch {
    return { status: "failed", message: PORTRAIT_LIBRARY_REFUSED };
  }

  const asset = picked.canceled ? null : picked.assets?.[0];
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

/* --------------------------------------------------------------------------
   The sign-in password
   -------------------------------------------------------------------------- */

/**
 * Verified against Clerk's User resource: `updatePassword` takes `newPassword`,
 * an optional `currentPassword`, and an optional `signOutOfOtherSessions`.
 * This is the signed-in change, not the recover-password email code.
 */
export type ClerkPasswordUser = {
  updatePassword: (params: {
    newPassword: string;
    currentPassword?: string;
    signOutOfOtherSessions?: boolean;
  }) => Promise<unknown>;
  /** False for an account that only ever signed in with Google. */
  passwordEnabled?: boolean;
};

export type PasswordField = "current" | "next" | "confirm";

export type PasswordDraft = {
  current: string;
  next: string;
  confirm: string;
};

export const EMPTY_PASSWORD_DRAFT: PasswordDraft = { current: "", next: "", confirm: "" };

export const PASSWORD_WRONG_CURRENT =
  "That is not your current password. Type the one you sign in with now, or sign out and use “Recover password”.";

export const PASSWORD_NO_PASSWORD_SET =
  "This account signs in with Google, so it has no password to change. Signing in with Google is all it needs.";

const PASSWORD_FAILED =
  "GRIDGO could not change your password. Check this phone's connection and try again.";

export const PASSWORD_CHANGED =
  "Your password is changed. Anywhere else you were signed in has been signed out.";

/** What still stops the change, per field. Nothing here costs a round trip. */
export function passwordProblems(draft: PasswordDraft): Partial<Record<PasswordField, string>> {
  const problems: Partial<Record<PasswordField, string>> = {};

  if (!draft.current) {
    problems.current = "Enter the password you sign in with now.";
  }

  // Sign-up's own bar and sign-up's own sentence, so the rule a rider met
  // when they opened the account is the rule they meet again here.
  const next = checkSignupField("password", { ...EMPTY_SIGNUP, password: draft.next });
  if (!next.ok && next.reason) {
    problems.next = next.reason;
  } else if (draft.next && draft.next === draft.current) {
    problems.next = "This is the password you already have. Choose a different one.";
  }

  if (draft.confirm !== draft.next) {
    problems.confirm = "These do not match. Type the new password again.";
  }
  return problems;
}

export function passwordReady(draft: PasswordDraft): boolean {
  return Object.keys(passwordProblems(draft)).length === 0;
}

export type PasswordOutcome =
  | { status: "ok" }
  /** Clerk would not take the current password. Points at that field. */
  | { status: "wrong_current" }
  /** Clerk refused the new password (length, strength, pwned). Points at it. */
  | { status: "invalid_new"; message: string }
  | { status: "failed"; message: string };

/**
 * Change the password on the sign-in.
 *
 * `signOutOfOtherSessions` is on and is not offered as a choice. Somebody
 * changing a password on a phone is either tidying up or locking somebody out,
 * and the second reason is the one that matters.
 */
export async function changeSignInPassword(
  user: ClerkPasswordUser,
  draft: PasswordDraft,
): Promise<PasswordOutcome> {
  try {
    await user.updatePassword({
      currentPassword: draft.current,
      newPassword: draft.next,
      signOutOfOtherSessions: true,
    });
    return { status: "ok" };
  } catch (error) {
    if (isWrongPassword(error)) return { status: "wrong_current" };
    if (isNewPasswordRefusal(error)) {
      return { status: "invalid_new", message: clerkErrorMessage(error, PASSWORD_FAILED) };
    }
    return { status: "failed", message: clerkErrorMessage(error, PASSWORD_FAILED) };
  }
}

/**
 * Clerk refusing the current password, rather than the new one.
 *
 * Worth telling apart because the two land on different fields: a rider
 * pointed at the new password when the old one was the typo retypes the wrong
 * thing until they give up.
 */
function isWrongPassword(error: unknown): boolean {
  const code = clerkErrorCode(error);
  if (code === "form_password_incorrect" || code === "form_password_validation_failed") {
    return true;
  }
  return /current password|incorrect password|password is incorrect/i.test(
    clerkErrorMessage(error, ""),
  );
}

/**
 * Clerk refusing the *new* password: too short, too weak, or found in a breach.
 *
 * These belong under the new-password field so the rider sees the rule they
 * still have to meet, not a generic "not changed" card.
 */
function isNewPasswordRefusal(error: unknown): boolean {
  const code = clerkErrorCode(error);
  if (
    code === "form_password_pwned" ||
    code === "form_password_length_too_short" ||
    code === "form_password_length_too_long" ||
    code === "form_password_not_strong_enough" ||
    code === "form_password_size_in_bytes_exceeded"
  ) {
    return true;
  }
  return /been found in a breach|data breach|not strong enough|too short|too long|compromised password/i.test(
    clerkErrorMessage(error, ""),
  );
}

/** Restated where the screen needs it, so the rule is written in one place. */
export { MIN_PASSWORD_LENGTH };
