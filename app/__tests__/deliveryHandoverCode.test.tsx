import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { ApiError, type Order } from "@/lib/api";
import { HANDOVER_ESCALATION_REASON } from "@/lib/handoverCode";

const mockRouter = { back: jest.fn(), replace: jest.fn(), push: jest.fn() };

jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void) => {
    jest.requireActual<typeof import("react")>("react").useEffect(callback, [callback]);
  },
  useLocalSearchParams: () => ({ orderId: "ord_1" }),
  useRouter: () => mockRouter,
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getOrder: jest.fn(),
  health: jest.fn(),
  storageStatus: () => "available",
  recordDelivery: jest.fn(),
  getHandover: jest.fn(),
  escalateHandover: jest.fn(),
}));

/** Evidence already stored, so the code is the only thing left to settle. */
jest.mock("@/hooks/useProofEvidence", () => ({
  useProofEvidence: () => ({
    evidence: {
      kind: "photo",
      uri: "file:///cache/door.jpg",
      fileName: "door.jpg",
      mimeType: "image/jpeg",
      capturedAt: "2026-10-06T09:00:00.000Z",
      sizeBytes: 2048,
    },
    upload: { phase: "stored", fileId: "fil_door" },
    stored: { delivery_photo: "fil_door" },
    captureError: null,
    cameraBlocked: false,
    takePhoto: jest.fn(),
    retry: jest.fn(),
    clear: jest.fn(),
    attachSignature: jest.fn(),
  }),
}));

jest.mock("@/components/EvidenceCapture", () => ({
  EvidenceCapture: ({ disabled }: { disabled?: boolean }) => {
    const { Text } = jest.requireActual<typeof import("react-native")>("react-native");
    return <Text>{disabled ? "evidence locked" : "evidence open"}</Text>;
  },
}));

// The screen is imported after its native pieces are mocked above.
// eslint-disable-next-line import/first
import DeliveryProofScreen from "@/app/trip/delivery";

const api = jest.requireMock("@/lib/api") as {
  getOrder: jest.Mock;
  health: jest.Mock;
  recordDelivery: jest.Mock;
  getHandover: jest.Mock;
  escalateHandover: jest.Mock;
};

const atDoor = {
  id: "ord_1",
  clientId: "user_client",
  supplierId: "user_supplier",
  riderId: "user_rider",
  state: "out_for_delivery",
  fulfillmentMode: "delivery",
  title: "Tarpaulin 3×6 ft",
  quantity: 12,
  address: "Bajada, Davao City",
  zone: "davao_central",
  deliveryFeeMinor: 6_000,
  payments: { final_online: { status: "confirmed", amountMinor: 15_000 } },
  pickup: { lat: 7.06, lng: 125.6, label: "Matina" },
  dropoff: { lat: 7.07, lng: 125.61, label: "Bajada" },
  pickupChecklist: null,
  timeline: [],
} as unknown as Order;

const button = (name: RegExp) => screen.getByRole("button", { name });
const confirm = () => button(/confirm delivery/i);
const isDisabled = (node: { props: { accessibilityState?: { disabled?: boolean } } }) =>
  Boolean(node.props.accessibilityState?.disabled);

const codeInput = () => screen.getByLabelText("Client's six-digit handover code");
const enterCode = (code = "012345") => fireEvent.changeText(codeInput(), code);

async function openDelivery() {
  await render(<DeliveryProofScreen />);
  await screen.findByText("Handover code");
}

async function refuseCode(body: Record<string, unknown> = { error: "handover_otp_mismatch" }) {
  api.recordDelivery.mockRejectedValueOnce(new ApiError(409, body));
  await enterCode();
  await fireEvent.press(confirm());
  await screen.findByText("That code does not match");
}

describe("the spoken handover code at the door", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    for (const mock of [api.health, api.getOrder, api.getHandover, api.recordDelivery, api.escalateHandover]) mock.mockReset();
    api.health.mockResolvedValue({});
    api.getOrder.mockResolvedValue(atDoor);
    api.getHandover.mockResolvedValue({ otpRequired: true });
    api.escalateHandover.mockResolvedValue(undefined);
    api.recordDelivery.mockResolvedValue({ ...atDoor, state: "issue_window_open" });
  });

  it("starts empty, uses a numeric keypad, and has no rider code or match buttons", async () => {
    await openDelivery();
    expect(codeInput().props.value).toBe("");
    expect(codeInput().props.keyboardType).toBe("number-pad");
    expect(codeInput().props.maxLength).toBe(6);
    expect(screen.queryByLabelText(/Your handover code/)).toBeNull();
    expect(screen.queryByRole("button", { name: /codes match/i })).toBeNull();
    expect(api.getHandover).toHaveBeenCalledWith("ord_1");
    expect(isDisabled(confirm())).toBe(true);
    await enterCode("01234");
    expect(isDisabled(confirm())).toBe(true);
    await fireEvent.press(confirm());
    expect(api.recordDelivery).not.toHaveBeenCalled();
  });

  it("filters non-digits, limits entry to six and preserves leading zeroes in the submission", async () => {
    await openDelivery();
    await enterCode("01x234567");
    expect(codeInput().props.value).toBe("012345");
    expect(isDisabled(confirm())).toBe(false);
    expect(api.recordDelivery).not.toHaveBeenCalled();
    await fireEvent.press(confirm());
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.recordDelivery).toHaveBeenCalledWith("ord_1", {
      evidenceFileId: "fil_door", evidenceType: "photo", otp: "012345",
    });
  });

  it("holds a wrong code without guessing remaining tries and permits a corrected retry", async () => {
    await openDelivery();
    await refuseCode();
    expect(screen.getAllByText("That code does not match.").length).toBeGreaterThan(0);
    expect(screen.queryByText(/tries remaining/)).toBeNull();
    expect(codeInput().props.value).toBe("");
    expect(isDisabled(confirm())).toBe(true);
    expect(screen.getByText("evidence locked")).toBeTruthy();
    expect(mockRouter.back).not.toHaveBeenCalled();
    await enterCode("001234");
    await fireEvent.press(confirm());
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.recordDelivery).toHaveBeenLastCalledWith("ord_1", {
      evidenceFileId: "fil_door", evidenceType: "photo", otp: "001234",
    });
  });

  it("shows remaining tries only when the API supplies them", async () => {
    await openDelivery();
    await refuseCode({ error: "handover_otp_mismatch", remainingAttempts: 2 });
    expect(screen.getAllByText(/2 tries remaining/).length).toBeGreaterThan(0);
  });

  it("shows the server lockout time and prevents even a corrected code until expiry", async () => {
    jest.useFakeTimers();
    try {
      const retryAtMs = Date.now() + 15 * 60 * 1000;
      const retryAfter = new Date(retryAtMs).toISOString();
      api.recordDelivery.mockRejectedValueOnce(new ApiError(429, {
        error: "handover_attempts_exceeded", retryAfter, canEscalate: true,
      }));
      await openDelivery();
      await enterCode();
      await fireEvent.press(confirm());
      await screen.findByText("Code check locked");
      const retryLabel = new Date(retryAfter).toLocaleString("en-PH", {
        month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit",
      });
      expect(screen.getAllByText(`Too many attempts. Try again at ${retryLabel}.`).length).toBeGreaterThan(0);
      await enterCode("001234");
      expect(isDisabled(confirm())).toBe(true);
      await fireEvent.press(confirm());
      expect(api.recordDelivery).toHaveBeenCalledTimes(1);
      await fireEvent.press(button(/escalate to operations/i));
      await screen.findByText("Operations has been alerted");
      expect(isDisabled(confirm())).toBe(true);
      await act(async () => { jest.advanceTimersByTime(15 * 60 * 1000); });
      expect(screen.queryByText("Code check locked")).toBeNull();
      expect(isDisabled(confirm())).toBe(false);
      await fireEvent.press(confirm());
      await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    } finally {
      jest.useRealTimers();
    }
  });

  it("escalates a refused code without completing delivery or clearing the code gate", async () => {
    await openDelivery();
    await refuseCode();
    await fireEvent.press(button(/escalate to operations/i));
    await screen.findByText("Operations has been alerted");
    expect(api.escalateHandover).toHaveBeenCalledWith("ord_1", HANDOVER_ESCALATION_REASON);
    expect(isDisabled(confirm())).toBe(true);
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(api.recordDelivery).toHaveBeenCalledTimes(1);
  });

  it("keeps escalation available if Operations could not be alerted", async () => {
    api.escalateHandover.mockRejectedValue(new ApiError(500, { error: "internal_error" }));
    await openDelivery();
    await refuseCode();
    await fireEvent.press(button(/escalate to operations/i));
    await screen.findByText("Operations was not alerted");
    expect(screen.getByText(/^Keep the package with you, check your connection and try again/)).toBeTruthy();
    expect(button(/escalate to operations/i)).toBeTruthy();
    expect(isDisabled(confirm())).toBe(true);
  });

  it("does not mistake a network failure for a wrong code", async () => {
    api.recordDelivery.mockRejectedValueOnce(new Error("Network request failed"));
    await openDelivery();
    await enterCode();
    await fireEvent.press(confirm());
    await screen.findByText("Delivery not recorded");
    expect(screen.queryByText("That code does not match")).toBeNull();
    expect(codeInput().props.value).toBe("012345");
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it("delivers with evidence alone when the switch is off or no code was issued", async () => {
    api.getHandover.mockResolvedValue(null);
    await render(<DeliveryProofScreen />);
    await screen.findByRole("button", { name: /confirm delivery/i });
    await waitFor(() => expect(isDisabled(confirm())).toBe(false));
    expect(screen.queryByText("Handover code")).toBeNull();
    await fireEvent.press(confirm());
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.recordDelivery).toHaveBeenCalledWith("ord_1", {
      evidenceFileId: "fil_door", evidenceType: "photo",
    });
  });

  it("blocks an unread requirement and retries without bypassing entry", async () => {
    api.getHandover.mockRejectedValueOnce(new Error("Network request failed"));
    await render(<DeliveryProofScreen />);
    await screen.findByText("The handover requirement did not load");
    expect(isDisabled(confirm())).toBe(true);
    await fireEvent.press(button(/try again/i));
    await screen.findByText("Handover code");
    expect(isDisabled(confirm())).toBe(true);
    expect(api.getHandover).toHaveBeenCalledTimes(2);
  });

  it("never asks for a code on a job that ends at GRIDGO Office", async () => {
    api.getOrder.mockResolvedValue({ ...atDoor, fulfillmentMode: "pickup" });
    await render(<DeliveryProofScreen />);
    await screen.findByRole("button", { name: /confirm drop-off/i });
    expect(api.getHandover).not.toHaveBeenCalled();
    expect(screen.queryByText("Handover code")).toBeNull();
    await fireEvent.press(button(/confirm drop-off/i));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.recordDelivery).toHaveBeenCalledWith("ord_1", {
      evidenceFileId: "fil_door", evidenceType: "photo",
    });
  });
});
