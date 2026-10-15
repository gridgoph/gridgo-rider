import { fireEvent, render, screen } from "@testing-library/react-native";

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
}));

/** What the capture hook reports, switchable per test. */
const mockEvidence = {
  evidence: null as null | { kind: string },
  upload: { phase: "idle" } as { phase: string },
  stored: {} as Record<string, string>,
};
const mockTakePhoto = jest.fn();
let mockTargets: unknown = null;
jest.mock("@/hooks/useProofEvidence", () => ({
  useProofEvidence: (args: { targets: unknown }) => {
    mockTargets = args.targets;
    return {
      ...mockEvidence,
      captureError: null,
      cameraBlocked: false,
      takePhoto: mockTakePhoto,
      attachSignature: jest.fn(),
      retry: jest.fn(),
      clear: jest.fn(),
    };
  },
}));

jest.mock("@/components/EvidenceCapture", () => {
  const RN = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    EvidenceCapture: (props: { title: string; onTakePhoto: () => void }) => (
      <RN.Pressable accessibilityRole="button" accessibilityLabel={props.title} onPress={props.onTakePhoto}>
        <RN.Text>{props.title}</RN.Text>
      </RN.Pressable>
    ),
  };
});

// eslint-disable-next-line import/first
import PackedPhotoScreen from "@/app/trip/pack";

const api = jest.requireMock("@/lib/api") as { getOrder: jest.Mock };

const checks = (
  ["quantity_match", "specification_match", "visible_defects", "packaging_integrity", "documentation", "supplier_sign_off"] as const
).map((code) => ({ code, passed: true }));

const inspected: Order = {
  id: "ord_1",
  clientId: "user_client",
  supplierId: "user_supplier",
  riderId: "user_rider",
  state: "rider_assigned",
  productId: "prod",
  title: "Print bundle",
  quantity: 200,
  size: "",
  material: "",
  deadline: null,
  address: "Bajada, Davao City",
  zone: "davao_central",
  subtotalMinor: 50_000,
  totalMinor: 60_000,
  downpaymentMinor: 45_000,
  balanceMinor: 15_000,
  deliveryFeeMinor: 6_000,
  paymentMethod: "qr_manual",
  paymentStatus: "paid",
  promisedDate: null,
  artworkName: null,
  createdAt: "2026-09-27T05:00:00.000Z",
  updatedAt: "2026-09-27T06:00:00.000Z",
  pickup: { lat: 7.06, lng: 125.6, label: "PrintRight, Matina" },
  dropoff: { lat: 7.07, lng: 125.61, label: "Bajada" },
  handoverFlow: "rider_packs",
  pickupCountItems: [{ lineItemId: "cline_cards", itemName: "Business cards", expectedQuantity: 200 }],
  pickupChecklist: {
    status: "inspected",
    inspectionId: "inspection_1",
    checks,
    counts: [{ lineItemId: "cline_cards", expectedQuantity: 200, countedQuantity: 200 }],
    evidenceFileIds: [],
    failureNote: null,
    completedAt: "2026-09-27T07:00:00.000Z",
    completedBy: "user_rider",
    escalationId: null,
    signOffPrompt: null,
    handoffSignature: null,
  },
  shopHandover: {},
  timeline: [],
};

const nextButton = () => screen.getByRole("button", { name: "Shop signs next" });

describe("the packed photo on a rider_packs job", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEvidence.evidence = null;
    mockEvidence.upload = { phase: "idle" };
    mockEvidence.stored = {};
    api.getOrder.mockResolvedValue(inspected);
  });

  it("shows the recorded check, asks for the packed photo, and holds the signature until it is stored", async () => {
    await render(<PackedPhotoScreen />);
    await screen.findByText("Pack it in front of you");

    expect(screen.getByLabelText("Business cards: counted 200 of 200")).toBeTruthy();
    expect(screen.getByLabelText(/Step 2 of 3 at the counter/)).toBeTruthy();
    expect(mockTargets).toEqual([{ purpose: "packing_photo" }]);
    expect(nextButton().props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText("Photograph the packed job once every piece is in.")).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "The packed job" }));
    expect(mockTakePhoto).toHaveBeenCalled();
  });

  it("opens the signature once the server has stored the photo", async () => {
    mockEvidence.evidence = { kind: "photo" };
    mockEvidence.upload = { phase: "stored" };
    mockEvidence.stored = { packing_photo: "fil_pack" };
    await render(<PackedPhotoScreen />);
    await screen.findByText("Pack it in front of you");

    expect(nextButton().props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(nextButton());
    expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: "/trip/handoff", params: { orderId: "ord_1" } });
  });

  it("does not ask twice for a photo the server already holds for this check", async () => {
    api.getOrder.mockResolvedValue({
      ...inspected,
      shopHandover: {
        packingPhotos: [{ at: "2026-09-27T07:05:00.000Z", by: "user_rider", fileId: "fil_pack", inspectionId: "inspection_1" }],
      },
    });
    await render(<PackedPhotoScreen />);
    await screen.findByText("Packed photo saved");
    expect(screen.queryByRole("button", { name: "The packed job" })).toBeNull();
    expect(nextButton().props.accessibilityState.disabled).toBe(false);
  });

  it("sends the rider to the checks when nothing has been inspected", async () => {
    api.getOrder.mockResolvedValue({ ...inspected, pickupChecklist: null });
    await render(<PackedPhotoScreen />);
    await screen.findByText("Check the items unpacked first");
    await fireEvent.press(screen.getByRole("button", { name: "Open the pickup checks" }));
    expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: "/trip/pickup", params: { orderId: "ord_1" } });
  });

  it("has nothing to do on a legacy job but go back", async () => {
    api.getOrder.mockResolvedValue({ ...inspected, handoverFlow: "legacy" });
    await render(<PackedPhotoScreen />);
    await screen.findByText("This job has no packing step");
    expect(screen.getByRole("button", { name: "Back to the trip" })).toBeTruthy();
  });
});
