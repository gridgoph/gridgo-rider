import {
  EMPTY_SIGNUP,
  MIN_PASSWORD_LENGTH,
  canSubmitSignup,
  checkSignupField,
  enrollmentIdempotencyKey,
  firstSignupProblem,
  toEnrollRequest,
  type SignupFields,
} from "@/lib/signup";

function filled(patch: Partial<SignupFields> = {}): SignupFields {
  return {
    ...EMPTY_SIGNUP,
    name: "Carlo Rider",
    email: "carlo@example.com",
    phone: "09171234567",
    password: "at-least-8",
    confirmation: "at-least-8",
    vehicleType: "motorcycle",
    vehiclePlate: "ABC 1234",
    licenseNumber: "N01-23-456789",
    ...patch,
  };
}

describe("a rider application is complete before it is sent", () => {
  it("accepts a filled form", () => {
    expect(canSubmitSignup(filled())).toBe(true);
    expect(firstSignupProblem(filled())).toBeNull();
  });

  it("asks for the name, email, phone, password, vehicle, plate and licence", () => {
    expect(firstSignupProblem(filled({ name: "  " }))).toMatch(/name/i);
    expect(firstSignupProblem(filled({ email: "not-an-email" }))).toMatch(/email/i);
    expect(firstSignupProblem(filled({ phone: "" }))).toMatch(/number/i);
    expect(firstSignupProblem(filled({ password: "short" }))).toMatch(
      new RegExp(String(MIN_PASSWORD_LENGTH)),
    );
    expect(firstSignupProblem(filled({ confirmation: "different" }))).toMatch(/match/i);
    expect(firstSignupProblem(filled({ vehicleType: null }))).toMatch(/vehicle/i);
    expect(firstSignupProblem(filled({ vehiclePlate: " " }))).toMatch(/plate/i);
    expect(firstSignupProblem(filled({ licenseNumber: "" }))).toMatch(/licence/i);
  });

  it("does not invent a vehicle type", () => {
    expect(checkSignupField("vehicleType", filled({ vehicleType: null })).ok).toBe(false);
  });
});

describe("applying when Clerk already holds the identity", () => {
  /*
    A rider whose account exists but never applied is sent to this form signed
    in. Their name, email and password live in Clerk and are not part of the
    request, so demanding them again would block an application on credentials
    that go nowhere.
  */
  const options = { identityExists: true };

  it("asks only for what the application actually sends", () => {
    const profileOnly = {
      ...EMPTY_SIGNUP,
      phone: "09171234567",
      vehicleType: "motorcycle" as const,
      vehiclePlate: "ABC 1234",
      licenseNumber: "N01-23-456789",
    };

    expect(canSubmitSignup(profileOnly, options)).toBe(true);
    // The same blank form is incomplete when the identity still has to be made.
    expect(canSubmitSignup(profileOnly)).toBe(false);
  });

  it("still holds out for the vehicle, plate, licence and phone", () => {
    expect(firstSignupProblem(filled({ phone: "" }), options)).toMatch(/number/i);
    expect(firstSignupProblem(filled({ vehicleType: null }), options)).toMatch(/vehicle/i);
    expect(firstSignupProblem(filled({ vehiclePlate: " " }), options)).toMatch(/plate/i);
    expect(firstSignupProblem(filled({ licenseNumber: "" }), options)).toMatch(/licence/i);
  });

  it("ignores an unusable password rather than reporting it", () => {
    expect(firstSignupProblem(filled({ password: "", confirmation: "" }), options)).toBeNull();
  });
});

describe("toEnrollRequest matches POST /auth/clerk/enroll/rider", () => {
  it("sends only the profile the API accepts, trimmed", () => {
    expect(
      toEnrollRequest(
        filled({
          phone: " 0917 123 4567 ",
          vehiclePlate: " abc 1234 ",
          licenseNumber: " n01-23-456789 ",
        }),
      ),
    ).toEqual({
      profile: {
        phone: "0917 123 4567",
        vehicleType: "motorcycle",
        plateNumber: "abc 1234",
        licenseNumber: "n01-23-456789",
      },
    });
  });

  it("never sends the identity fields Clerk owns", () => {
    // The API rejects unexpected keys outright, so a stray email, password,
    // name or role here fails the whole application with a 400.
    const body = toEnrollRequest(filled());
    expect(Object.keys(body)).toEqual(["profile"]);
    expect(Object.keys(body.profile).sort()).toEqual([
      "licenseNumber",
      "phone",
      "plateNumber",
      "vehicleType",
    ]);
  });

  it("omits an empty licence rather than sending a blank string", () => {
    const body = toEnrollRequest(filled({ licenseNumber: "   " }));
    expect("licenseNumber" in body.profile).toBe(false);
  });

  it("refuses to build a body without a vehicle", () => {
    expect(() => toEnrollRequest(filled({ vehicleType: null }))).toThrow(/vehicle/i);
  });
});

describe("one application keeps one idempotency key", () => {
  it("reuses a key the API would accept", () => {
    expect(enrollmentIdempotencyKey("rider-enroll-123_abc")).toBe("rider-enroll-123_abc");
  });

  it("replaces a key the API would reject", () => {
    expect(enrollmentIdempotencyKey("has spaces")).toMatch(/^rider-enroll-/);
    expect(enrollmentIdempotencyKey("")).toMatch(/^rider-enroll-/);
    expect(enrollmentIdempotencyKey()).toMatch(/^rider-enroll-/);
  });
});
