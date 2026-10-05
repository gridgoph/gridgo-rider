import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

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

describe("the handover code at the door", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.health.mockResolvedValue({});
    api.getOrder.mockResolvedValue(atDoor);
    api.getHandover.mockResolvedValue({ otp: "482913" });
    api.escalateHandover.mockResolvedValue(undefined);
    api.recordDelivery.mockResolvedValue({ ...atDoor, state: "issue_window_open" });
  });

  it("shows the rider's code large, in two groups, and spells it out for a screen reader", async () => {
    await render(<DeliveryProofScreen />);
    await screen.findByText("Handover code");

    expect(screen.getByText("482")).toBeTruthy();
    expect(screen.getByText("913")).toBeTruthy();
    expect(screen.getByLabelText("Your handover code: 4 8 2 9 1 3")).toBeTruthy();
    expect(api.getHandover).toHaveBeenCalledWith("ord_1");
  });

  it("holds the delivery until the rider has compared codes", async () => {
    await render(<DeliveryProofScreen />);
    await screen.findByText("Handover code");

    expect(isDisabled(confirm())).toBe(true);
    expect(
      screen.getByText("Ask the client for their handover code and check it against yours."),
    ).toBeTruthy();
    await fireEvent.press(confirm());
    expect(api.recordDelivery).not.toHaveBeenCalled();
  });

  it("on a match, completes the delivery as before and sends the code with the evidence", async () => {
    await render(<DeliveryProofScreen />);
    await screen.findByText("Handover code");

    await fireEvent.press(button(/^codes match$/i));
    expect(screen.getByText("The client's code is the same as yours. Hand the package over.")).toBeTruthy();
    expect(isDisabled(confirm())).toBe(false);

    await fireEvent.press(confirm());
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.recordDelivery).toHaveBeenCalledWith("ord_1", {
      evidenceFileId: "fil_door",
      evidenceType: "photo",
      otp: "482913",
    });
  });

  it("on a mismatch, blocks the handover and makes escalation the one action", async () => {
    await render(<DeliveryProofScreen />);
    await screen.findByText("Handover code");

    await fireEvent.press(button(/codes don't match/i));

    expect(screen.getByText("Do not hand the package over")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /confirm delivery/i })).toBeNull();
    expect(screen.getByText("evidence locked")).toBeTruthy();
    expect(screen.queryByText("Acknowledgement receipt")).toBeNull();
    expect(
      screen.getByText("The codes do not match. Keep the package and escalate to Operations."),
    ).toBeTruthy();
    expect(api.recordDelivery).not.toHaveBeenCalled();
  });

  it("escalates to Operations through the API and says what to do while waiting", async () => {
    await render(<DeliveryProofScreen />);
    await screen.findByText("Handover code");

    await fireEvent.press(button(/codes don't match/i));
    await fireEvent.press(button(/escalate to operations/i));

    await screen.findByText("Operations has been alerted");
    expect(api.escalateHandover).toHaveBeenCalledWith("ord_1", HANDOVER_ESCALATION_REASON);
    expect(screen.getByText(/Keep the package with you and stay near the drop-off point/)).toBeTruthy();
    // Escalation records the report; it never unlocks the delivery.
    expect(isDisabled(confirm())).toBe(true);
    expect(api.recordDelivery).not.toHaveBeenCalled();
  });

  it("keeps the package held when the escalation does not reach Operations", async () => {
    api.escalateHandover.mockRejectedValue(new Error("Network request failed"));
    await render(<DeliveryProofScreen />);
    await screen.findByText("Handover code");

    await fireEvent.press(button(/codes don't match/i));
    await fireEvent.press(button(/escalate to operations/i));

    await screen.findByText("Operations was not alerted");
    expect(screen.queryByText("Operations has been alerted")).toBeNull();
    expect(button(/escalate to operations/i)).toBeTruthy();
  });

  it("lets a rider who misread the screen check the codes again", async () => {
    await render(<DeliveryProofScreen />);
    await screen.findByText("Handover code");

    await fireEvent.press(button(/codes don't match/i));
    await fireEvent.press(button(/check the codes again/i));
    await fireEvent.press(button(/^codes match$/i));

    expect(isDisabled(confirm())).toBe(false);
  });

  it("turns a server refusal of the code into the mismatch hold", async () => {
    api.recordDelivery.mockRejectedValue(
      new ApiError(409, { error: "handover_otp_mismatch", canEscalate: true }),
    );
    await render(<DeliveryProofScreen />);
    await screen.findByText("Handover code");

    await fireEvent.press(button(/^codes match$/i));
    await fireEvent.press(confirm());

    await screen.findByText("Do not hand the package over");
    expect(button(/escalate to operations/i)).toBeTruthy();
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it("delivers as before, without a code, on a job that has none", async () => {
    api.getHandover.mockResolvedValue(null);
    await render(<DeliveryProofScreen />);
    await screen.findByRole("button", { name: /confirm delivery/i });
    await waitFor(() => expect(api.getHandover).toHaveBeenCalled());

    expect(screen.queryByText("Handover code")).toBeNull();
    await fireEvent.press(confirm());
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.recordDelivery).toHaveBeenCalledWith("ord_1", {
      evidenceFileId: "fil_door",
      evidenceType: "photo",
    });
  });

  it("does not hand over blind when the code cannot be read", async () => {
    api.getHandover.mockRejectedValueOnce(new Error("Network request failed"));
    await render(<DeliveryProofScreen />);
    await screen.findByText("The handover code did not load");

    expect(isDisabled(confirm())).toBe(true);
    await fireEvent.press(button(/try again/i));
    await screen.findByText("Handover code");
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
      evidenceFileId: "fil_door",
      evidenceType: "photo",
    });
  });
});
