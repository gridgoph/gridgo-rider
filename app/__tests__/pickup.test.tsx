import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import type { Order, PickupCheckCode } from "@/lib/api";
import { useActiveTrip } from "@/store/activeTrip";
import { useTripProof } from "@/store/tripProof";

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
  submitPickupChecklist: jest.fn(),
}));

/** Evidence the server has already confirmed, switchable per test. */
const mockEvidence = { stored: {} as Record<string, string> };
jest.mock("@/hooks/useProofEvidence", () => ({
  useProofEvidence: () => ({
    evidence: null,
    upload: { phase: "idle" },
    stored: mockEvidence.stored,
    captureError: null,
    cameraBlocked: false,
    takePhoto: jest.fn(),
    attachSignature: jest.fn(),
    retry: jest.fn(),
    clear: jest.fn(),
  }),
}));

// Panels that fetch files of their own; not what this screen is tested for.
jest.mock("@/components/ArtworkPanel", () => ({ ArtworkPanel: () => null }));
jest.mock("@/components/ProductionSpecifications", () => ({
  ProductionSpecifications: () => null,
}));
jest.mock("@/components/EvidenceCapture", () => {
  const RN = jest.requireActual<typeof import("react-native")>("react-native");
  return { EvidenceCapture: (props: { title: string }) => <RN.Text>{props.title}</RN.Text> };
});

// eslint-disable-next-line import/first
import PickupChecklistScreen from "@/app/trip/pickup";

const api = jest.requireMock("@/lib/api") as {
  getOrder: jest.Mock;
  submitPickupChecklist: jest.Mock;
};

const atShop: Order = {
  id: "ord_1",
  clientId: "user_client",
  supplierId: "user_supplier",
  riderId: "user_rider",
  state: "rider_assigned",
  productId: "prod",
  title: "Print bundle",
  quantity: 2,
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
  supplierContact: { shopName: "PrintRight Davao", contactName: "Ana Reyes" },
  pickupChecklist: null,
  pickupCountItems: [
    { lineItemId: "cline_cards", itemName: "Business cards", expectedQuantity: 200 },
    { lineItemId: "cline_flyers", itemName: "A5 flyers", expectedQuantity: 50 },
  ],
  timeline: [],
};

const OTHER_FIVE: PickupCheckCode[] = [
  "specification_match",
  "visible_defects",
  "packaging_integrity",
  "documentation",
  "supplier_sign_off",
];

const cardsField = () => screen.getByLabelText("Pieces counted of Business cards, expected 200");
const flyersField = () => screen.getByLabelText("Pieces counted of A5 flyers, expected 50");
const actionButton = () =>
  screen.getByRole("button", { name: /confirm all six|supplier signs next|do not transport|recording/i });

/**
 * Answer the five hand-answered checks, Pass unless overridden. In count mode
 * they are the only Pass/Problem pairs on screen, in checklist order; against
 * an API without counts the quantity pair comes first and is left alone.
 */
async function answerOthers(overrides: Partial<Record<PickupCheckCode, boolean>> = {}) {
  const passes = screen.getAllByRole("radio", { name: "Pass" });
  const problems = screen.getAllByRole("radio", { name: "Problem" });
  const offset = passes.length - OTHER_FIVE.length;
  for (const [index, code] of OTHER_FIVE.entries()) {
    const passed = overrides[code] ?? true;
    await fireEvent.press((passed ? passes : problems)[index + offset]);
  }
}

function escalatedFrom(order: Order, counted: number): Order {
  return {
    ...order,
    pickupChecklist: {
      status: "failed_escalated",
      checks: [
        { code: "quantity_match", passed: false },
        ...OTHER_FIVE.map((code) => ({ code, passed: true })),
      ],
      counts: [
        { lineItemId: "cline_cards", expectedQuantity: 200, countedQuantity: counted },
        { lineItemId: "cline_flyers", expectedQuantity: 50, countedQuantity: 50 },
      ],
      evidenceFileIds: ["fil_photo"],
      failureNote: "Twenty cards missing from the second box",
      completedAt: "2026-09-27T07:00:00.000Z",
      completedBy: "user_rider",
      escalationId: "esc_1",
      signOffPrompt: null,
      handoffSignature: null,
    },
  };
}

describe("the count and six checks at the counter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEvidence.stored = {};
    api.getOrder.mockResolvedValue(atShop);
    useActiveTrip.setState({ order: atShop, loaded: true, loading: false, error: null });
    useTripProof.setState({ hydrated: true, checklists: {} });
  });

  it("shows one empty count per line, with the item and what is expected", async () => {
    await render(<PickupChecklistScreen />);
    await screen.findByText("Business cards");

    expect(screen.getByText("Expected 200")).toBeTruthy();
    expect(screen.getByText("Expected 50")).toBeTruthy();
    // Never prefilled: an expected number in the box is a count nobody made.
    expect(cardsField().props.value).toBe("");
    expect(flyersField().props.value).toBe("");
    // The quantity check has no Pass button to tap past the count.
    expect(screen.getByText("Count the pieces")).toBeTruthy();
    expect(screen.getAllByRole("radio", { name: "Pass" })).toHaveLength(5);

    await answerOthers();
    expect(actionButton().props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText("2 lines left to count.")).toBeTruthy();
  });

  it("goes on to the supplier's signature when every line matches, sending nothing yet", async () => {
    await render(<PickupChecklistScreen />);
    await screen.findByText("Business cards");

    await fireEvent.changeText(cardsField(), "200");
    await fireEvent.changeText(flyersField(), "50");
    await answerOthers();

    expect(screen.getAllByText("Matches")).toHaveLength(2);
    expect(actionButton().props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(actionButton());

    expect(api.submitPickupChecklist).not.toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: "/trip/handoff",
      params: { orderId: "ord_1" },
    });
    const draft = useTripProof.getState().getChecklist("ord_1");
    expect(draft?.counts).toEqual({ cline_cards: 200, cline_flyers: 50 });
    expect(draft?.completedAt).toEqual(expect.any(String));
  });

  it("blocks a short count until there is a photo and a note, then shows the pickup blocked", async () => {
    await render(<PickupChecklistScreen />);
    await screen.findByText("Business cards");

    await fireEvent.changeText(cardsField(), "180");
    await fireEvent.changeText(flyersField(), "50");
    await answerOthers();

    expect(screen.getByText("20 short")).toBeTruthy();
    expect(screen.getByText("Do not transport this package")).toBeTruthy();
    expect(actionButton().props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText(/photograph the problem/i)).toBeTruthy();

    mockEvidence.stored = { delivery_photo: "fil_photo" };
    await fireEvent.changeText(
      screen.getByLabelText("What is wrong with this package"),
      "Twenty cards missing from the second box",
    );
    expect(actionButton().props.accessibilityState.disabled).toBe(false);
    // The rider reads the number they typed back before committing.
    expect(screen.getByText(/the count is 20 short on Business cards/)).toBeTruthy();

    api.submitPickupChecklist.mockResolvedValue({
      order: escalatedFrom(atShop, 180),
      escalation: { id: "esc_1", status: "open" },
    });
    await fireEvent.press(actionButton());

    await waitFor(() => expect(api.submitPickupChecklist).toHaveBeenCalledTimes(1));
    expect(api.submitPickupChecklist).toHaveBeenCalledWith(
      "ord_1",
      [
        { code: "quantity_match", passed: false },
        ...OTHER_FIVE.map((code) => ({ code, passed: true })),
      ],
      [
        { lineItemId: "cline_cards", countedQuantity: 180 },
        { lineItemId: "cline_flyers", countedQuantity: 50 },
      ],
      {
        failure: {
          failureNote: "Twenty cards missing from the second box",
          evidenceFileIds: ["fil_photo"],
        },
      },
    );

    // A 200 that leaves the package at the shop is not a pickup.
    await screen.findByText("Pickup blocked. Operations has been alerted.");
    expect(screen.getByText("Counted 180 of 200")).toBeTruthy();
    expect(screen.getByText("Twenty cards missing from the second box")).toBeTruthy();
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(useActiveTrip.getState().order?.pickupChecklist?.status).toBe("failed_escalated");
    expect(useTripProof.getState().getChecklist("ord_1")).toBeNull();
    expect(screen.queryByLabelText(/pieces counted of/i)).toBeNull();
  });

  it("escalates a failed check even when the count matches", async () => {
    mockEvidence.stored = { delivery_photo: "fil_photo" };
    await render(<PickupChecklistScreen />);
    await screen.findByText("Business cards");

    await fireEvent.changeText(cardsField(), "200");
    await fireEvent.changeText(flyersField(), "50");
    await answerOthers({ visible_defects: false });
    await fireEvent.changeText(
      screen.getByLabelText("What is wrong with this package"),
      "First forty cards are smudged",
    );
    api.submitPickupChecklist.mockResolvedValue({
      order: { ...escalatedFrom(atShop, 200) },
      escalation: { id: "esc_1", status: "open" },
    });

    await fireEvent.press(actionButton());
    await waitFor(() => expect(api.submitPickupChecklist).toHaveBeenCalledTimes(1));
    const [, checks, counts] = api.submitPickupChecklist.mock.calls[0];
    expect(checks).toContainEqual({ code: "quantity_match", passed: true });
    expect(checks).toContainEqual({ code: "visible_defects", passed: false });
    expect(counts).toEqual([
      { lineItemId: "cline_cards", countedQuantity: 200 },
      { lineItemId: "cline_flyers", countedQuantity: 50 },
    ]);
  });

  it("opens straight onto the blocked receipt while the escalation is open", async () => {
    api.getOrder.mockResolvedValue(escalatedFrom(atShop, 180));
    await render(<PickupChecklistScreen />);

    await screen.findByText("Pickup blocked. Operations has been alerted.");
    expect(screen.getByText("20 short")).toBeTruthy();
    expect(screen.queryByLabelText(/pieces counted of/i)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Back to the trip" }));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it("asks for a fresh count once Operations has answered", async () => {
    api.getOrder.mockResolvedValue({
      ...atShop,
      pickupChecklist: { ...escalatedFrom(atShop, 180).pickupChecklist!, status: "escalation_resolved" },
    });
    await render(<PickupChecklistScreen />);

    await screen.findByText("Operations has answered");
    expect(cardsField().props.value).toBe("");
  });

  it("stops the pickup when the order has no number to count against", async () => {
    api.getOrder.mockResolvedValue({ ...atShop, pickupCountItems: null });
    await render(<PickupChecklistScreen />);

    await screen.findByText("No count to check against");
    await answerOthers();
    expect(actionButton().props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText(/call operations before you take anything/i)).toBeTruthy();
  });

  it("keeps working against an API older than counting", async () => {
    const { pickupCountItems: _omit, ...legacy } = atShop;
    api.getOrder.mockResolvedValue(legacy);
    mockEvidence.stored = { delivery_photo: "fil_photo" };
    await render(<PickupChecklistScreen />);
    await screen.findByText("Quantity matches");

    expect(screen.queryByLabelText(/pieces counted of/i)).toBeNull();
    expect(screen.getAllByRole("radio", { name: "Pass" })).toHaveLength(6);
    await fireEvent.press(screen.getAllByRole("radio", { name: "Pass" })[0]);
    await answerOthers({ specification_match: false });
    await fireEvent.changeText(
      screen.getByLabelText("What is wrong with this package"),
      "Wrong material on every piece",
    );
    api.submitPickupChecklist.mockResolvedValue({
      order: { ...legacy, pickupChecklist: { ...escalatedFrom(atShop, 200).pickupChecklist!, counts: undefined } },
    });
    await fireEvent.press(actionButton());

    await waitFor(() => expect(api.submitPickupChecklist).toHaveBeenCalledTimes(1));
    expect(api.submitPickupChecklist.mock.calls[0][2]).toBeNull();
  });

  it("reloads the job when the server refuses the counts", async () => {
    const { ApiError } = jest.requireActual<typeof import("@/lib/api")>("@/lib/api");
    mockEvidence.stored = { delivery_photo: "fil_photo" };
    await render(<PickupChecklistScreen />);
    await screen.findByText("Business cards");
    await fireEvent.changeText(cardsField(), "180");
    await fireEvent.changeText(flyersField(), "50");
    await answerOthers();
    await fireEvent.changeText(
      screen.getByLabelText("What is wrong with this package"),
      "Twenty cards missing from the second box",
    );
    api.submitPickupChecklist.mockRejectedValue(
      new ApiError(400, { error: "invalid_pickup_counts" }),
    );
    api.getOrder.mockClear();

    await fireEvent.press(actionButton());

    await screen.findByText("Checks not recorded");
    expect(screen.getByText(/count every line again/i)).toBeTruthy();
    expect(screen.queryByText(/invalid_pickup_counts/)).toBeNull();
    await waitFor(() => expect(api.getOrder).toHaveBeenCalled());
  });
});
