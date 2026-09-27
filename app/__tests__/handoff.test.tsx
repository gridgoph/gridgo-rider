import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import type { Order } from "@/lib/api";
import type { SignatureStroke } from "@/lib/signature";
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

/** The upload pipeline, answering with a stored id the way the server would. */
jest.mock("@/lib/attachments", () => ({
  ...jest.requireActual("@/lib/attachments"),
  uploadEvidence: jest.fn(),
}));

jest.mock("@/lib/proofPhoto", () => ({
  ...jest.requireActual("@/lib/proofPhoto"),
  handoffSignatureEvidence: jest.fn(async (uri: string) => ({
    kind: "signature",
    uri,
    fileName: "pickup-signature-1.png",
    mimeType: "image/png",
    capturedAt: "2026-09-19T07:30:00.000Z",
    sizeBytes: 1200,
  })),
}));

/**
 * A pad that can be signed from a test. The real one is a PanResponder over
 * an SVG, which a test cannot draw on; what the screen needs from it is the
 * ink verdict, the strokes, and a PNG when asked.
 */
jest.mock("@/components/SignaturePad", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const RN = jest.requireActual<typeof import("react-native")>("react-native");
  const strokes: SignatureStroke[] = [[{ x: 0, y: 0 }, { x: 200, y: 20 }]];
  const SignaturePad = React.forwardRef(function SignaturePad(
    props: {
      onSignedChange?: (signed: boolean) => void;
      onStrokesChange?: (strokes: SignatureStroke[], width: number) => void;
      initialStrokes?: SignatureStroke[];
      hint?: string;
    },
    ref: React.Ref<{ toPngFile: () => Promise<string>; clear: () => void }>,
  ) {
    React.useImperativeHandle(ref, () => ({
      toPngFile: async () => "file:///cache/pad.png",
      clear: () => {
        props.onSignedChange?.(false);
        props.onStrokesChange?.([], 320);
      },
    }));
    return (
      <RN.View>
        <RN.Text>{props.hint}</RN.Text>
        <RN.Text testID="restored-strokes">{String(props.initialStrokes?.length ?? 0)}</RN.Text>
        <RN.Pressable
          accessibilityLabel="test: sign"
          onPress={() => {
            props.onStrokesChange?.(strokes, 320);
            props.onSignedChange?.(true);
          }}
        >
          <RN.Text>sign</RN.Text>
        </RN.Pressable>
        <RN.Pressable
          accessibilityLabel="test: dot"
          onPress={() => {
            // A single tap: strokes exist, but the pad says it is not a signature.
            props.onStrokesChange?.([[{ x: 1, y: 1 }]], 320);
            props.onSignedChange?.(false);
          }}
        >
          <RN.Text>dot</RN.Text>
        </RN.Pressable>
      </RN.View>
    );
  });
  return { SignaturePad };
});

jest.mock("@/store/session", () => ({
  useSession: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ user: { id: "user_rider", name: "Mark Prado", role: "rider" } }),
}));

// The screen is imported after its native pieces are mocked above.
// eslint-disable-next-line import/first
import HandoffSignatureScreen from "@/app/trip/handoff";

const api = jest.requireMock("@/lib/api") as {
  getOrder: jest.Mock;
  submitPickupChecklist: jest.Mock;
};
const attachments = jest.requireMock("@/lib/attachments") as { uploadEvidence: jest.Mock };

const atShop: Order = {
  id: "ord_1",
  clientId: "user_client",
  supplierId: "user_supplier",
  riderId: "user_rider",
  state: "rider_assigned",
  productId: "prod",
  title: "Tarpaulin 3×6 ft",
  quantity: 12,
  size: "3x6 ft",
  material: "tarpaulin",
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
  createdAt: "2026-09-18T15:00:00.000Z",
  updatedAt: "2026-09-19T07:00:00.000Z",
  pickup: { lat: 7.06, lng: 125.6, label: "PrintRight, Matina" },
  dropoff: { lat: 7.07, lng: 125.61, label: "Bajada" },
  supplierContact: { shopName: "PrintRight Davao", contactName: "Ana Reyes" },
  pickupChecklist: null,
  timeline: [],
};

const allSix = {
  quantity_match: true,
  specification_match: true,
  visible_defects: true,
  packaging_integrity: true,
  documentation: true,
  supplier_sign_off: true,
};

function draftAllPassed() {
  useTripProof.setState({
    hydrated: true,
    checklists: {
      ord_1: {
        answers: { ...allSix },
        failureNote: "",
        updatedAt: "2026-09-19T07:24:00.000Z",
        completedAt: "2026-09-19T07:24:00.000Z",
      },
    },
  });
}

function storedUpload(fileId = "fil_sig") {
  attachments.uploadEvidence.mockImplementation(
    ({ onPhase }: { onPhase: (phase: unknown) => void }) => {
      onPhase({ phase: "sending", sentBytes: 0, totalBytes: 1200 });
      onPhase({ phase: "processing" });
      onPhase({ phase: "stored", fileId });
      return { result: Promise.resolve({ handoff_signature: fileId }), cancel: jest.fn() };
    },
  );
}

const doneButton = () => screen.getByRole("button", { name: /done|sign above|recording/i });

describe("the supplier signs on the rider's phone", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.getOrder.mockResolvedValue(atShop);
    useActiveTrip.setState({ order: atShop, loaded: true, loading: false, error: null });
    draftAllPassed();
    storedUpload();
  });

  it("shows the six passed checks, addresses the supplier, and prefills the signer", async () => {
    await render(<HandoffSignatureScreen />);
    await screen.findByText("Supplier signs here");

    expect(screen.getByText("Six checks passed")).toBeTruthy();
    expect(screen.getByLabelText("Quantity matches: passed")).toBeTruthy();
    expect(screen.getByLabelText("Supplier signs off: passed")).toBeTruthy();
    expect(screen.getByText(/PrintRight Davao hands this job to Mark Prado/)).toBeTruthy();
    expect(screen.getByLabelText("Name of the person signing for the shop").props.value).toBe(
      "Ana Reyes",
    );
    expect(screen.getByText(/By signing, Ana Reyes confirms that 12 pieces of Tarpaulin/)).toBeTruthy();
  });

  it("refuses an empty pad and a single dot, and opens once there is a signature", async () => {
    await render(<HandoffSignatureScreen />);
    await screen.findByText("Supplier signs here");

    expect(doneButton().props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText(/ask the supplier to sign/i)).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("test: dot"));
    expect(doneButton().props.accessibilityState.disabled).toBe(true);

    await fireEvent.press(screen.getByLabelText("test: sign"));
    expect(doneButton().props.accessibilityState.disabled).toBe(false);
    expect(screen.getByText("Done — take the package")).toBeTruthy();

    // Clearing the paper closes it again.
    await fireEvent.press(screen.getByLabelText("Clear the signature"));
    expect(doneButton().props.accessibilityState.disabled).toBe(true);
  });

  it("will not send without a named signer", async () => {
    await render(<HandoffSignatureScreen />);
    await screen.findByText("Supplier signs here");
    await fireEvent.press(screen.getByLabelText("test: sign"));

    await fireEvent.changeText(screen.getByLabelText("Name of the person signing for the shop"), "");
    expect(doneButton().props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText("Type the name of the person signing for the shop.")).toBeTruthy();
  });

  it("stores the PNG, then sends the six checks with the file id and the signer", async () => {
    const moved = { ...atShop, state: "picked_up" };
    api.submitPickupChecklist.mockResolvedValue({ order: moved, signOffPrompt: "Salamat po!" });

    await render(<HandoffSignatureScreen />);
    await screen.findByText("Supplier signs here");
    await fireEvent.press(screen.getByLabelText("test: sign"));
    await fireEvent.changeText(
      screen.getByLabelText("Name of the person signing for the shop"),
      " Ana R. Reyes ",
    );

    await fireEvent.press(doneButton());

    await waitFor(() => expect(api.submitPickupChecklist).toHaveBeenCalledTimes(1));
    // The upload went under the handoff purpose, bound to this order.
    expect(attachments.uploadEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "ord_1",
        targets: [{ purpose: "handoff_signature" }],
      }),
    );
    expect(api.submitPickupChecklist).toHaveBeenCalledWith(
      "ord_1",
      [
        { code: "quantity_match", passed: true },
        { code: "specification_match", passed: true },
        { code: "visible_defects", passed: true },
        { code: "packaging_integrity", passed: true },
        { code: "documentation", passed: true },
        { code: "supplier_sign_off", passed: true },
      ],
      // This order comes from an API older than counting: no counts to send.
      null,
      { signature: { fileId: "fil_sig", signerName: "Ana R. Reyes" } },
    );
    // Custody moved: the trip adopts the order, the draft is gone, and the
    // screen steps back to the trip.
    expect(useActiveTrip.getState().order?.state).toBe("picked_up");
    expect(useTripProof.getState().getChecklist("ord_1")).toBeNull();
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it("keeps the signature and the checks on a refused send, and does not move the trip", async () => {
    const { ApiError } = jest.requireActual<typeof import("@/lib/api")>("@/lib/api");
    api.submitPickupChecklist.mockRejectedValue(
      new ApiError(409, { error: "pickup_checklist_not_available" }),
    );

    await render(<HandoffSignatureScreen />);
    await screen.findByText("Supplier signs here");
    await fireEvent.press(screen.getByLabelText("test: sign"));
    await fireEvent.press(doneButton());

    await screen.findByText("Handoff not recorded");
    expect(screen.queryByText(/pickup_checklist_not_available/)).toBeNull();
    expect(useActiveTrip.getState().order?.state).toBe("rider_assigned");
    expect(useTripProof.getState().getChecklist("ord_1")?.answers).toEqual(allSix);
    // The server confirmed the file, so a retry names it instead of asking
    // the supplier to sign twice.
    expect(useTripProof.getState().getChecklist("ord_1")?.signature?.storedFileId).toBe("fil_sig");
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it("comes back to the same paper after the app is killed at the counter", async () => {
    useTripProof.setState({
      hydrated: true,
      checklists: {
        ord_1: {
          answers: { ...allSix },
          failureNote: "",
          updatedAt: "2026-09-19T07:24:00.000Z",
          completedAt: "2026-09-19T07:24:00.000Z",
          signature: {
            strokes: [[{ x: 0, y: 0 }, { x: 150, y: 10 }]],
            padWidth: 300,
            signerName: "Ben Cruz",
            storedFileId: null,
          },
        },
      },
    });

    await render(<HandoffSignatureScreen />);
    await screen.findByText("Supplier signs here");

    expect(screen.getByTestId("restored-strokes").props.children).toBe("1");
    expect(screen.getByLabelText("Name of the person signing for the shop").props.value).toBe(
      "Ben Cruz",
    );
  });

  it("shows the counts to the signer and sends them with the signature", async () => {
    const counted: Order = {
      ...atShop,
      pickupCountItems: [
        { lineItemId: "cline_cards", itemName: "Business cards", expectedQuantity: 200 },
        { lineItemId: "cline_flyers", itemName: "A5 flyers", expectedQuantity: 50 },
      ],
    };
    api.getOrder.mockResolvedValue(counted);
    useTripProof.setState({
      hydrated: true,
      checklists: {
        ord_1: {
          // The quantity answer is read off the count, not from a tap.
          answers: { ...allSix, quantity_match: null },
          counts: { cline_cards: 200, cline_flyers: 50 },
          failureNote: "",
          updatedAt: "2026-09-19T07:24:00.000Z",
          completedAt: "2026-09-19T07:24:00.000Z",
        },
      },
    });
    api.submitPickupChecklist.mockResolvedValue({ order: { ...counted, state: "picked_up" } });

    await render(<HandoffSignatureScreen />);
    await screen.findByText("Supplier signs here");

    expect(screen.getByText("Counted together")).toBeTruthy();
    expect(screen.getByLabelText("Business cards: counted 200 of 200")).toBeTruthy();
    expect(screen.getByLabelText("A5 flyers: counted 50 of 50")).toBeTruthy();
    expect(
      screen.getByText(/confirms that 200 pieces of Business cards and 50 pieces of A5 flyers were counted/),
    ).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("test: sign"));
    await fireEvent.press(doneButton());

    await waitFor(() => expect(api.submitPickupChecklist).toHaveBeenCalledTimes(1));
    const [, checks, counts, outcome] = api.submitPickupChecklist.mock.calls[0];
    expect(checks).toContainEqual({ code: "quantity_match", passed: true });
    expect(counts).toEqual([
      { lineItemId: "cline_cards", countedQuantity: 200 },
      { lineItemId: "cline_flyers", countedQuantity: 50 },
    ]);
    expect(outcome).toEqual({ signature: { fileId: "fil_sig", signerName: "Ana Reyes" } });
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it("treats a 200 that did not move the package as blocked, not a pickup", async () => {
    api.submitPickupChecklist.mockResolvedValue({
      order: {
        ...atShop,
        pickupChecklist: {
          status: "failed_escalated",
          checks: [],
          evidenceFileIds: [],
          failureNote: null,
          completedAt: null,
          completedBy: null,
          escalationId: "esc_1",
          signOffPrompt: null,
        },
      },
    });

    await render(<HandoffSignatureScreen />);
    await screen.findByText("Supplier signs here");
    await fireEvent.press(screen.getByLabelText("test: sign"));
    await fireEvent.press(doneButton());

    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname: "/trip/pickup",
        params: { orderId: "ord_1" },
      }),
    );
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(useActiveTrip.getState().order?.state).toBe("rider_assigned");
  });

  it("refuses the signature when a line was counted short", async () => {
    api.getOrder.mockResolvedValue({
      ...atShop,
      pickupCountItems: [{ lineItemId: "cline_cards", itemName: "Business cards", expectedQuantity: 200 }],
    });
    useTripProof.setState({
      hydrated: true,
      checklists: {
        ord_1: {
          answers: { ...allSix },
          counts: { cline_cards: 180 },
          failureNote: "",
          updatedAt: "2026-09-19T07:24:00.000Z",
        },
      },
    });

    await render(<HandoffSignatureScreen />);
    await screen.findByText("The six checks come first");
    expect(screen.queryByText("Supplier signs here")).toBeNull();
  });

  it("sends the rider back to the checks when they have not all passed", async () => {
    useTripProof.setState({
      hydrated: true,
      checklists: {
        ord_1: {
          answers: { ...allSix, visible_defects: null },
          failureNote: "",
          updatedAt: "2026-09-19T07:24:00.000Z",
        },
      },
    });

    await render(<HandoffSignatureScreen />);
    await screen.findByText("The six checks come first");
    expect(screen.queryByText("Supplier signs here")).toBeNull();
    await fireEvent.press(screen.getByText("Open the pickup checks"));
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: "/trip/pickup",
      params: { orderId: "ord_1" },
    });
  });
});
