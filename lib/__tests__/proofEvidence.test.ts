import {
  type EvidenceUpload,
  evidenceBlockReason,
  evidenceFileName,
  isEvidenceStored,
  isUploadInFlight,
  type ProofEvidence,
  UPLOAD_IDLE,
  uploadProgressFraction,
  uploadStatusLine,
} from "@/lib/proofEvidence";

const photo: ProofEvidence = {
  kind: "photo",
  uri: "file:///tmp/delivery.jpg",
  fileName: "delivery-photo-1.jpg",
  mimeType: "image/jpeg",
  capturedAt: "2026-08-10T02:00:00.000Z",
  sizeBytes: 400_000,
};

describe("the delivery gate", () => {
  it("blocks with no evidence, in the words of the step asking", () => {
    expect(evidenceBlockReason(null, UPLOAD_IDLE)).toBe("Capture the evidence first.");
    expect(evidenceBlockReason(null, UPLOAD_IDLE, "Photograph the gate.")).toBe(
      "Photograph the gate.",
    );
  });

  it("blocks a captured file that has not been sent", () => {
    expect(evidenceBlockReason(photo, UPLOAD_IDLE)).toMatch(/before confirming/i);
  });

  it("blocks while bytes are still moving", () => {
    const sending: EvidenceUpload = { phase: "sending", sentBytes: 10, totalBytes: 100 };
    expect(evidenceBlockReason(photo, sending)).toMatch(/wait/i);
  });

  it("blocks after the transfer while the server is still saving", () => {
    expect(evidenceBlockReason(photo, { phase: "processing" })).toMatch(/wait/i);
  });

  it("blocks a failed upload and asks for a resend", () => {
    const failed: EvidenceUpload = { phase: "failed", message: "No signal.", retryable: true };
    expect(evidenceBlockReason(photo, failed)).toMatch(/again/i);
  });

  it("stops asking for a resend when resending cannot work", () => {
    const rejected: EvidenceUpload = {
      phase: "failed",
      message: "Wrong format.",
      retryable: false,
    };
    const reason = evidenceBlockReason(photo, rejected);
    expect(reason).toMatch(/failed attempt|Operations/i);
  });

  it("opens only once the server returns a file id", () => {
    const stored: EvidenceUpload = { phase: "stored", fileId: "att_1" };
    expect(evidenceBlockReason(photo, stored)).toBeNull();
    expect(isEvidenceStored(stored)).toBe(true);
  });

  it("treats every non-stored phase as unproven", () => {
    const phases: EvidenceUpload[] = [
      UPLOAD_IDLE,
      { phase: "sending", sentBytes: 99, totalBytes: 100 },
      { phase: "processing" },
      { phase: "failed", message: "x", retryable: true },
    ];
    for (const phase of phases) {
      expect(isEvidenceStored(phase)).toBe(false);
    }
  });
});

describe("upload progress", () => {
  it("never reaches full while bytes are still going", () => {
    expect(
      uploadProgressFraction({ phase: "sending", sentBytes: 100, totalBytes: 100 }),
    ).toBe(0.99);
  });

  it("is absent when the total size is unknown", () => {
    expect(
      uploadProgressFraction({ phase: "sending", sentBytes: 10, totalBytes: null }),
    ).toBeNull();
    expect(uploadProgressFraction({ phase: "processing" })).toBeNull();
  });

  it("reports a real fraction mid-flight", () => {
    expect(
      uploadProgressFraction({ phase: "sending", sentBytes: 25, totalBytes: 100 }),
    ).toBeCloseTo(0.25);
  });

  it("counts sending and saving as in flight, and nothing else", () => {
    expect(isUploadInFlight({ phase: "sending", sentBytes: 1, totalBytes: 2 })).toBe(true);
    expect(isUploadInFlight({ phase: "processing" })).toBe(true);
    expect(isUploadInFlight(UPLOAD_IDLE)).toBe(false);
    expect(isUploadInFlight({ phase: "stored", fileId: "a" })).toBe(false);
  });
});

describe("upload status copy", () => {
  it("keeps sent and saved as different statements", () => {
    const sending = uploadStatusLine({ phase: "sending", sentBytes: 5, totalBytes: 10 });
    const processing = uploadStatusLine({ phase: "processing" });
    const stored = uploadStatusLine({ phase: "stored", fileId: "att_1" });
    expect(sending?.label).not.toBe(processing?.label);
    expect(processing?.label).not.toBe(stored?.label);
    expect(stored?.tone).toBe("success");
  });

  it("names the file the rider actually captured", () => {
    expect(uploadStatusLine({ phase: "sending", sentBytes: 1, totalBytes: 2 }, "signature")
      ?.label).toMatch(/signature/);
  });

  it("says nothing before a capture", () => {
    expect(uploadStatusLine(UPLOAD_IDLE)).toBeNull();
  });
});

describe("file names", () => {
  it("says which step and which kind it came from", () => {
    expect(evidenceFileName("delivery", "signature", 1754784000000, ".PNG")).toBe(
      "delivery-signature-1754784000000.png",
    );
  });
});
