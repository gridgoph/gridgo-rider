import type { User, VerificationStatus } from "@/lib/api";
import { approvalPresentation, verificationStatusOf } from "@/lib/riderApproval";

function rider(patch: Partial<User> = {}): User {
  return {
    id: "user_rider",
    email: "carlo@example.com",
    name: "Carlo Rider",
    role: "rider",
    ...patch,
  };
}

const EVERY_STATUS: VerificationStatus[] = [
  "unverified",
  "pending",
  "approved",
  "suspended",
  "rejected",
];

describe("only an approved rider can work", () => {
  it("opens the app up for approved, and for nobody else", () => {
    expect(approvalPresentation(rider({ verificationStatus: "approved" })).canWork).toBe(true);
    for (const status of EVERY_STATUS.filter((s) => s !== "approved")) {
      expect(approvalPresentation(rider({ verificationStatus: status })).canWork).toBe(false);
    }
  });

  it("treats an account created before self sign-up as approved", () => {
    // Every one of those was created by Operations. Guessing "pending" would
    // lock a working rider out of a shift.
    expect(verificationStatusOf(rider())).toBe("approved");
    expect(approvalPresentation(rider()).canWork).toBe(true);
  });

  it("has no opinion at all with nobody signed in", () => {
    expect(approvalPresentation(null).canWork).toBe(true);
  });
});

describe("the wait is named, never dressed as an error or an empty list", () => {
  it("says a review is happening and that an alert will land", () => {
    const pending = approvalPresentation(rider({ verificationStatus: "pending" }));
    expect(pending.title).toMatch(/reviewing/i);
    expect(pending.body).toMatch(/alert/i);
    expect(pending.tone).toBe("info");
    expect(pending.chip).toBe("Awaiting approval");
  });

  it("repeats Operations' own words when they left any", () => {
    const note = "Licence photo was unreadable";
    for (const status of ["suspended", "rejected"] as VerificationStatus[]) {
      const presentation = approvalPresentation(
        rider({ verificationStatus: status, verificationNote: note }),
      );
      expect(presentation.body).toContain(note);
    }
  });

  it("still says something useful when they left none", () => {
    const rejected = approvalPresentation(rider({ verificationStatus: "rejected" }));
    expect(rejected.body).toMatch(/GRIDGO team/i);
    expect(rejected.tone).toBe("error");
  });
});

describe("every state reads in greyscale and in plain language", () => {
  it("carries an icon and a chip alongside the colour", () => {
    for (const status of EVERY_STATUS) {
      const presentation = approvalPresentation(rider({ verificationStatus: status }));
      expect(presentation.icon.length).toBeGreaterThan(0);
      expect(presentation.chip.length).toBeGreaterThan(0);
      expect(presentation.title).not.toMatch(/_/);
      expect(presentation.body).not.toMatch(/_/);
      expect(presentation.chip).not.toMatch(/_/);
    }
  });

  it("does not pass an enum off as copy where the enum is not English", () => {
    // "Approved" is both the enum and the right word, so it stays. "Unverified"
    // and "rejected" are not things to say to a rider about themselves.
    expect(approvalPresentation(rider({ verificationStatus: "unverified" })).chip).toBe(
      "Awaiting approval",
    );
    expect(approvalPresentation(rider({ verificationStatus: "rejected" })).chip).toBe(
      "Not accredited",
    );
  });
});
