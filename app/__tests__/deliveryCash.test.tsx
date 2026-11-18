import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { useCashNoShow } from "@/store/cashNoShow";
import { useSession } from "@/store/session";
import { AppState } from "react-native";

import type { Order, OrderCashDetail } from "@/lib/api";

const mockRouter = { back: jest.fn(), replace: jest.fn(), push: jest.fn() };

/** Whether the delivery screen is on top; flipped by `blur()` / `focus()`. */
let mockFocused = true;
const mockFocusListeners = new Set<() => void>();
jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = jest.requireActual<typeof import("react")>("react");
    const [, rerender] = React.useReducer((n: number) => n + 1, 0);
    React.useEffect(() => {
      mockFocusListeners.add(rerender);
      return () => {
        mockFocusListeners.delete(rerender);
      };
    }, []);
    const focused = mockFocused;
    React.useEffect(() => (focused ? callback() : undefined), [callback, focused]);
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
  recordArrival: jest.fn(),
  getAcknowledgementReceipt: jest.fn(),
  prepareAcknowledgementReceipt: jest.fn(),
  // No handover code on these jobs: the cash is the subject here.
  getHandover: jest.fn(() => Promise.resolve(null)),
  getOrderCash: jest.fn(),
  collectCashAtDoor: jest.fn(),
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

/** The live invalidation `useTripOrder` listens to, fired by hand. */
let mockLiveRefresh: (() => void) | null = null;
jest.mock("@/hooks/useLiveRefresh", () => ({
  useLiveRefresh: (_topics: string[], onRefresh: () => void) => {
    mockLiveRefresh = onRefresh;
  },
}));

// The camera surface is covered by its own tests; here it only has to exist.
jest.mock("@/components/EvidenceCapture", () => ({ EvidenceCapture: () => null }));

// The reminder card has its own suite (deliveryReminder); here it is ticked so
// the gate under test is the only one left.
jest.mock("@/components/HandoffReminderCard", () => ({
  HandoffReminderCard: ({ onReminded }: { onReminded: (value: boolean) => void }) => {
    jest.requireActual<typeof import("react")>("react").useEffect(() => onReminded(true), [onReminded]);
    return null;
  },
}));

// The pad draws on a native canvas; here it is a button that "signs", and a
// handle whose PNG is a fixed path.
jest.mock("@/components/SignaturePad", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { Pressable } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    SignaturePad: React.forwardRef(function MockPad(
      props: { onSignedChange?: (signed: boolean) => void; onStrokesChange?: (strokes: unknown[], width: number) => void },
      ref: React.Ref<unknown>,
    ) {
      React.useImperativeHandle(ref, () => ({
        toPngFile: async () => "file:///cache/receipt-signature.png",
        clear: () => undefined,
        undo: () => undefined,
      }));
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign here"
          onPress={() => {
            props.onStrokesChange?.([[{ x: 1, y: 1 }]], 300);
            props.onSignedChange?.(true);
          }}
        />
      );
    }),
  };
});

const mockUploadEvidence = jest.fn();
jest.mock("@/lib/attachments", () => ({
  ...jest.requireActual("@/lib/attachments"),
  uploadEvidence: (...args: unknown[]) => mockUploadEvidence(...args),
}));
jest.mock("@/lib/proofPhoto", () => ({
  ...jest.requireActual("@/lib/proofPhoto"),
  receiptSignatureEvidence: async (uri: string) => ({
    kind: "signature",
    uri,
    fileName: "delivery-signature.png",
    mimeType: "image/png",
    capturedAt: "2026-10-21T01:01:00.000Z",
    sizeBytes: 900,
  }),
}));

// The screen is imported after its native pieces are mocked above.
// eslint-disable-next-line import/first
import DeliveryProofScreen from "@/app/trip/delivery";

const actual = jest.requireActual("@/lib/api") as typeof import("@/lib/api");
const api = jest.requireMock("@/lib/api") as {
  getOrder: jest.Mock;
  health: jest.Mock;
  recordDelivery: jest.Mock;
  recordArrival: jest.Mock;
  getAcknowledgementReceipt: jest.Mock;
  prepareAcknowledgementReceipt: jest.Mock;
  getOrderCash: jest.Mock;
  collectCashAtDoor: jest.Mock;
};

/*
  Cash at the door (gridgo-api#360), against the real delivery screen, receipt
  hook, order and cash-record hooks. Only the network is mocked.
*/

const AMOUNTS = { shopMinor: 1_000, collectMinor: 10_350, gridgoMinor: 2_230, riderMinor: 7_120 };

function cashAtDoor(version: number, status = "due"): Order {
  return {
    id: "ord_1",
    clientId: "user_client",
    supplierId: "user_supplier",
    riderId: "user_rider",
    riderAssignedAt: "2026-11-18T00:10:00.000Z",
    state: "out_for_delivery",
    fulfillmentMode: "delivery",
    title: "Flyers x100",
    quantity: 1,
    address: "Bajada, Davao City",
    zone: "davao_central",
    deliveryFeeMinor: 6_000,
    payments: { final_online: { status: "not_required", amountMinor: 0 } },
    cash: { method: "cash", version, status, noShowWaitSeconds: 600 },
    cashAmounts: AMOUNTS,
    pickup: { lat: 7.06, lng: 125.6, label: "PrintRight, Matina" },
    dropoff: { lat: 7.07, lng: 125.61, label: "Bajada" },
    pickupChecklist: null,
    timeline: [],
    deliveryMilestones: [
      { code: "on_the_way", label: "On the way to you", status: "completed", at: "2026-11-18T00:40:00.000Z" },
      { code: "arrived", label: "Arrived", status: "completed", at: "2026-11-18T01:00:00.000Z" },
    ],
  } as unknown as Order;
}

function cashRecord(version: number, patch: Partial<OrderCashDetail> = {}): OrderCashDetail {
  return {
    version,
    status: "due",
    amountDueMinor: 10_350,
    shopPaidAt: "2026-11-18T00:20:00.000Z",
    collectedAt: null,
    noShowApprovedAt: null,
    repaymentConfirmedAt: null,
    amounts: AMOUNTS,
    ...patch,
  };
}

const cashReceipt = {
  version: 1,
  orderId: "ord_1",
  orderNumber: "ord_1",
  arNumber: "AR-0000000007",
  issuedAt: "2026-11-18T01:05:00.000Z",
  issuedTo: "José Muñoz",
  currency: "PHP",
  lines: [{ id: "line_1", description: "Flyers", quantity: 1, unitPriceMinor: 4_350, subtotalMinor: 4_350 }],
  deliveryFeeMinor: 6_000,
  organizationDiscountMinor: 0,
  voucherDiscountMinor: 0,
  roundingAdjustmentMinor: 0,
  grandTotalMinor: 10_350,
  payments: [
    { code: "initial", type: "cash", method: "cash", reference: null, amountMinor: 10_350, amountReceivedMinor: 10_350, changeMinor: 0 },
  ],
  note: "This temporary receipt acknowledges initial receipt pending final processing.",
};

const notIssued = () => new actual.ApiError(404, { error: "acknowledgement_receipt_not_found" });
const RECORD = "Record ₱103.50 received";
const received = () => screen.getByTestId("cash-received-confirm");

/** The server's state, changed by each test the way the API would. */
let server: { order: Order; cash: OrderCashDetail; receipt: typeof cashReceipt | null };

async function openAtDoor() {
  await render(<DeliveryProofScreen />);
  await screen.findByRole("button", { name: RECORD });
  await fireEvent.press(received());
}

/** Operations' live invalidation reaches the phone, as it does after any cash change. */
async function liveRefresh() {
  await act(async () => {
    mockLiveRefresh?.();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFocused = true;
  jest.spyOn(AppState, "addEventListener").mockImplementation(
    () => ({ remove: () => undefined }) as ReturnType<typeof AppState.addEventListener>,
  );
  useSession.setState({
    user: { id: "user_rider", email: "rider@example.test", name: "Rider", role: "rider", verificationStatus: "approved" },
  } as never);
  useCashNoShow.setState({ byOrder: {}, hydrated: true, serverVersion: {} });
  server = { order: cashAtDoor(2), cash: cashRecord(2), receipt: null };
  api.health.mockResolvedValue({});
  api.getOrder.mockImplementation(async () => server.order);
  api.getOrderCash.mockImplementation(async () => server.cash);
  api.getAcknowledgementReceipt.mockImplementation(async () => {
    if (!server.receipt) throw notIssued();
    return server.receipt;
  });
});

describe("collecting the client's cash when the reply is lost (cash review P1-1)", () => {
  it("shows the receipt the server issued, never the collect action again", async () => {
    await openAtDoor();
    // The server records the collection and issues the receipt; the reply never arrives.
    api.collectCashAtDoor.mockImplementationOnce(async () => {
      server = { order: cashAtDoor(3, "collected"), cash: cashRecord(3, { collectedAt: "2026-11-18T01:05:00.000Z" }), receipt: cashReceipt };
      throw new TypeError("Network request failed");
    });
    await fireEvent.press(screen.getByRole("button", { name: RECORD }));
    await screen.findByText("Delivery not recorded");

    await liveRefresh();

    expect(await screen.findByText("AR-0000000007")).toBeTruthy();
    expect(screen.queryByRole("button", { name: RECORD })).toBeNull();
    expect(screen.queryByTestId("cash-received-confirm")).toBeNull();
    expect(api.collectCashAtDoor).toHaveBeenCalledTimes(1);
  });

  it("a retry resends the first request exactly — same body, same key — even after the cash record moved", async () => {
    await openAtDoor();
    api.collectCashAtDoor.mockRejectedValueOnce(new TypeError("Network request failed"));
    await fireEvent.press(screen.getByRole("button", { name: RECORD }));
    await screen.findByText("Delivery not recorded");

    // Something else moved the cash version; the collection is not on the server.
    server = { ...server, order: cashAtDoor(3), cash: cashRecord(3) };
    await liveRefresh();
    await waitFor(() => expect(api.getOrderCash).toHaveBeenCalledTimes(2));

    api.collectCashAtDoor.mockImplementationOnce(async () => {
      server = { order: cashAtDoor(4, "collected"), cash: cashRecord(4, { collectedAt: "2026-11-18T01:06:00.000Z" }), receipt: cashReceipt };
      return { cash: { version: 4, status: "collected" }, receipt: cashReceipt };
    });
    await waitFor(() => expect(screen.getByRole("button", { name: RECORD })).toBeTruthy());
    if (received().props.accessibilityState?.checked !== true) await fireEvent.press(received());
    await fireEvent.press(screen.getByRole("button", { name: RECORD }));

    expect(await screen.findByText("AR-0000000007")).toBeTruthy();
    const [first, second] = api.collectCashAtDoor.mock.calls;
    expect(second).toEqual(first);
    expect(first[1]).toEqual({ expectedVersion: 2, amountReceivedMinor: 10_350, evidenceFileId: "fil_door" });
  });

  it("a definite refusal starts a new request on the next tap, with the fresh version", async () => {
    await openAtDoor();
    api.collectCashAtDoor.mockImplementationOnce(async () => {
      server = { ...server, order: cashAtDoor(3), cash: cashRecord(3) };
      throw new actual.ApiError(409, { error: "cash_stale" });
    });
    await fireEvent.press(screen.getByRole("button", { name: RECORD }));
    await waitFor(() => expect(api.getOrderCash).toHaveBeenCalledTimes(2));

    api.collectCashAtDoor.mockResolvedValueOnce({ cash: { version: 4, status: "collected" }, receipt: cashReceipt });
    if (received().props.accessibilityState?.checked !== true) await fireEvent.press(received());
    await fireEvent.press(screen.getByRole("button", { name: RECORD }));

    expect(await screen.findByText("AR-0000000007")).toBeTruthy();
    const [first, second] = api.collectCashAtDoor.mock.calls;
    expect(second[1].expectedVersion).toBe(3);
    expect(second[2]).not.toBe(first[2]);
  });
});

describe("a no-show report Operations rejected (cash review P1-2)", () => {
  const STARTED = "2026-11-18T01:01:00.000Z";
  const REPORTED = "2026-11-18T01:12:00.000Z";

  beforeEach(() => {
    useCashNoShow.setState({
      byOrder: { ord_1: { startedAtMs: Date.parse(STARTED), contactMethod: "call", reportedAtMs: Date.parse(REPORTED) } },
      hydrated: true,
    serverVersion: {},
    });
  });

  it("while the report stands, the door holds and the collect action stays away", async () => {
    server.cash = cashRecord(5, { noShowStartedAt: STARTED, noShowReportedAt: REPORTED });
    await render(<DeliveryProofScreen />);
    await waitFor(() => expect(api.getOrderCash).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: RECORD })).toBeNull();
    expect(useCashNoShow.getState().byOrder.ord_1?.reportedAtMs).toBe(Date.parse(REPORTED));
  });

  it("after the rejection the phone forgets its report and the rider can collect", async () => {
    server = { ...server, order: cashAtDoor(5), cash: cashRecord(5, { noShowStartedAt: STARTED, noShowReportedAt: REPORTED }) };
    await render(<DeliveryProofScreen />);
    await waitFor(() => expect(api.getOrderCash).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: RECORD })).toBeNull();

    // Operations rejects: the server clears the report and the wait (cash version 6).
    server = { ...server, order: cashAtDoor(6), cash: cashRecord(6, { noShowStartedAt: null, noShowReportedAt: null }) };
    await liveRefresh();

    expect(await screen.findByRole("button", { name: RECORD })).toBeTruthy();
    expect(useCashNoShow.getState().byOrder.ord_1).toBeUndefined();

    api.collectCashAtDoor.mockResolvedValueOnce({ cash: { version: 7, status: "collected" }, receipt: cashReceipt });
    await fireEvent.press(received());
    await fireEvent.press(screen.getByRole("button", { name: RECORD }));
    expect(await screen.findByText("AR-0000000007")).toBeTruthy();
    expect(api.collectCashAtDoor.mock.calls[0][1].expectedVersion).toBe(6);
  });

  it("on a projection without the no-show fields, keeps what it saw rather than guess", async () => {
    server = { ...server, order: cashAtDoor(6), cash: cashRecord(6) };
    await render(<DeliveryProofScreen />);
    await waitFor(() => expect(api.getOrderCash).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: RECORD })).toBeNull();
    expect(useCashNoShow.getState().byOrder.ord_1?.reportedAtMs).toBe(Date.parse(REPORTED));
  });
});
