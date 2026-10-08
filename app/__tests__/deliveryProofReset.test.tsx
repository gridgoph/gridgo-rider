import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import type { Order } from "@/lib/api";

let mockOrderId = "ord_1";

const mockRouter = { back: jest.fn(), replace: jest.fn(), push: jest.fn() };

jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void) => {
    jest.requireActual<typeof import("react")>("react").useEffect(callback, [callback]);
  },
  useLocalSearchParams: () => ({ orderId: mockOrderId }),
  useRouter: () => mockRouter,
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getOrder: jest.fn(),
  health: jest.fn(),
  storageStatus: () => "available",
  recordDelivery: jest.fn(),
  // No handover code on these jobs: the receipt is the subject here.
  getHandover: jest.fn(() => Promise.resolve(null)),
}));

jest.mock("@/lib/proofPhoto", () => ({
  ...jest.requireActual("@/lib/proofPhoto"),
  captureProofPhoto: jest.fn(() => Promise.resolve({
    ok: true,
    evidence: {
      kind: "photo", uri: "file:///cache/door.jpg", fileName: "door.jpg",
      mimeType: "image/jpeg", capturedAt: "2026-10-08T09:00:00.000Z", sizeBytes: 2048,
    },
  })),
}));

jest.mock("@/lib/attachments", () => ({
  ...jest.requireActual("@/lib/attachments"),
  uploadEvidence: jest.fn(({ orderId, onPhase }) => {
    const fileId = `fil_${orderId}`;
    onPhase({ phase: "stored", fileId });
    return { cancel: jest.fn(), result: Promise.resolve({ delivery_photo: fileId }) };
  }),
}));

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

const confirm = () => screen.getByRole("button", { name: /confirm delivery/i });

it("clears saved proof when the same delivery screen switches orders", async () => {
  api.health.mockResolvedValue({});
  api.getOrder.mockImplementation((id: string) => Promise.resolve({ ...atDoor, id }));
  api.recordDelivery.mockResolvedValue({ ...atDoor, id: "ord_2", state: "issue_window_open" });
  const view = await render(<DeliveryProofScreen />);
  await screen.findByText("No evidence yet");
  await fireEvent.press(screen.getByRole("button", { name: "Open the camera" }));
  await screen.findByText("Saved on the server");
  expect(confirm()).toBeEnabled();

  mockOrderId = "ord_2";
  await view.rerender(<DeliveryProofScreen />);
  await screen.findByText("No evidence yet");
  expect(screen.queryByText("Saved on the server")).toBeNull();
  expect(screen.queryByLabelText("The proof photo you captured")).toBeNull();
  expect(confirm()).toBeDisabled();
  await fireEvent.press(confirm());
  expect(api.recordDelivery).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByRole("button", { name: "Open the camera" }));
  await screen.findByText("Saved on the server");
  await fireEvent.press(confirm());
  await waitFor(() => expect(api.recordDelivery).toHaveBeenCalledWith("ord_2", {
    evidenceFileId: "fil_ord_2", evidenceType: "photo",
  }));
});
