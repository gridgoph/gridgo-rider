import type { User, VerificationStatus } from "@/lib/api";
import { approvalPresentation, rootStackOwner, verificationStatusOf } from "@/lib/riderApproval";

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
    expect(pending.chip).toBe("In review");
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

  it("keeps every chip short enough to share a title line", () => {
    // The chip sits beside the screen title now, and the title is the only
    // thing in that row that gives way — so a long chip truncates the name of
    // the screen the rider is looking at. "Not accredited" is the longest that
    // fits, and it is the ceiling rather than a target.
    for (const status of EVERY_STATUS) {
      expect(
        approvalPresentation(rider({ verificationStatus: status })).chip.length,
      ).toBeLessThanOrEqual("Not accredited".length);
    }
  });

  it("does not pass an enum off as copy where the enum is not English", () => {
    // "Approved" is both the enum and the right word, so it stays. "Unverified"
    // and "rejected" are not things to say to a rider about themselves.
    expect(approvalPresentation(rider({ verificationStatus: "unverified" })).chip).toBe(
      "In review",
    );
    expect(approvalPresentation(rider({ verificationStatus: "rejected" })).chip).toBe(
      "Not accredited",
    );
  });
});

describe("rootStackOwner", () => {
  it("changes with the rider and with their standing, and only then", () => {
    expect(rootStackOwner(null)).toBe("signed-out:approved");
    expect(rootStackOwner(rider())).toBe("user_rider:approved");
    // An older account with no status is approved, so it is the same owner.
    expect(rootStackOwner(rider({ verificationStatus: "approved" }))).toBe(rootStackOwner(rider()));
    expect(rootStackOwner(rider({ verificationStatus: "pending" }))).toBe("user_rider:pending");
  });
});
