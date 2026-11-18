import type { EvidenceUpload } from "@/lib/proofEvidence";

/**
 * The receiving person's signature on the digital acknowledgement receipt
 * (gridgo-api `docs/RIDER_MAP_HOME_API.md`, "Digital acknowledgement
 * receipt"): a 2–120 character name and a PNG of the pad, uploaded as
 * `acknowledgement_signature`, then sent with the delivery under
 * `receiptMode: "digital"`. The server validates every part; these rules only
 * keep the button honest about what is still missing.
 */

export const SIGNER_NAME_MIN = 2;
export const SIGNER_NAME_MAX = 120;

export function signerNameProblem(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < SIGNER_NAME_MIN) return "Type the name of the person receiving the package.";
  if (trimmed.length > SIGNER_NAME_MAX) return `Keep the name under ${SIGNER_NAME_MAX} characters.`;
  return null;
}

/** Why the signed receipt is not ready to send yet, or null. */
export function receiptSignatureBlockReason(input: {
  signerName: string;
  signed: boolean;
  upload: EvidenceUpload;
}): string | null {
  const name = signerNameProblem(input.signerName);
  if (name) return name;
  if (!input.signed) return "Ask the person receiving the package to sign the receipt on your phone.";
  if (input.upload.phase === "sending" || input.upload.phase === "processing") return "Saving the signature…";
  return null;
}

/** Refusals that mean the stored signature file cannot be reused. */
export function signatureFileRefused(code: string | null): boolean {
  return code === "invalid_acknowledgement_signature" || code === "acknowledgement_receipt_mismatch";
}
