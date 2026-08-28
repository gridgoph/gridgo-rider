/**
 * Creating a rider account.
 *
 * Public apply is the door, and it is two steps: Clerk creates the identity
 * from the email and password, then `POST /auth/clerk/enroll/rider` files the
 * rider profile against that Clerk session. The API starts the account
 * `pending` and this binary never writes a role itself. Offers stay closed
 * until Operations approves — see `lib/riderApproval.ts`.
 */

import type { RiderEnrollment } from "@/lib/api";

/** The API's floor. Said on the field, not after a rejected submission. */
export const MIN_PASSWORD_LENGTH = 8;

export const VEHICLE_TYPES = [
  {
    id: "motorcycle",
    label: "Motorcycle",
    helper: "Most GRIDGO jobs around Davao",
  },
  {
    id: "bicycle",
    label: "Bicycle",
    helper: "Short hops inside the city",
  },
  {
    id: "car",
    label: "Car",
    helper: "When the package will not fit a bag",
  },
] as const;

export type VehicleType = (typeof VEHICLE_TYPES)[number]["id"];

export type SignupFields = {
  name: string;
  email: string;
  phone: string;
  password: string;
  confirmation: string;
  vehicleType: VehicleType | null;
  vehiclePlate: string;
  licenseNumber: string;
};

export const EMPTY_SIGNUP: SignupFields = {
  name: "",
  email: "",
  phone: "",
  password: "",
  confirmation: "",
  vehicleType: null,
  vehiclePlate: "",
  licenseNumber: "",
};

export type SignupCheck = { ok: boolean; reason: string | null };

/** One field at a time, so a form can show the reason under the field itself. */
export function checkSignupField(
  field: keyof SignupFields,
  fields: SignupFields,
): SignupCheck {
  const ok: SignupCheck = { ok: true, reason: null };

  switch (field) {
    case "name":
      return fields.name.trim()
        ? ok
        : { ok: false, reason: "Enter the name this account belongs to." };
    case "email": {
      const value = fields.email.trim();
      if (!value) return { ok: false, reason: "Enter the email you will sign in with." };
      // The API's own bar: a complete address. Nothing stricter, so a valid
      // address is never rejected here and accepted there.
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return { ok: false, reason: "Enter a complete email address, like ana@example.com." };
      }
      return ok;
    }
    case "phone":
      return fields.phone.trim()
        ? ok
        : {
            ok: false,
            reason: "Enter a number Operations can reach you on.",
          };
    case "password":
      return fields.password.length >= MIN_PASSWORD_LENGTH
        ? ok
        : {
            ok: false,
            reason: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
          };
    case "confirmation":
      if (!fields.confirmation) {
        return { ok: false, reason: "Repeat the password so it is not mistyped." };
      }
      return fields.confirmation === fields.password
        ? ok
        : { ok: false, reason: "The passwords do not match." };
    case "vehicleType":
      return fields.vehicleType
        ? ok
        : { ok: false, reason: "Choose the vehicle you will ride." };
    case "vehiclePlate":
      return fields.vehiclePlate.trim()
        ? ok
        : { ok: false, reason: "Enter the plate number on that vehicle." };
    case "licenseNumber":
      return fields.licenseNumber.trim()
        ? ok
        : { ok: false, reason: "Enter your driving licence number." };
    default:
      return ok;
  }
}

const ORDERED_FIELDS: (keyof SignupFields)[] = [
  "name",
  "email",
  "phone",
  "password",
  "confirmation",
  "vehicleType",
  "vehiclePlate",
  "licenseNumber",
];

/**
 * Fields that belong to the identity rather than the application.
 *
 * Once Clerk holds the identity, the API reads the name and email from it and
 * the password is already set — so asking for them again would be asking a
 * signed-in rider to re-enter credentials that are not even sent.
 */
const IDENTITY_FIELDS = new Set<keyof SignupFields>([
  "name",
  "email",
  "password",
  "confirmation",
]);

type SignupCheckOptions = {
  /** Clerk already holds this rider's identity; only the application is missing. */
  identityExists?: boolean;
};

/** The first thing still missing, so the button can say why it will not go. */
export function firstSignupProblem(
  fields: SignupFields,
  options: SignupCheckOptions = {},
): string | null {
  for (const field of ORDERED_FIELDS) {
    if (options.identityExists && IDENTITY_FIELDS.has(field)) continue;
    const result = checkSignupField(field, fields);
    if (!result.ok) return result.reason;
  }
  return null;
}

export function canSubmitSignup(
  fields: SignupFields,
  options: SignupCheckOptions = {},
): boolean {
  return firstSignupProblem(fields, options) === null;
}

/**
 * Form values → exactly the body `POST /auth/clerk/enroll/rider` wants.
 *
 * The body is exact: the API rejects unexpected keys, so email, password, name
 * and role must not appear. Clerk owns the identity and the API reads the name
 * and email from the authenticated Clerk user, not from this request.
 */
export function toEnrollRequest(fields: SignupFields): RiderEnrollment {
  if (!fields.vehicleType) {
    throw new Error("Choose the vehicle you will ride.");
  }
  const licenseNumber = fields.licenseNumber.trim();
  return {
    profile: {
      phone: fields.phone.trim(),
      vehicleType: fields.vehicleType,
      plateNumber: fields.vehiclePlate.trim(),
      ...(licenseNumber ? { licenseNumber } : {}),
    },
  };
}

/**
 * One enrollment attempt keeps one key, so a retry after a lost reply is a
 * retry to the API rather than a second application.
 */
export function enrollmentIdempotencyKey(existing?: string): string {
  const key = existing?.trim() ?? "";
  if (key && key.length <= 200 && /^[A-Za-z0-9._:-]+$/.test(key)) return key;
  return `rider-enroll-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}
