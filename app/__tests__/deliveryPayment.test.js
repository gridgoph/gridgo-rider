/* global jest, beforeEach, afterEach, it, expect */
const React = require("react");
const { create, act } = require("react-test-renderer");
const DeliveryProofScreen = require("../trip/delivery").default;
const api = require("@/lib/api");
const { useProofEvidence } = require("@/hooks/useProofEvidence");

jest.mock("expo-router", () => ({ useLocalSearchParams: () => ({ orderId: "order-test" }), useRouter: () => ({ back: jest.fn() }) }));
jest.mock("react-native", () => ({
  ScrollView: "ScrollView",
  Text: "Text",
  // jest-expo's preset reads Platform during setup, so a bare mock must still provide it.
  Platform: { OS: "android", select: (options) => options.android ?? options.default },
}));
jest.mock("expo-file-system/legacy", () => ({ createUploadTask: jest.fn(), FileSystemUploadType: {} }));
jest.mock("@/hooks/useLiveRefresh", () => ({ useLiveRefresh: jest.fn() }));
jest.mock("@/lib/live", () => ({ liveGeneration: () => 1 }));
jest.mock("@/lib/api", () => ({
  getOrder: jest.fn(), health: jest.fn(), storageStatus: () => "available",
  recordDelivery: jest.fn(), getHandover: jest.fn(() => Promise.resolve(null)), ApiError: class ApiError extends Error {},
  apiErrorMessage: (_error, fallback) => fallback,
}));
jest.mock("@/store/activeTrip", () => ({ useActiveTrip: () => jest.fn() }));
jest.mock("@/hooks/useProofEvidence", () => ({ useProofEvidence: jest.fn(() => ({
  evidence: null, upload: { phase: "idle" }, stored: {},
  takePhoto: jest.fn(), retry: jest.fn(), clear: jest.fn(), attachSignature: jest.fn(),
})) }));
jest.mock("@/components/BlockingOverlay", () => ({ BlockingOverlay: "BlockingOverlay" }));
jest.mock("@/components/EvidenceCapture", () => ({ EvidenceCapture: "EvidenceCapture" }));
jest.mock("@/components/HandoverCodeCard", () => ({ HandoverCodeCard: "HandoverCodeCard" }));
jest.mock("@/components/InlineNotice", () => ({ InlineNotice: "InlineNotice" }));
jest.mock("@/components/PrimaryButton", () => ({ PrimaryButton: "PrimaryButton" }));
jest.mock("@/components/ReceiptReminder", () => ({ ReceiptReminder: "ReceiptReminder" }));
jest.mock("@/components/Screen", () => ({ Screen: "Screen" }));
jest.mock("@/components/SkeletonScreens", () => ({ ProofStepSkeleton: "ProofStepSkeleton" }));
jest.mock("@/components/StickyActionBar", () => ({ StickyActionBar: "StickyActionBar" }));
jest.mock("@/components/TripStepHeader", () => ({ TripStepHeader: "TripStepHeader" }));

function order(status) {
  return {
    id: "order-test", state: "out_for_delivery", fulfillmentMode: "delivery",
    payments: status ? {
      initial: { status: "confirmed", amountMinor: 41265 },
      final_online: { status, amountMinor: status === "not_required" ? 0 : 13755 },
    } : null,
  };
}
let view;
const warning = () => view.root.findAllByType("InlineNotice").find((node) => node.props.actionLabel === "Check again");
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  useProofEvidence.mockReturnValue({
    evidence: null, upload: { phase: "idle" }, stored: {},
    takePhoto: jest.fn(), retry: jest.fn(), clear: jest.fn(), attachSignature: jest.fn(),
  });
  api.health.mockResolvedValue({});
  api.getOrder.mockResolvedValue(order("pending_confirmation"));
  await act(async () => { view = create(React.createElement(DeliveryProofScreen)); });
});
afterEach(async () => { await act(async () => view.unmount()); });

it("Check again adopts confirmed final_online and unlocks capture while still requiring evidence", async () => {
  expect(warning()).toBeDefined();
  expect(view.root.findByType("EvidenceCapture").props.disabled).toBe(true);
  // The rider has just been told not to hand the package over, so no receipt either.
  expect(view.root.findAllByType("ReceiptReminder")).toHaveLength(0);
  api.getOrder.mockResolvedValueOnce(order("confirmed"));
  await act(async () => { warning().props.onAction(); });
  expect(api.getOrder).toHaveBeenLastCalledWith("order-test");
  expect(api.getOrder).toHaveBeenCalledTimes(2);
  expect(warning()).toBeUndefined();
  expect(view.root.findByType("EvidenceCapture").props.disabled).toBe(false);
  expect(view.root.findAllByType("ReceiptReminder")).toHaveLength(1);
  expect(view.root.findByType("PrimaryButton").props.disabled).toBe(true);
  expect(api.recordDelivery).not.toHaveBeenCalled();
});

it("Check again keeps an unconfirmed payment blocked", async () => {
  await act(async () => { warning().props.onAction(); });
  expect(warning()).toBeDefined();
  expect(view.root.findByType("EvidenceCapture").props.disabled).toBe(true);
  expect(api.recordDelivery).not.toHaveBeenCalled();
});

it("a failed refresh keeps the payment hold and shows the read error", async () => {
  api.getOrder.mockRejectedValueOnce(new Error("offline"));
  await act(async () => { warning().props.onAction(); });
  expect(warning()).toBeDefined();
  expect(view.root.findAllByType("InlineNotice").some((node) => node.props.title === "This job did not load")).toBe(true);
  expect(view.root.findByType("EvidenceCapture").props.disabled).toBe(true);
  expect(api.recordDelivery).not.toHaveBeenCalled();
});

it.each(["confirmed", "legacy_confirmed", "not_required"])("%s unlocks capture and confirms with stored evidence without a payment warning", async (status) => {
  useProofEvidence.mockReturnValue({
    evidence: { kind: "photo", uri: "file:///door.jpg" },
    upload: { phase: "stored", fileId: "file-door" },
    stored: { delivery_photo: "file-door" },
    takePhoto: jest.fn(), retry: jest.fn(), clear: jest.fn(), attachSignature: jest.fn(),
  });
  api.getOrder.mockResolvedValueOnce(order(status));
  api.recordDelivery.mockResolvedValueOnce({ ...order(status), state: "delivered" });
  await act(async () => { warning().props.onAction(); });
  expect(warning()).toBeUndefined();
  expect(view.root.findByType("EvidenceCapture").props.disabled).toBe(false);
  expect(view.root.findByType("PrimaryButton").props.disabled).toBe(false);
  await act(async () => { view.root.findByType("PrimaryButton").props.onPress(); });
  expect(api.recordDelivery).toHaveBeenCalledWith("order-test", {
    evidenceFileId: "file-door", evidenceType: "photo",
  });
});

it.each(["pending_confirmation", undefined])("%s keeps capture and confirmation blocked even with stored evidence", async (status) => {
  useProofEvidence.mockReturnValue({
    evidence: { kind: "photo", uri: "file:///door.jpg" },
    upload: { phase: "stored", fileId: "file-door" },
    stored: { delivery_photo: "file-door" },
    takePhoto: jest.fn(), retry: jest.fn(), clear: jest.fn(), attachSignature: jest.fn(),
  });
  api.getOrder.mockResolvedValueOnce(order(status));
  await act(async () => { warning().props.onAction(); });
  expect(warning()).toBeDefined();
  expect(view.root.findByType("EvidenceCapture").props.disabled).toBe(true);
  expect(view.root.findByType("PrimaryButton").props.disabled).toBe(true);
  await act(async () => { view.root.findByType("PrimaryButton").props.onPress(); });
  expect(api.recordDelivery).not.toHaveBeenCalled();
});
