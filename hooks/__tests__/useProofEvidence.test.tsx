import { act, renderHook } from "@testing-library/react-native";

import { useProofEvidence } from "@/hooks/useProofEvidence";
import { DELIVERY_TARGETS, PICKUP_FAILURE_TARGETS, uploadEvidence, type StoredEvidence } from "@/lib/attachments";
import { captureProofPhoto, signatureEvidence } from "@/lib/proofPhoto";
import type { ProofEvidence } from "@/lib/proofEvidence";

jest.mock("@/lib/attachments", () => ({
  ...jest.requireActual("@/lib/attachments"),
  uploadEvidence: jest.fn(),
}));
jest.mock("@/lib/proofPhoto", () => ({
  ...jest.requireActual("@/lib/proofPhoto"),
  captureProofPhoto: jest.fn(),
  signatureEvidence: jest.fn(),
}));

const photo: ProofEvidence = {
  kind: "photo", uri: "file:///door.jpg", fileName: "door.jpg",
  mimeType: "image/jpeg", capturedAt: "2026-10-08T09:00:00.000Z", sizeBytes: 2048,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => jest.resetAllMocks());

it.each(["pickup", "delivery"] as const)("%s cancels old uploads and ignores their late results", async (step) => {
  const pending = deferred<StoredEvidence>();
  const cancel = jest.fn();
  jest.mocked(captureProofPhoto).mockResolvedValue({ ok: true, evidence: photo });
  jest.mocked(uploadEvidence).mockReturnValue({ result: pending.promise, cancel });
  const { result, rerender } = await renderHook(({ orderId }: { orderId: string }) => useProofEvidence({
    orderId, step, targets: step === "pickup" ? PICKUP_FAILURE_TARGETS : DELIVERY_TARGETS,
  }), { initialProps: { orderId: "A" } });
  await act(() => result.current.takePhoto());
  const oldUpload = jest.mocked(uploadEvidence).mock.calls[0][0];
  await rerender({ orderId: "B" });
  expect(cancel).toHaveBeenCalledTimes(1);
  await act(async () => {
    oldUpload.onPhase({ phase: "stored", fileId: "old_file" });
    pending.resolve({ delivery_photo: "old_file" });
    await pending.promise;
  });
  expect(result.current.evidence).toBeNull();
  expect(result.current.upload).toEqual({ phase: "idle" });
  expect(result.current.stored).toEqual({});
  await act(() => result.current.retry());
  expect(uploadEvidence).toHaveBeenCalledTimes(1);
});

it.each(["photo", "signature"] as const)("ignores a %s capture completed after changing orders", async (kind) => {
  const pending = deferred<ProofEvidence>();
  jest.mocked(captureProofPhoto).mockImplementation(async () => ({ ok: true, evidence: await pending.promise }));
  jest.mocked(signatureEvidence).mockReturnValue(pending.promise);
  const { result, rerender } = await renderHook(({ orderId }: { orderId: string }) => useProofEvidence({
    orderId, step: "delivery", targets: DELIVERY_TARGETS,
  }), { initialProps: { orderId: "A" } });
  let capture!: Promise<void>;
  await act(() => {
    capture = kind === "photo" ? result.current.takePhoto() : result.current.attachSignature("file:///sign.png");
  });
  await rerender({ orderId: "B" });
  await act(async () => { pending.resolve(photo); await capture; });
  expect(result.current.evidence).toBeNull();
  expect(result.current.stored).toEqual({});
  expect(uploadEvidence).not.toHaveBeenCalled();
});

it("resets camera failure and signature fallback for the next order", async () => {
  jest.mocked(captureProofPhoto).mockResolvedValue({ ok: false, reason: "permission_denied" });
  const { result, rerender } = await renderHook(({ orderId }: { orderId: string }) => useProofEvidence({
    orderId, step: "delivery", targets: DELIVERY_TARGETS,
  }), { initialProps: { orderId: "A" } });
  await act(() => result.current.takePhoto());
  expect(result.current.captureError).not.toBeNull();
  expect(result.current.cameraBlocked).toBe(true);
  await rerender({ orderId: "B" });
  expect(result.current.captureError).toBeNull();
  expect(result.current.cameraBlocked).toBe(false);
});

it("ignores a signature panel callback held by an earlier order visit", async () => {
  const { result, rerender } = await renderHook(({ orderId }: { orderId: string }) => useProofEvidence({
    orderId, step: "delivery", targets: DELIVERY_TARGETS,
  }), { initialProps: { orderId: "A" } });
  const oldSignature = result.current.attachSignature;
  await rerender({ orderId: "B" });
  await rerender({ orderId: "A" });
  await act(() => oldSignature("file:///old-signature.png"));
  expect(signatureEvidence).not.toHaveBeenCalled();
  expect(result.current.evidence).toBeNull();
  expect(result.current.stored).toEqual({});
});
