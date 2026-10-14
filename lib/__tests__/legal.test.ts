import { ApiError, type LegalVersion, type PrivacyRequest } from "@/lib/api";
import { LEGAL_OPEN_ROOTS, resolveAuthRedirect } from "@/lib/authGate";
import {
  changeNote,
  EMPTY_SIGNUP_CONSENT,
  enrollmentConsentBody,
  gateHeading,
  isLegalRefusal,
  isLegalUnsupported,
  isLegalVersionChanged,
  joinTitles,
  legalDate,
  legalStatusLook,
  libraryOrder,
  noticeBody,
  noticeHeading,
  openRequestOf,
  privacyRequestLine,
  privacyStatusLook,
  signupConsentProblem,
  signupDocuments,
  unseenNotices,
  versionLine,
} from "@/lib/legal";
import { legalAppLabel } from "@/lib/legalContext";

function doc(documentId: string, title: string, version = 1, extra: Partial<LegalVersion> = {}): LegalVersion {
  return {
    id: `${documentId}-${version}`,
    documentId,
    version,
    title,
    audience: documentId === "rider-agreement" ? "rider" : "all",
    text: `Placeholder — ${title}.`,
    effectiveAt: "2026-01-01T00:00:00.000Z",
    placeholder: version === 1,
    material: version > 1,
    changeSummary: version === 1 ? "Launch placeholder" : "Clearer cancellation rules",
    status: version === 1 ? "placeholder" : "live",
    ...extra,
  };
}

const library = [
  doc("cookie-notice", "Cookie Notice"),
  doc("privacy-notice", "Privacy Notice"),
  doc("acceptable-use", "Acceptable Use and Artwork Rights"),
  doc("terms-of-service", "Terms of Service"),
  doc("rider-agreement", "Rider Agreement"),
  doc("age-policy", "Age Policy"),
];

describe("the rider library", () => {
  it("puts the three agreements first, then the policies", () => {
    expect(libraryOrder(library).map((d) => d.documentId)).toEqual([
      "rider-agreement",
      "terms-of-service",
      "privacy-notice",
      "acceptable-use",
      "age-policy",
      "cookie-notice",
    ]);
  });

  it("names the Rider Agreement, Terms and Privacy for the apply form, by their current versions", () => {
    expect(signupDocuments(library)?.map((d) => d.id)).toEqual([
      "rider-agreement-1",
      "terms-of-service-1",
      "privacy-notice-1",
    ]);
    expect(signupDocuments(library.filter((d) => d.documentId !== "rider-agreement"))).toBeNull();
  });

  it("joins titles the way a sentence does", () => {
    expect(joinTitles(signupDocuments(library) ?? [])).toBe(
      "Rider Agreement, Terms of Service and Privacy Notice",
    );
    expect(joinTitles([{ title: "Rider Agreement" }])).toBe("Rider Agreement");
  });

  it("says placeholders in words, and dates in Davao time", () => {
    expect(legalStatusLook(doc("terms-of-service", "Terms"))).toEqual({
      tone: "warning",
      label: "Placeholder",
      icon: "square-pen",
    });
    expect(legalStatusLook(doc("terms-of-service", "Terms", 2)).label).toBe("In effect");
    expect(legalDate("2026-10-08T17:30:00.000Z")).toBe("9 Oct 2026");
    expect(legalDate("not a date")).toBeNull();
    expect(versionLine(doc("terms-of-service", "Terms", 2))).toBe(
      "Version 2, in effect from 1 Jan 2026",
    );
  });

  it("shows a change summary only for a later version", () => {
    expect(changeNote(doc("terms-of-service", "Terms"))).toBeNull();
    expect(changeNote(doc("terms-of-service", "Terms", 2))).toBe("Clearer cancellation rules");
  });
});

describe("agreeing on the apply form", () => {
  it("holds the application until every required answer is given", () => {
    expect(signupConsentProblem(EMPTY_SIGNUP_CONSENT, false)).toMatch(/not loaded/);
    expect(signupConsentProblem(EMPTY_SIGNUP_CONSENT)).toMatch(/18 or older/);
    expect(signupConsentProblem({ ...EMPTY_SIGNUP_CONSENT, adult: false })).toMatch(/guardian/);
    expect(signupConsentProblem({ ...EMPTY_SIGNUP_CONSENT, adult: true })).toMatch(/Tick the box/);
    expect(signupConsentProblem({ ...EMPTY_SIGNUP_CONSENT, adult: true, agreed: true })).toBeNull();
    expect(
      signupConsentProblem({ ...EMPTY_SIGNUP_CONSENT, adult: false, guardian: true, agreed: true }),
    ).toBeNull();
  });

  it("builds the exact v1 body, guardian only for a junior and marketing always said", () => {
    const context = { app: "gridgo-rider/1.0.0", device: "rider-abc" };
    expect(
      enrollmentConsentBody(["a", "b"], { ...EMPTY_SIGNUP_CONSENT, adult: true, agreed: true }, context),
    ).toEqual({
      accepted: true,
      versionIds: ["a", "b"],
      method: "checkbox",
      junior: false,
      marketing: false,
      app: "gridgo-rider/1.0.0",
      device: "rider-abc",
    });
    expect(
      enrollmentConsentBody(
        ["a"],
        { agreed: true, adult: false, guardian: true, marketing: true },
        context,
      ),
    ).toMatchObject({ junior: true, guardian: true, marketing: true });
  });

  it("labels the app within the API's 80 characters", () => {
    expect(legalAppLabel("1.2.3")).toBe("gridgo-rider/1.2.3");
    expect(legalAppLabel(undefined)).toBe("gridgo-rider/unknown");
    expect(legalAppLabel("9".repeat(100))).toHaveLength(80);
  });

  it("recognises the API's legal refusals and an API without the library", () => {
    const changed = new ApiError(409, { error: "legal_version_changed" });
    expect(isLegalRefusal(changed)).toBe(true);
    expect(isLegalVersionChanged(changed)).toBe(true);
    expect(isLegalRefusal(new ApiError(400, { error: "invalid_profile" }))).toBe(false);
    expect(isLegalUnsupported(new ApiError(404, { error: "not_found" }))).toBe(true);
    expect(isLegalUnsupported(new Error("offline"))).toBe(false);
  });
});

describe("the agreement gate's words", () => {
  it("says first use and a change differently", () => {
    expect(gateHeading([{ version: 1 }])).toBe("Agree to GRIDGO's terms");
    expect(gateHeading([{ version: 1 }, { version: 2 }])).toBe("GRIDGO's terms have changed");
  });

  it("names an editorial notice and asks nothing", () => {
    const terms = doc("terms-of-service", "Terms of Service", 3);
    expect(noticeHeading([terms])).toBe("GRIDGO updated its Terms of Service");
    expect(noticeBody([terms])).toBe(
      "Nothing to agree to. It stays in Account, under Legal & Privacy.",
    );
    expect(unseenNotices([terms], ["terms-of-service-3"])).toEqual([]);
  });
});

describe("the auth gate while terms wait", () => {
  it("sends every ordinary screen to the agreement screen", () => {
    for (const segments of [["(tabs)", "active"], ["alerts"], ["trip", "pickup"], ["(auth)", "login"]]) {
      expect(resolveAuthRedirect(true, segments, false, false, null, "blocked")).toBe("/legal/review");
    }
  });

  it("leaves the documents, privacy, deletion and sign-out's sheet open", () => {
    for (const root of LEGAL_OPEN_ROOTS) {
      expect(resolveAuthRedirect(true, [root], false, false, null, "blocked")).toBeNull();
    }
    expect(resolveAuthRedirect(true, ["legal", "review"], false, false, null, "blocked")).toBeNull();
  });

  it("moves on to Active once agreed, and holds the landing while unanswered", () => {
    expect(resolveAuthRedirect(true, ["legal", "review"], false, false, null, "clear")).toBe(
      "/(tabs)/active",
    );
    expect(resolveAuthRedirect(true, ["(auth)", "login"], false, false, null, "unknown")).toBe("/");
    expect(resolveAuthRedirect(true, ["(tabs)", "active"], false, false, null, "unknown")).toBe("/");
    // A deep link is left where it landed until the answer arrives.
    expect(resolveAuthRedirect(true, ["trip", "pickup"], false, false, null, "unknown")).toBeNull();
  });

  it("keeps the agreement screen and privacy behind sign-in, but documents public", () => {
    expect(resolveAuthRedirect(false, ["legal", "review"])).toBe("/(auth)/welcome");
    expect(resolveAuthRedirect(false, ["privacy"])).toBe("/(auth)/welcome");
    expect(resolveAuthRedirect(false, ["legal", "[versionId]"])).toBeNull();
  });

  it("sign-out still wins over a blocked answer", () => {
    expect(resolveAuthRedirect(true, ["legal", "review"], false, false, "out", "blocked")).toBe(
      "/(auth)/welcome",
    );
  });
});

describe("privacy requests", () => {
  const request = (patch: Partial<PrivacyRequest>): PrivacyRequest => ({
    id: "pr_1",
    kind: "access",
    status: "pending",
    requestedAt: "2026-10-09T02:00:00.000Z",
    dueAt: "2026-10-24T02:00:00.000Z",
    updatedAt: "2026-10-12T02:00:00.000Z",
    ...patch,
  });

  it("says when it is due, or when it closed", () => {
    expect(privacyRequestLine(request({}))).toBe("Sent 9 Oct 2026, answer due by 24 Oct 2026");
    expect(privacyRequestLine(request({ status: "completed" }))).toBe(
      "Sent 9 Oct 2026, closed 12 Oct 2026",
    );
    expect(privacyStatusLook("rejected").label).toBe("Declined");
    expect(privacyStatusLook("pending").label).toBe("Received");
  });

  it("finds an open request of the same kind", () => {
    expect(openRequestOf([request({})], "access")?.id).toBe("pr_1");
    expect(openRequestOf([request({ status: "completed" })], "access")).toBeNull();
    expect(openRequestOf([request({})], "correction")).toBeNull();
  });
});
