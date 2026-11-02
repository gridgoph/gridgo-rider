import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { BackHandler } from "react-native";

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
  getHandover: jest.fn(),
  escalateHandover: jest.fn(),
}));

jest.mock("@/hooks/useProofEvidence", () => ({
  useProofEvidence: () => ({
    evidence: null,
    upload: { phase: "idle" },
    stored: {},
    captureError: null,
    cameraBlocked: false,
    takePhoto: jest.fn(),
    retry: jest.fn(),
    clear: jest.fn(),
    attachSignature: jest.fn(),
  }),
}));

// Arrival is recorded through the receipt card; the job it returns is what
// this suite watches. The receipt itself has its own suite (deliveryReceipt).
const mockReceipt: { onOrder: ((order: Order) => void) | null } = { onOrder: null };
jest.mock("@/hooks/useAcknowledgementReceipt", () => ({
  useAcknowledgementReceipt: (_order: unknown, options: { onOrder: (order: Order) => void }) => {
    mockReceipt.onOrder = options.onOrder;
    return {
      stage: "none",
      load: { status: "none" },
      retry: jest.fn(),
      arrive: jest.fn(),
      arriving: false,
      arrivalError: null,
    };
  },
}));
jest.mock("@/components/ReceiptReminder", () => ({ ReceiptReminder: () => null }));
jest.mock("@/components/EvidenceCapture", () => ({ EvidenceCapture: () => null }));

// The screen is imported after its native pieces are mocked above.
// eslint-disable-next-line import/first
import DeliveryProofScreen from "@/app/trip/delivery";

const api = jest.requireMock("@/lib/api") as {
  getOrder: jest.Mock;
  health: jest.Mock;
  getHandover: jest.Mock;
};

const milestone = (status: "pending" | "completed") => ({
  code: "arrived",
  label: "Arrived",
  status,
  at: status === "completed" ? "2026-11-03T09:00:00.000Z" : null,
});

const onTheWay = {
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
  deliveryMilestones: [milestone("pending")],
} as unknown as Order;

const arrived = { ...onTheWay, deliveryMilestones: [milestone("completed")] } as Order;

const field = () => screen.queryByLabelText("Client's six-digit handover code");
const codeRow = () => screen.getByRole("button", { name: /^Handover code, / });

async function openOnTheWay() {
  await render(<DeliveryProofScreen />);
  await screen.findByRole("button", { name: "Handover code, Not entered" });
}

async function arrive() {
  await act(async () => {
    mockReceipt.onOrder?.(arrived);
  });
}

describe("the full-screen code prompt at the drop-off", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReceipt.onOrder = null;
    api.health.mockResolvedValue({});
    api.getOrder.mockResolvedValue(onTheWay);
    api.getHandover.mockResolvedValue({ otpRequired: true });
  });

  it("stays closed on the way and opens by itself when the rider arrives", async () => {
    await openOnTheWay();
    expect(field()).toBeNull();
    await arrive();
    expect(field()).toBeTruthy();
    expect(screen.getByText("Ask the client to read their code aloud.")).toBeTruthy();
    expect(field()!.props.autoFocus).toBe(true);
    expect(screen.getByRole("button", { name: /^continue$/i })).toBeTruthy();
    // The delivery screen underneath is hidden, not gone.
    expect(screen.queryByRole("button", { name: /confirm delivery/i })).toBeNull();
  });

  it("opens straight away when the job is already marked arrived", async () => {
    api.getOrder.mockResolvedValue(arrived);
    await render(<DeliveryProofScreen />);
    await screen.findByLabelText("Client's six-digit handover code");
  });

  it("closes, stays closed, and reopens from the delivery screen with the code kept", async () => {
    api.getOrder.mockResolvedValue(arrived);
    await render(<DeliveryProofScreen />);
    await screen.findByLabelText("Client's six-digit handover code");
    await fireEvent.changeText(field()!, "4821");
    await fireEvent.press(screen.getByRole("button", { name: /^close$/i }));
    expect(field()).toBeNull();
    expect(screen.getByRole("button", { name: /confirm delivery/i })).toBeTruthy();
    // A fresh copy of the same job does not force it open again.
    await arrive();
    expect(field()).toBeNull();
    await fireEvent.press(codeRow());
    expect(field()!.props.value).toBe("4821");
    await fireEvent.changeText(field()!, "482109");
    await fireEvent.press(screen.getByRole("button", { name: /^continue$/i }));
    expect(codeRow().props.accessibilityLabel).toBe("Handover code, 482109");
  });

  it("closes on Android back instead of leaving the delivery step", async () => {
    const listeners: (() => boolean)[] = [];
    const spy = jest.spyOn(BackHandler, "addEventListener").mockImplementation((_event, listener) => {
      listeners.push(listener as () => boolean);
      return { remove: () => listeners.splice(listeners.indexOf(listener as () => boolean), 1) };
    });
    try {
      api.getOrder.mockResolvedValue(arrived);
      await render(<DeliveryProofScreen />);
      await screen.findByLabelText("Client's six-digit handover code");
      let handled = false;
      await act(async () => {
        handled = listeners.at(-1)!();
      });
      expect(handled).toBe(true);
      expect(field()).toBeNull();
      expect(listeners).toHaveLength(0);
      expect(mockRouter.back).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("never opens when codes are off or no code was issued", async () => {
    api.getHandover.mockResolvedValue(null);
    api.getOrder.mockResolvedValue(arrived);
    await render(<DeliveryProofScreen />);
    await screen.findByRole("button", { name: /confirm delivery/i });
    await waitFor(() => expect(api.getHandover).toHaveBeenCalled());
    expect(field()).toBeNull();
    expect(screen.queryByText("Handover code")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Handover code/ })).toBeNull();
  });
});
