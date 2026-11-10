import { readFileSync } from "fs";
import { join } from "path";

import { createUploadTask } from "expo-file-system/legacy";

import { getFile, resolveBearer } from "@/lib/api";
import {
  DELIVERY_TARGETS,
  MAX_EVIDENCE_BYTES,
  storageErrorMessage,
  uploadEvidence,
} from "@/lib/attachments";
import { UNREADABLE_CAPTURE_MESSAGE, type ProofEvidence } from "@/lib/proofEvidence";

jest.mock("expo-file-system/legacy", () => ({
  copyAsync: jest.fn(),
  createUploadTask: jest.fn(),
  FileSystemUploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
}));

jest.mock("@/lib/api", () => ({
  getApiBase: () => "http://127.0.0.1:8787",
  resolveBearer: jest.fn(async () => "clerk_jwt"),
  reportUpdateRequired: jest.fn(() => false),
  getFile: jest.fn(),
}));

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

describe("partial evidence retries", () => {
  const nativeUpload = jest.mocked(createUploadTask);
  const originalFetch = global.fetch;
  const response = (status = 200, error?: string) => ({
    ok: status === 200, status, text: async () => JSON.stringify({ error }),
  });
  let attaches: jest.Mock;
  const args = {
    orderId: "ord_1", actorId: "rider_1", step: "delivery" as const,
    inspectionId: null, evidence: { ...photo, sizeBytes: 2 * 1024 * 1024 },
    targets: DELIVERY_TARGETS, onPhase: jest.fn(),
  };

  beforeEach(() => {
    jest.mocked(resolveBearer).mockResolvedValue("clerk_jwt");
    jest.mocked(getFile).mockReset();
    args.onPhase.mockClear();
    nativeUpload.mockReset();
    let uploads = 0;
    nativeUpload.mockImplementation(() => ({
      uploadAsync: async () => ({ status: 201, body: JSON.stringify({ file: { fileId: `fil_${++uploads}` } }) }),
      cancelAsync: async () => undefined,
    }) as unknown as ReturnType<typeof createUploadTask>);
    attaches = jest.fn().mockResolvedValue(response());
    global.fetch = attaches;
  });
  afterEach(() => { global.fetch = originalFetch; });

  it("retries only the second attach after its transient failure, without resending either 2 MiB upload", async () => {
    attaches.mockResolvedValueOnce(response()).mockResolvedValueOnce(response(503, "temporarily_unavailable"));
    const first = uploadEvidence(args);
    await expect(first.result).rejects.toThrow();
    expect(args.onPhase).not.toHaveBeenCalledWith(expect.objectContaining({ phase: "stored" }));
    const retry = uploadEvidence({ ...args, resume: first.checkpoint });
    await expect(retry.result).resolves.toEqual({ delivery_photo: "fil_1", fulfilment_proof: "fil_2" });
    expect(nativeUpload).toHaveBeenCalledTimes(2);
    expect(attaches.mock.calls.map(([url]) => url)).toEqual([
      "http://127.0.0.1:8787/files/fil_1/attach",
      "http://127.0.0.1:8787/files/fil_2/attach",
      "http://127.0.0.1:8787/files/fil_2/attach",
    ]);
    expect(JSON.parse(attaches.mock.calls[2][1].body)).toEqual({ orderId: "ord_1", milestoneCode: "delivered" });
  });

  it("keeps the first attachment when uploading the second purpose fails", async () => {
    const successfulUpload = nativeUpload.getMockImplementation()!;
    nativeUpload.mockImplementationOnce(successfulUpload).mockImplementationOnce(() => ({
      uploadAsync: async () => ({ status: 503, body: '{"error":"temporary_failure"}' }),
      cancelAsync: async () => undefined,
    }) as unknown as ReturnType<typeof createUploadTask>);
    const first = uploadEvidence(args);
    await expect(first.result).rejects.toThrow();
    await expect(uploadEvidence({ ...args, resume: first.checkpoint }).result)
      .resolves.toEqual({ delivery_photo: "fil_1", fulfilment_proof: "fil_2" });
    expect(nativeUpload).toHaveBeenCalledTimes(3);
    expect(attaches).toHaveBeenCalledTimes(2);
  });

  it("does not confirm a late attach response after cancellation", async () => {
    let finishAttach!: (value: ReturnType<typeof response>) => void;
    attaches.mockImplementationOnce(() => new Promise((resolve) => { finishAttach = resolve; }));
    const handle = uploadEvidence(args);
    // Let the native upload reach the pending attach.
    await Promise.resolve();
    await Promise.resolve();
    handle.cancel();
    finishAttach(response());
    await expect(handle.result).rejects.toThrow("cancelled");
    expect(handle.checkpoint.attached).toEqual({});
    expect(args.onPhase).not.toHaveBeenCalledWith(expect.objectContaining({ phase: "stored" }));
  });

  it.each(["connection", "response body"])("reconciles an ambiguous attach after losing the %s", async (lost) => {
    if (lost === "connection") attaches.mockRejectedValueOnce(new Error("response lost"));
    else attaches.mockResolvedValueOnce({ ...response(), text: async () => { throw new Error("body lost"); } });
    attaches.mockResolvedValueOnce(response(409, "file_already_attached"));
    jest.mocked(getFile).mockResolvedValue({
      fileId: "fil_1", ownerId: "rider_1", state: "ready", purpose: "delivery_photo",
      references: [{ type: "order", id: "ord_1" }],
    } as Awaited<ReturnType<typeof getFile>>);
    const first = uploadEvidence(args);
    await expect(first.result).rejects.toThrow();
    expect(args.onPhase).toHaveBeenLastCalledWith(expect.objectContaining({ phase: "failed", retryable: true }));
    await expect(uploadEvidence({ ...args, resume: first.checkpoint }).result)
      .resolves.toEqual({ delivery_photo: "fil_1", fulfilment_proof: "fil_2" });
    expect(getFile).toHaveBeenCalledWith("fil_1");
    expect(nativeUpload).toHaveBeenCalledTimes(2);
    expect(attaches).toHaveBeenCalledTimes(3);
  });

  it.each(["wrong order", "wrong owner", "wrong purpose", "wrong id", "not ready", "read failed"])(
    "reuploads only the unconfirmed purpose after a conflict: %s", async (reason) => {
      attaches.mockResolvedValueOnce(response()).mockRejectedValueOnce(new Error("response lost"))
        .mockResolvedValueOnce(response(409, "file_already_attached"));
      // Confirm a photo with no hidden milestone/inspection scope.
      const metadata = {
        fileId: reason === "wrong id" ? "other" : "fil_2", ownerId: reason === "wrong owner" ? "other" : "rider_1",
        state: reason === "not ready" ? "deleted" : "ready", purpose: reason === "wrong purpose" ? "artwork" : "delivery_photo",
        references: [{ type: "order", id: reason === "wrong order" ? "other" : "ord_1" }],
      };
      if (reason === "read failed") jest.mocked(getFile).mockRejectedValue(new Error("offline"));
      else jest.mocked(getFile).mockResolvedValue(metadata as Awaited<ReturnType<typeof getFile>>);
      const reversed = { ...args, targets: [...DELIVERY_TARGETS].reverse() };
      const first = uploadEvidence(reversed);
      await expect(first.result).rejects.toThrow();
      await expect(uploadEvidence({ ...reversed, resume: first.checkpoint }).result)
        .resolves.toEqual({ fulfilment_proof: "fil_1", delivery_photo: "fil_3" });
      expect(nativeUpload).toHaveBeenCalledTimes(3);
      expect(attaches).toHaveBeenCalledTimes(4);
      expect(nativeUpload.mock.calls[2][2]).toEqual(expect.objectContaining({ parameters: { purpose: "delivery_photo" } }));
    },
  );

  it("does not adopt an ambiguous file when the rider read hides its milestone scope", async () => {
    attaches.mockResolvedValueOnce(response()).mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce(response(409, "file_already_attached"));
    jest.mocked(getFile).mockResolvedValue({
      fileId: "fil_2", ownerId: "rider_1", state: "ready", purpose: "order_photo",
      references: [{ type: "order", id: "ord_1" }],
    } as unknown as Awaited<ReturnType<typeof getFile>>);
    const first = uploadEvidence(args);
    await expect(first.result).rejects.toThrow();
    await expect(uploadEvidence({ ...args, resume: first.checkpoint }).result)
      .resolves.toEqual({ delivery_photo: "fil_1", fulfilment_proof: "fil_3" });
    expect(nativeUpload).toHaveBeenCalledTimes(3);
    expect(attaches).toHaveBeenCalledTimes(4);
  });

  it("replaces a conflicted packing photo when the read cannot confirm its inspection", async () => {
    attaches.mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce(response(409, "file_already_attached"));
    jest.mocked(getFile).mockResolvedValue({
      fileId: "fil_1", ownerId: "rider_1", state: "ready", purpose: "packing_photo",
      references: [{ type: "order", id: "ord_1" }],
    } as unknown as Awaited<ReturnType<typeof getFile>>);
    const packing = { ...args, step: "packing" as const, inspectionId: "inspection_1", targets: [{ purpose: "packing_photo" as const }] };
    const first = uploadEvidence(packing);
    await expect(first.result).rejects.toThrow();
    await expect(uploadEvidence({ ...packing, resume: first.checkpoint }).result)
      .resolves.toEqual({ packing_photo: "fil_2" });
    expect(nativeUpload).toHaveBeenCalledTimes(2);
    expect(attaches).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["capture", { evidence: { ...args.evidence, uri: "file:///new.jpg", capturedAt: "2026-09-01T05:33:00.000Z" } }],
    ["order", { orderId: "ord_2" }],
    ["actor", { actorId: "rider_2" }],
    ["step", { step: "pickup" as const }],
    ["inspection", { inspectionId: "inspection_2" }],
    ["targets", { targets: [{ purpose: "delivery_photo" as const }] }],
  ])("starts fresh when %s changes", async (_name, change) => {
    attaches.mockResolvedValueOnce(response()).mockResolvedValueOnce(response(503));
    const first = uploadEvidence(args);
    await expect(first.result).rejects.toThrow();
    const next = { ...args, ...change, resume: first.checkpoint };
    await uploadEvidence(next).result;
    expect(nativeUpload).toHaveBeenCalledTimes(2 + next.targets.length);
    expect(attaches).toHaveBeenCalledTimes(2 + next.targets.length);
  });
});
