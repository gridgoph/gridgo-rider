import { readFileSync } from "fs";
import { join } from "path";

import { MAX_EVIDENCE_BYTES, storageErrorMessage } from "@/lib/attachments";

/** Every error code the storage contract documents for a rider upload. */
const RIDER_CODES = [
  "invalid_file_purpose",
  "invalid_multipart",
  "unexpected_form_field",
  "file_required",
  "file_empty",
  "filename_required",
  "attachment_target_required",
  "unexpected_target_field",
  "invalid_json",
  "unauthorized",
  "forbidden",
  "file_not_found",
  "order_not_found",
  "file_not_ready",
  "file_already_attached",
  "file_state_conflict",
  "file_metadata_invalid",
  "delivery_photo_upload_not_allowed",
  "storage_object_missing",
  "storage_object_mismatch",
  "file_too_large",
  "request_body_too_large",
  "multipart_required",
  "content_type_not_allowed",
  "purpose_media_type_not_allowed",
  "file_type_mismatch",
  "heic_not_supported",
  "minio_unavailable",
  "storage_initializing",
];

describe("storageErrorMessage", () => {
  it("never puts an internal code or a status number on screen", () => {
    for (const code of [...RIDER_CODES, undefined]) {
      const message = storageErrorMessage(code, 400);
      expect(message).not.toMatch(/_/);
      expect(message).not.toMatch(/\b[45]\d\d\b/);
    }
  });

  it("gives every documented failure a sentence with a next step", () => {
    for (const code of RIDER_CODES) {
      const message = storageErrorMessage(code, 400);
      expect(message.length).toBeGreaterThan(25);
      expect(message.trim().endsWith(".")).toBe(true);
    }
  });

  it("names the phone-camera format problem specifically", () => {
    expect(storageErrorMessage("heic_not_supported", 415)).toMatch(/format/i);
    expect(storageErrorMessage("heic_not_supported", 415)).toMatch(/signature|Compatible/i);
  });

  it("tells the rider to warn Operations when the store itself is down", () => {
    expect(storageErrorMessage("minio_unavailable", 503)).toMatch(/Operations/);
  });

  it("falls back without guessing when the server sends no code", () => {
    expect(storageErrorMessage(undefined, 500)).toMatch(/again/i);
    expect(storageErrorMessage(undefined, 418)).toMatch(/again/i);
  });
});

describe("uploadEvidence auth", () => {
  it("sends the Clerk bearer, not the empty memory token", () => {
    const source = readFileSync(join(__dirname, "../attachments.ts"), "utf8");
    expect(source).toContain("resolveBearer");
    expect(source).not.toMatch(/const token = getToken\(\)/);
  });
});

describe("evidence size limit", () => {
  it("matches the delivery_photo limit in the storage contract", () => {
    expect(MAX_EVIDENCE_BYTES).toBe(20971520);
  });
});
