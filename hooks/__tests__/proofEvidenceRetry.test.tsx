import { act, renderHook } from "@testing-library/react-native";
import { createUploadTask } from "expo-file-system/legacy";

import { useProofEvidence } from "@/hooks/useProofEvidence";
import { DELIVERY_TARGETS } from "@/lib/attachments";
import { captureProofPhoto } from "@/lib/proofPhoto";
import type { ProofEvidence } from "@/lib/proofEvidence";

let mockActor = "rider_1";
jest.mock("@/store/session", () => ({
  useSession: (select: (state: { user: { id: string } }) => unknown) => select({ user: { id: mockActor } }),
}));
jest.mock("expo-file-system/legacy", () => ({
  createUploadTask: jest.fn(), FileSystemUploadType: { MULTIPART: 1 },
}));
jest.mock("@/lib/api", () => ({
  getApiBase: () => "http://127.0.0.1:8787",
  resolveBearer: async () => "jwt", reportUpdateRequired: jest.fn(), getFile: jest.fn(),
}));
jest.mock("@/lib/proofPhoto", () => ({ captureProofPhoto: jest.fn(), signatureEvidence: jest.fn() }));

const photo: ProofEvidence = {
  kind: "photo", uri: "file:///door.jpg", fileName: "door.jpg", mimeType: "image/jpeg",
  capturedAt: "2026-11-09T12:00:00.000Z", sizeBytes: 2 * 1024 * 1024,
};
const originalFetch = global.fetch;
let attaches: jest.Mock;
beforeEach(() => {
  mockActor = "rider_1";
  let uploads = 0;
  jest.mocked(createUploadTask).mockReset().mockImplementation(() => ({
    uploadAsync: async () => ({ status: 201, body: JSON.stringify({ file: { fileId: `file_${++uploads}` } }) }),
    cancelAsync: async () => undefined,
  }) as unknown as ReturnType<typeof createUploadTask>);
  jest.mocked(captureProofPhoto).mockReset().mockResolvedValue({ ok: true, evidence: photo });
  const ok = { ok: true, status: 200, text: async () => "{}" };
  attaches = jest.fn().mockResolvedValue(ok).mockResolvedValueOnce(ok)
    .mockResolvedValueOnce({ ok: false, status: 503, text: async () => '{"error":"temporary_failure"}' });
  global.fetch = attaches;
});
afterEach(() => { global.fetch = originalFetch; });

it("keeps a partial upload through the hook's retry and gates proof until both attaches finish", async () => {
  const { result } = await renderHook(() => useProofEvidence({ orderId: "A", step: "delivery", targets: DELIVERY_TARGETS }));
  await act(() => result.current.takePhoto());
  expect(result.current.upload.phase).toBe("failed");
  expect(result.current.stored).toEqual({});
  await act(() => result.current.retry());
  expect(result.current.upload).toEqual({ phase: "stored", fileId: "file_1" });
  expect(result.current.stored).toEqual({ delivery_photo: "file_1", fulfilment_proof: "file_2" });
  expect(createUploadTask).toHaveBeenCalledTimes(2);
  expect(attaches).toHaveBeenCalledTimes(3);
});

it("a retake starts fresh even when the camera returns the same capture metadata", async () => {
  const { result } = await renderHook(() => useProofEvidence({ orderId: "A", step: "delivery", targets: DELIVERY_TARGETS }));
  await act(() => result.current.takePhoto());
  await act(() => result.current.takePhoto());
  expect(result.current.stored).toEqual({ delivery_photo: "file_3", fulfilment_proof: "file_4" });
  expect(createUploadTask).toHaveBeenCalledTimes(4);
});

it.each(["order", "actor", "step", "inspection", "targets"])("drops the capture and retry when %s scope changes", async (change) => {
  const initialProps = { orderId: "A", step: "delivery" as "delivery" | "pickup", inspectionId: "inspection_1", targets: DELIVERY_TARGETS };
  const { result, rerender } = await renderHook((props: typeof initialProps) => useProofEvidence(props), { initialProps });
  await act(() => result.current.takePhoto());
  const oldRetry = result.current.retry;
  if (change === "actor") mockActor = "rider_2";
  await rerender({
    ...initialProps,
    ...(change === "order" ? { orderId: "B" } : {}),
    ...(change === "step" ? { step: "pickup" as const } : {}),
    ...(change === "inspection" ? { inspectionId: "inspection_2" } : {}),
    ...(change === "targets" ? { targets: [{ purpose: "delivery_photo" as const }] } : {}),
  });
  expect(result.current.evidence).toBeNull();
  expect(result.current.upload.phase).toBe("idle");
  expect(result.current.stored).toEqual({});
  await act(() => oldRetry());
  await act(() => result.current.retry());
  expect(createUploadTask).toHaveBeenCalledTimes(2);
});
