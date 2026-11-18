import { UPLOAD_IDLE } from "@/lib/proofEvidence";
import { receiptSignatureBlockReason, signatureFileRefused, signerNameProblem } from "@/lib/receiptSignature";

describe("the signed receipt", () => {
  it("wants a name of 2 to 120 characters", () => {
    expect(signerNameProblem(" J ")).toMatch(/Type the name/);
    expect(signerNameProblem("Jo")).toBeNull();
    expect(signerNameProblem("x".repeat(121))).toMatch(/under 120/);
    expect(signerNameProblem("x".repeat(120))).toBeNull();
  });

  it("asks for the name, then the signature, then waits for the upload", () => {
    expect(receiptSignatureBlockReason({ signerName: "", signed: true, upload: UPLOAD_IDLE })).toMatch(/Type the name/);
    expect(receiptSignatureBlockReason({ signerName: "José", signed: false, upload: UPLOAD_IDLE })).toMatch(/sign the receipt/);
    expect(
      receiptSignatureBlockReason({ signerName: "José", signed: true, upload: { phase: "processing" } }),
    ).toMatch(/Saving/);
    expect(receiptSignatureBlockReason({ signerName: "José", signed: true, upload: UPLOAD_IDLE })).toBeNull();
  });

  it("drops the stored file only when the server refused that signature", () => {
    expect(signatureFileRefused("invalid_acknowledgement_signature")).toBe(true);
    expect(signatureFileRefused("acknowledgement_receipt_mismatch")).toBe(true);
    expect(signatureFileRefused("acknowledgement_signer_name_required")).toBe(false);
    expect(signatureFileRefused(null)).toBe(false);
  });
});
