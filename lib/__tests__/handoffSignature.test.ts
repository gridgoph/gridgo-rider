import {
  attestationLine,
  defaultSignerName,
  formatCheckedAt,
  handoffActionLabel,
  handoffBlockReason,
  shopDisplayName,
  signerNameValid,
} from "@/lib/handoffSignature";
import { EMPTY_ANSWERS, type ChecklistAnswers } from "@/lib/pickupChecklist";
import { UPLOAD_IDLE, type EvidenceUpload } from "@/lib/proofEvidence";

function allPass(): ChecklistAnswers {
  return {
    quantity_match: true,
    specification_match: true,
    visible_defects: true,
    packaging_integrity: true,
    documentation: true,
    supplier_sign_off: true,
  };
}

const READY = {
  answers: allPass(),
  signerName: "Ana Reyes",
  signed: true,
  upload: UPLOAD_IDLE as EvidenceUpload,
  storedFileId: null,
};

describe("the supplier's signature gates custody", () => {
  it("wants six passes before anyone signs", () => {
    expect(handoffBlockReason({ ...READY, answers: null })).toMatch(/six pickup checks/i);
    expect(handoffBlockReason({ ...READY, answers: { ...EMPTY_ANSWERS } })).toMatch(/six/i);
    expect(
      handoffBlockReason({ ...READY, answers: { ...allPass(), visible_defects: false } }),
    ).toMatch(/six/i);
  });

  it("rejects an empty pad and a bare tap, and opens up once there is ink", () => {
    // `signed` is the pad's own verdict — `hasEnoughInk` — so a dot and an empty
    // paper arrive here the same way.
    expect(handoffBlockReason({ ...READY, signed: false })).toMatch(/sign on the paper/i);
    expect(handoffBlockReason(READY)).toBeNull();
  });

  it("needs a named signer", () => {
    expect(handoffBlockReason({ ...READY, signerName: "" })).toMatch(/name/i);
    expect(handoffBlockReason({ ...READY, signerName: " A " })).toMatch(/name/i);
    expect(signerNameValid("Jo")).toBe(true);
    expect(signerNameValid("x".repeat(121))).toBe(false);
  });

  it("waits for the server while the file is in flight, and lets a dropped send be retried", () => {
    expect(
      handoffBlockReason({ ...READY, upload: { phase: "sending", sentBytes: 1, totalBytes: 9 } }),
    ).toMatch(/wait/i);
    expect(handoffBlockReason({ ...READY, upload: { phase: "processing" } })).toMatch(/wait/i);
    // Retryable: the button stays live so pressing it sends the same signature again.
    expect(
      handoffBlockReason({
        ...READY,
        upload: { phase: "failed", message: "No connection", retryable: true },
      }),
    ).toBeNull();
    expect(
      handoffBlockReason({
        ...READY,
        upload: { phase: "failed", message: "Refused", retryable: false },
      }),
    ).toMatch(/call Operations/i);
  });

  it("stands on a file the server already confirmed after a restart", () => {
    // The strokes may not have come back yet, but the server holds the file.
    expect(handoffBlockReason({ ...READY, signed: false, storedFileId: "fil_1" })).toBeNull();
    // A stored file still needs a signer to be named.
    expect(
      handoffBlockReason({ ...READY, signed: false, storedFileId: "fil_1", signerName: "" }),
    ).toMatch(/name/i);
  });

  it("keeps one verb on the button", () => {
    expect(handoffActionLabel({ busy: false, signed: false })).toMatch(/sign above/i);
    expect(handoffActionLabel({ busy: false, signed: true })).toBe("Done — take the package");
    expect(handoffActionLabel({ busy: true, signed: true })).toMatch(/recording/i);
  });
});

describe("what the supplier is agreeing to", () => {
  const order = { quantity: 120, title: "Tarpaulin 3×6 ft" };

  it("names the signer, the count, the six checks, the time and the rider", () => {
    const line = attestationLine({
      signerName: "Ana Reyes",
      order,
      riderName: "Mark Prado",
      checkedAt: "2026-09-19T07:24:00.000Z",
      nowMs: Date.parse("2026-09-19T09:00:00.000Z"),
    });
    expect(line).toMatch(/^By signing, Ana Reyes confirms/);
    expect(line).toContain("120 pieces of Tarpaulin 3×6 ft");
    expect(line).toMatch(/all six checks/);
    expect(line).toContain("GRIDGO rider Mark Prado");
    // A time is in it; its exact form is the device locale's.
    expect(line).toMatch(/ at \d{1,2}:\d{2}/);
  });

  it("does not put an unnamed signer or a missing time into the sentence", () => {
    const line = attestationLine({ signerName: "", order, riderName: null, checkedAt: null });
    expect(line).toMatch(/^By signing, The signer confirms/);
    expect(line).toMatch(/all six checks, and/);
    expect(line).toContain("the GRIDGO rider");
  });

  it("says one piece as one piece", () => {
    expect(attestationLine({ signerName: "Jo", order: { ...order, quantity: 1 }, riderName: null, checkedAt: null }))
      .toContain("1 piece of");
  });

  it("gives a bare time today and a date on any other day", () => {
    const at = "2026-09-19T07:24:00.000Z";
    expect(formatCheckedAt(at, Date.parse("2026-09-19T10:00:00.000Z"))).not.toMatch(/Sep/);
    expect(formatCheckedAt(at, Date.parse("2026-09-21T10:00:00.000Z"))).toMatch(/Sep/);
    expect(formatCheckedAt(null)).toBeNull();
    expect(formatCheckedAt("garbage")).toBeNull();
  });
});

describe("who is at the counter", () => {
  it("prefills the signer from the shop profile and never invents one", () => {
    expect(defaultSignerName({ supplierContact: { shopName: "PrintRight", contactName: " Ana " } })).toBe("Ana");
    expect(defaultSignerName({ supplierContact: { shopName: "PrintRight", contactName: null } })).toBe("");
    expect(defaultSignerName({ supplierContact: null })).toBe("");
    expect(defaultSignerName({})).toBe("");
  });

  it("names the shop by its profile first, then the stop", () => {
    expect(
      shopDisplayName({ supplierContact: { shopName: "PrintRight", contactName: null }, pickup: null }),
    ).toBe("PrintRight");
    expect(
      shopDisplayName({ supplierContact: null, pickup: { lat: 7, lng: 125, label: "Matina shop" } }),
    ).toBe("Matina shop");
    expect(shopDisplayName({ supplierContact: null, pickup: null })).toBe("The shop");
  });
});
