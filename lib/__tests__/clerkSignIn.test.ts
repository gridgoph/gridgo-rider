import {
  clerkNeedsNewPasswordMessage,
  clerkPasswordIncompleteMessage,
  continuationAfterPassword,
  loginVerifyCopy,
  pickSupportedSecondFactor,
} from "@/lib/clerkSignIn";

describe("continuationAfterPassword", () => {
  it("finishes when Clerk reports complete", () => {
    expect(continuationAfterPassword("complete")).toEqual({ kind: "complete" });
  });

  it("prefers a leftover Clerk session over a status", () => {
    expect(continuationAfterPassword("complete", { sessionId: "sess_leftover" })).toEqual({
      kind: "existing_session",
      sessionId: "sess_leftover",
    });
  });

  it("collects a code for new-device trust and second factor", () => {
    expect(continuationAfterPassword("needs_client_trust")).toEqual({
      kind: "verification",
      factor: "email_code",
    });
    expect(
      continuationAfterPassword("needs_second_factor", null, [{ strategy: "phone_code" }]),
    ).toEqual({
      kind: "verification",
      factor: "phone_code",
    });
  });

  it("does not treat an incomplete first factor as a wrong password", () => {
    expect(continuationAfterPassword("needs_first_factor")).toEqual({
      kind: "blocked",
      message: clerkPasswordIncompleteMessage,
    });
    expect(continuationAfterPassword("needs_new_password")).toEqual({
      kind: "blocked",
      message: clerkNeedsNewPasswordMessage,
    });
  });
});

describe("pickSupportedSecondFactor", () => {
  it("prefers email, then phone, then the first listed factor", () => {
    expect(pickSupportedSecondFactor([])).toBe("email_code");
    expect(pickSupportedSecondFactor([{ strategy: "totp" }, { strategy: "email_code" }])).toBe(
      "email_code",
    );
    expect(pickSupportedSecondFactor([{ strategy: "backup_code" }])).toBe("backup_code");
  });
});

describe("loginVerifyCopy", () => {
  it("names the emailed address for device trust", () => {
    expect(loginVerifyCopy("email_code", "mddprado00290@usep.edu.ph")).toMatchObject({
      heading: "Confirm it’s you.",
      resend: true,
    });
    expect(loginVerifyCopy("email_code", "mddprado00290@usep.edu.ph").body).toContain(
      "mddprado00290@usep.edu.ph",
    );
    expect(loginVerifyCopy("totp", "").resend).toBe(false);
  });
});
