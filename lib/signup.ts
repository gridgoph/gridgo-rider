/**
 * Creating a rider account.
 *
 * Public apply is the door. The API stores `role: "rider"` and starts the
 * account `pending`; this binary never writes a role itself. Offers stay
 * closed until Operations approves — see `lib/riderApproval.ts`.
 */

import type { RiderSignupInput } from "@/lib/api";

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

/** The first thing still missing, so the button can say why it will not go. */
export function firstSignupProblem(fields: SignupFields): string | null {
  for (const field of ORDERED_FIELDS) {
    const result = checkSignupField(field, fields);
    if (!result.ok) return result.reason;
  }
  return null;
}

export function canSubmitSignup(fields: SignupFields): boolean {
  return firstSignupProblem(fields) === null;
}

/** Form values → exactly the body `POST /auth/signup` wants for a rider. */
export function signupInput(fields: SignupFields): RiderSignupInput {
  if (!fields.vehicleType) {
    throw new Error("Choose the vehicle you will ride.");
  }
  return {
    email: fields.email.trim().toLowerCase(),
    password: fields.password,
    name: fields.name.trim(),
    phone: fields.phone.trim(),
    riderProfile: {
      vehicleType: fields.vehicleType,
      vehiclePlate: fields.vehiclePlate.trim(),
      licenseNumber: fields.licenseNumber.trim(),
    },
  };
}
