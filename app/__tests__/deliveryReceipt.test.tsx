import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import type { Order } from "@/lib/api";

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
}));

/** Evidence already stored, so the only thing left on the screen is the receipt. */
jest.mock("@/hooks/useProofEvidence", () => ({
  useProofEvidence: () => ({
    evidence: {
      kind: "photo",
      uri: "file:///cache/door.jpg",
      fileName: "door.jpg",
      mimeType: "image/jpeg",
      capturedAt: "2026-09-25T09:00:00.000Z",
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

// The camera surface is covered by its own tests; here it only has to exist.
jest.mock("@/components/EvidenceCapture", () => ({ EvidenceCapture: () => null }));

// The screen is imported after its native pieces are mocked above.
// eslint-disable-next-line import/first
import DeliveryProofScreen from "@/app/trip/delivery";

const api = jest.requireMock("@/lib/api") as {
  getOrder: jest.Mock;
  health: jest.Mock;
  recordDelivery: jest.Mock;
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
  pickup: { lat: 7.06, lng: 125.6, label: "PrintRight, Matina" },
  dropoff: { lat: 7.07, lng: 125.61, label: "Bajada" },
  pickupChecklist: null,
  timeline: [],
} as unknown as Order;

const tick = () => screen.getByRole("checkbox", { name: "Receipt handed over" });
const confirm = () => screen.getByRole("button", { name: /confirm delivery/i });

describe("the acknowledgement receipt at the door", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.health.mockResolvedValue({});
    api.getOrder.mockResolvedValue(atDoor);
    api.recordDelivery.mockResolvedValue({ ...atDoor, state: "issue_window_open" });
  });

  it("reminds the rider to hand it over, and never calls it an official receipt", async () => {
    await render(<DeliveryProofScreen />);
    await screen.findByText("Acknowledgement receipt");

    expect(screen.getByText("HAND THIS TO THE CLIENT")).toBeTruthy();
    expect(screen.getByText(/acknowledgement receipt with the package/)).toBeTruthy();
    expect(screen.queryByText(/official receipt/i)).toBeNull();
  });

  it("ticks and unticks as the rider's own reminder", async () => {
    await render(<DeliveryProofScreen />);
    await screen.findByText("Acknowledgement receipt");

    expect(tick().props.accessibilityState).toMatchObject({ checked: false });
    await fireEvent.press(tick());
    expect(tick().props.accessibilityState).toMatchObject({ checked: true });
    await fireEvent.press(tick());
    expect(tick().props.accessibilityState).toMatchObject({ checked: false });
  });

  it("does not hold the delivery back, and sends the server evidence only", async () => {
    await render(<DeliveryProofScreen />);
    await screen.findByText("Acknowledgement receipt");

    // Unticked, and still the button is live.
    expect(confirm().props.accessibilityState).not.toMatchObject({ disabled: true });

    await fireEvent.press(tick());
    await fireEvent.press(confirm());

    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.recordDelivery).toHaveBeenCalledTimes(1);
    expect(api.recordDelivery).toHaveBeenCalledWith("ord_1", {
      evidenceFileId: "fil_door",
      evidenceType: "photo",
    });
  });

  it("confirms without the tick, too", async () => {
    await render(<DeliveryProofScreen />);
    await screen.findByText("Acknowledgement receipt");

    await fireEvent.press(confirm());

    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.recordDelivery).toHaveBeenCalledTimes(1);
  });

  it("is not asked for at GRIDGO's own counter, where there is no client", async () => {
    api.getOrder.mockResolvedValue({ ...atDoor, fulfillmentMode: "pickup" });
    await render(<DeliveryProofScreen />);
    await screen.findByRole("button", { name: /confirm drop-off/i });

    expect(screen.queryByText("Acknowledgement receipt")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});
