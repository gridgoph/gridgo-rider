import {
  handoffReminderBlockReason,
  handoffReminderFields,
  isPackagePhotoRefusal,
  packagePhotoUnfinished,
} from "@/lib/handoffReminder";
import type { ProofEvidence } from "@/lib/proofEvidence";

const photo: ProofEvidence = {
  kind: "photo",
  uri: "file:///cache/package.jpg",
  fileName: "package.jpg",
  mimeType: "image/jpeg",
  capturedAt: "2026-10-28T09:00:00.000Z",
  sizeBytes: 2048,
};

describe("handoffReminderFields", () => {
  it("sends version 1 with a literal true reminder at the door", () => {
    expect(handoffReminderFields({ toOffice: false, reminded: true, photoConsent: false, packagePhotoFileId: null }))
      .toEqual({ handoffReminderVersion: 1, remindedClient: true, clientAgreedToPhoto: false });
  });

  it("names a package photo only with the client's agreement", () => {
    expect(handoffReminderFields({ toOffice: false, reminded: true, photoConsent: true, packagePhotoFileId: "fil_p" }))
      .toEqual({ handoffReminderVersion: 1, remindedClient: true, clientAgreedToPhoto: true, packagePhotoFileId: "fil_p" });
    expect(handoffReminderFields({ toOffice: false, reminded: true, photoConsent: false, packagePhotoFileId: "fil_p" }))
      .toEqual({ handoffReminderVersion: 1, remindedClient: true, clientAgreedToPhoto: false });
  });

  it("never sends a reminder that was not ticked", () => {
    expect(handoffReminderFields({ toOffice: false, reminded: false, photoConsent: false, packagePhotoFileId: null }))
      .not.toHaveProperty("remindedClient");
  });

  it("sends only the version at GRIDGO Office", () => {
    expect(handoffReminderFields({ toOffice: true, reminded: true, photoConsent: true, packagePhotoFileId: "fil_p" }))
      .toEqual({ handoffReminderVersion: 1 });
  });
});

describe("handoffReminderBlockReason", () => {
  it("holds a door delivery only until the reminder is ticked", () => {
    expect(handoffReminderBlockReason({ toOffice: false, reminded: false })).toMatch(/I reminded the client/);
    expect(handoffReminderBlockReason({ toOffice: false, reminded: true })).toBeNull();
    expect(handoffReminderBlockReason({ toOffice: true, reminded: false })).toBeNull();
  });
});

describe("packagePhotoUnfinished", () => {
  it("is true only for an agreed photo the server has not confirmed", () => {
    expect(packagePhotoUnfinished({ photoConsent: true, packageEvidence: photo, packagePhotoFileId: null })).toBe(true);
    expect(packagePhotoUnfinished({ photoConsent: true, packageEvidence: photo, packagePhotoFileId: "fil_p" })).toBe(false);
    expect(packagePhotoUnfinished({ photoConsent: true, packageEvidence: null, packagePhotoFileId: null })).toBe(false);
    expect(packagePhotoUnfinished({ photoConsent: false, packageEvidence: photo, packagePhotoFileId: null })).toBe(false);
  });
});

it("treats only package photo refusals as the package photo's fault", () => {
  expect(isPackagePhotoRefusal("package_photo_required")).toBe(true);
  expect(isPackagePhotoRefusal("invalid_package_photo")).toBe(true);
  expect(isPackagePhotoRefusal("client_reminder_required")).toBe(false);
  expect(isPackagePhotoRefusal(null)).toBe(false);
});
