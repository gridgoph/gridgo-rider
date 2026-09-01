import { readFileSync } from "fs";
import { join } from "path";

jest.mock("expo-file-system/legacy", () => ({
  copyAsync: jest.fn(),
  createUploadTask: jest.fn(),
  FileSystemUploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
}));

jest.mock("@/lib/api", () => ({
  getApiBase: () => "http://127.0.0.1:8787",
  resolveBearer: jest.fn(async () => "clerk_jwt"),
}));

import { createUploadTask } from "expo-file-system/legacy";

import { resolveBearer } from "@/lib/api";
import {
  DELIVERY_TARGETS,
  MAX_EVIDENCE_BYTES,
  storageErrorMessage,
  uploadEvidence,
} from "@/lib/attachments";
import { UNREADABLE_CAPTURE_MESSAGE, type ProofEvidence } from "@/lib/proofEvidence";

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
  "invalid_milestone_code",
  "milestone_not_found",
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

  it("does not treat a missing delivered payout step as a broken photo", () => {
    expect(storageErrorMessage("invalid_milestone_code", 400)).toMatch(/delivery photo/i);
    expect(storageErrorMessage("milestone_not_found", 404)).toMatch(/enough/i);
  });

  it("falls back without guessing when the server sends no code", () => {
    expect(storageErrorMessage(undefined, 500)).toMatch(/again/i);
    expect(storageErrorMessage(undefined, 418)).toMatch(/again/i);
  });
});

const photo: ProofEvidence = {
  kind: "photo",
  uri: "file:///cache/delivery-photo.jpg",
  fileName: "delivery-photo.jpg",
  mimeType: "image/jpeg",
  capturedAt: "2026-09-01T05:32:00.000Z",
  sizeBytes: 40_000,
};

describe("uploadEvidence auth", () => {
  it("sends the Clerk bearer, not the empty memory token", () => {
    const source = readFileSync(join(__dirname, "../attachments.ts"), "utf8");
    expect(source).toContain("resolveBearer");
    expect(source).not.toMatch(/const token = getToken\(\)/);
  });

  it("streams the file natively instead of through XHR", () => {
    const source = readFileSync(join(__dirname, "../attachments.ts"), "utf8");
    expect(source).toContain("createUploadTask");
    expect(source).not.toContain("XMLHttpRequest");
  });
});

describe("uploadEvidence", () => {
  const createUploadTaskMock = createUploadTask as jest.MockedFunction<typeof createUploadTask>;
  const resolveBearerMock = resolveBearer as jest.MockedFunction<typeof resolveBearer>;

  beforeEach(() => {
    createUploadTaskMock.mockReset();
    resolveBearerMock.mockReset();
    resolveBearerMock.mockResolvedValue("clerk_jwt");
  });

  it("refuses a camera grant the phone cannot open, instead of calling it a dropped connection", async () => {
    const onPhase = jest.fn();
    const handle = uploadEvidence({
      orderId: "ord_1",
      evidence: { ...photo, uri: "content://media/external/images/media/1" },
      targets: [{ purpose: "delivery_photo" }],
      onPhase,
    });

    await expect(handle.result).rejects.toThrow("unreadable_capture");
    expect(createUploadTaskMock).not.toHaveBeenCalled();
    expect(onPhase).toHaveBeenCalledWith({
      phase: "failed",
      message: UNREADABLE_CAPTURE_MESSAGE,
      retryable: true,
    });
  });

  it("POSTs the file with the Clerk bearer and then attaches it", async () => {
    createUploadTaskMock.mockReturnValue({
      uploadAsync: jest.fn(async () => ({
        status: 201,
        body: JSON.stringify({ file: { fileId: "fil_1" } }),
        headers: {},
        mimeType: "application/json",
      })),
      cancelAsync: jest.fn(async () => undefined),
    } as unknown as ReturnType<typeof createUploadTask>);

    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true }),
    }) as unknown as typeof fetch;

    const onPhase = jest.fn();
    try {
      const handle = uploadEvidence({
        orderId: "ord_1",
        evidence: photo,
        targets: [{ purpose: "delivery_photo" }],
        onPhase,
      });
      await expect(handle.result).resolves.toEqual({ delivery_photo: "fil_1" });
    } finally {
      global.fetch = originalFetch;
    }

    expect(createUploadTaskMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/files",
      photo.uri,
      expect.objectContaining({
        fieldName: "file",
        parameters: { purpose: "delivery_photo" },
        headers: expect.objectContaining({ Authorization: "Bearer clerk_jwt" }),
      }),
      expect.any(Function),
    );
    expect(onPhase).toHaveBeenCalledWith({ phase: "stored", fileId: "fil_1" });
  });

  it("still saves the delivery photo when this job has no delivered payout step", async () => {
    let uploads = 0;
    createUploadTaskMock.mockImplementation(() => {
      uploads += 1;
      const fileId = uploads === 1 ? "fil_photo" : "fil_pof";
      return {
        uploadAsync: jest.fn(async () => ({
          status: 201,
          body: JSON.stringify({ file: { fileId } }),
          headers: {},
          mimeType: "application/json",
        })),
        cancelAsync: jest.fn(async () => undefined),
      } as unknown as ReturnType<typeof createUploadTask>;
    });

    const originalFetch = global.fetch;
    global.fetch = jest.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { milestoneCode?: string };
      if (body.milestoneCode === "delivered") {
        return {
          ok: false,
          status: 400,
          text: async () => JSON.stringify({ error: "invalid_milestone_code" }),
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ ok: true }),
      };
    }) as unknown as typeof fetch;

    const onPhase = jest.fn();
    try {
      const handle = uploadEvidence({
        orderId: "ord_office",
        evidence: photo,
        targets: DELIVERY_TARGETS,
        onPhase,
      });
      await expect(handle.result).resolves.toEqual({ delivery_photo: "fil_photo" });
    } finally {
      global.fetch = originalFetch;
    }

    expect(onPhase).toHaveBeenCalledWith({ phase: "stored", fileId: "fil_photo" });
  });
});

describe("evidence size limit", () => {
  it("matches the delivery_photo limit in the storage contract", () => {
    expect(MAX_EVIDENCE_BYTES).toBe(20971520);
  });
});
