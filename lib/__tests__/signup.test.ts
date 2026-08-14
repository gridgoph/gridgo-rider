import {
  EMPTY_SIGNUP,
  MIN_PASSWORD_LENGTH,
  canSubmitSignup,
  checkSignupField,
  firstSignupProblem,
  signupInput,
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

describe("signupInput matches POST /auth/signup", () => {
  it("trims and lowercases, and keeps the password as typed", () => {
    expect(
      signupInput(
        filled({
          name: "  Carlo Rider  ",
          email: "  Carlo@Example.com ",
          phone: " 0917 123 4567 ",
          vehiclePlate: " abc 1234 ",
          licenseNumber: " n01-23-456789 ",
        }),
      ),
    ).toEqual({
      email: "carlo@example.com",
      password: "at-least-8",
      name: "Carlo Rider",
      phone: "0917 123 4567",
      riderProfile: {
        vehicleType: "motorcycle",
        vehiclePlate: "abc 1234",
        licenseNumber: "n01-23-456789",
      },
    });
  });

  it("refuses to build a body without a vehicle", () => {
    expect(() => signupInput(filled({ vehicleType: null }))).toThrow(/vehicle/i);
  });
});
