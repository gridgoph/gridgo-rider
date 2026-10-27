import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";

import type { Order } from "@/lib/api";
import type { AcknowledgementReceipt } from "@/lib/acknowledgementReceipt";

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
  // No handover code on these jobs: the receipt is the subject here.
  getHandover: jest.fn(() => Promise.resolve(null)),
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
};

const refused = (status: number, error: string) => new actual.ApiError(status, { error });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let appStateListeners: ((state: AppStateStatus) => void)[] = [];
async function appGoes(state: AppStateStatus) {
  await act(async () => {
    for (const listener of appStateListeners) listener(state);
  });
}
async function setFocus(focused: boolean) {
  await act(async () => {
    mockFocused = focused;
    for (const listener of mockFocusListeners) listener();
  });
}

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
  pickup: { lat: 7.06, lng: 125.6, label: "PrintRight, Matina" },
  dropoff: { lat: 7.07, lng: 125.61, label: "Bajada" },
  pickupChecklist: null,
  timeline: [],
  deliveryMilestones: [
    { code: "on_the_way", label: "On the way to you", status: "completed", at: "2026-10-21T00:40:00.000Z" },
    { code: "arrived", label: "Arrived", status: "pending", at: null },
  ],
} as unknown as Order;

const atDoor = {
  ...onTheWay,
  deliveryMilestones: [
    { code: "on_the_way", label: "On the way to you", status: "completed", at: "2026-10-21T00:40:00.000Z" },
    { code: "arrived", label: "Arrived", status: "completed", at: "2026-10-21T01:00:00.000Z" },
  ],
} as unknown as Order;

/** The contract's own example: legacy rounding, one manual QR payment. */
const receipt: AcknowledgementReceipt = {
  version: 1,
  orderId: "ord_1",
  orderNumber: "ord_1",
  arNumber: "AR-0000000001",
  issuedAt: "2026-10-21T01:00:00.000Z",
  issuedTo: "José Muñoz",
  currency: "PHP",
  lines: [
    { id: "line_1", description: "Flyers", quantity: 1, unitPriceMinor: 5506, subtotalMinor: 5506 },
    { id: "line_2", description: "Posters", quantity: 3, unitPriceMinor: null, subtotalMinor: 5506 },
  ],
  deliveryFeeMinor: 5000,
  organizationDiscountMinor: 0,
  voucherDiscountMinor: 0,
  roundingAdjustmentMinor: -1,
  grandTotalMinor: 16011,
  payments: [
    {
      code: "initial",
      type: "digital",
      method: "qr_manual",
      reference: "RECORDED-REFERENCE",
      amountMinor: 16011,
      amountReceivedMinor: null,
      changeMinor: null,
    },
  ],
  note:
    "This temporary receipt acknowledges initial receipt pending final processing. It does not replace an Official Receipt or final invoice.",
};

const tick = () => screen.getByRole("checkbox", { name: "Receipt handed over" });
const confirm = () => screen.getByRole("button", { name: /confirm delivery/i });
const arrive = () => screen.getByRole("button", { name: "I'm at the client's door" });
const held = () => confirm().props.accessibilityState?.disabled === true;
/** Any peso figure at all on screen. */
const amounts = () => screen.queryAllByText(/₱/);

describe("the acknowledgement receipt at the door", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFocused = true;
    appStateListeners = [];
    jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
      appStateListeners.push(listener as (state: AppStateStatus) => void);
      return { remove: () => undefined } as ReturnType<typeof AppState.addEventListener>;
    });
    api.health.mockResolvedValue({});
    api.getOrder.mockResolvedValue(onTheWay);
    api.recordDelivery.mockResolvedValue({ ...atDoor, state: "issue_window_open" });
    api.recordArrival.mockResolvedValue(atDoor);
    api.getAcknowledgementReceipt.mockResolvedValue(receipt);
    api.prepareAcknowledgementReceipt.mockResolvedValue(receipt);
  });

  describe("before arrival", () => {
    it("offers the arrival step, shows no amounts, and asks the server for nothing", async () => {
      await render(<DeliveryProofScreen />);
      await screen.findByText("Acknowledgement receipt");

      expect(screen.getByText("HAND THIS TO THE CLIENT")).toBeTruthy();
      expect(screen.getByText(/acknowledgement receipt with the package/)).toBeTruthy();
      expect(arrive()).toBeTruthy();
      expect(amounts()).toEqual([]);
      expect(screen.queryByText(/AR-/)).toBeNull();
      expect(api.getAcknowledgementReceipt).not.toHaveBeenCalled();
      expect(api.prepareAcknowledgementReceipt).not.toHaveBeenCalled();
    });

    it("records arrival, then issues the receipt when none exists yet", async () => {
      api.getAcknowledgementReceipt.mockRejectedValue(refused(404, "acknowledgement_receipt_not_found"));
      await render(<DeliveryProofScreen />);
      await screen.findByText("Acknowledgement receipt");

      await fireEvent.press(arrive());

      await screen.findByText("AR-0000000001");
      expect(api.recordArrival).toHaveBeenCalledWith("ord_1");
      expect(api.getAcknowledgementReceipt).toHaveBeenCalledWith("ord_1");
      expect(api.prepareAcknowledgementReceipt).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("button", { name: "I'm at the client's door" })).toBeNull();
    });

    it("explains a refused arrival and shows no receipt", async () => {
      api.recordArrival.mockRejectedValue(refused(409, "delivery_milestone_not_available"));
      await render(<DeliveryProofScreen />);
      await screen.findByText("Acknowledgement receipt");

      await fireEvent.press(arrive());

      await screen.findByText("Arrival not recorded");
      expect(screen.getByText(/does not fit where this job is now/)).toBeTruthy();
      expect(api.getAcknowledgementReceipt).not.toHaveBeenCalled();
      expect(amounts()).toEqual([]);
    });
  });

  describe("at the door", () => {
    beforeEach(() => {
      api.getOrder.mockResolvedValue(atDoor);
    });

    it("lays out everything the paper form asks for, as the server issued it", async () => {
      await render(<DeliveryProofScreen />);
      await screen.findByText("AR-0000000001");

      expect(screen.getByText("ord_1")).toBeTruthy();
      expect(screen.getByText("José Muñoz")).toBeTruthy();
      expect(screen.getByText(/Oct/)).toBeTruthy();
      expect(screen.getByText("Flyers")).toBeTruthy();
      expect(screen.getByText("Posters")).toBeTruthy();
      expect(screen.getByText("3")).toBeTruthy();
      // The unit rate as recorded, and "Not recorded" — never one worked out.
      expect(screen.getAllByText("₱55.06")).toHaveLength(3);
      expect(screen.getByText("Not recorded")).toBeTruthy();
      expect(screen.getByText("₱50.00")).toBeTruthy();
      expect(screen.getByText("Rounding adjustment")).toBeTruthy();
      expect(screen.getByText("−₱0.01")).toBeTruthy();
      expect(screen.getByText("Grand total")).toBeTruthy();
      expect(screen.getAllByText("₱160.11")).toHaveLength(2);
      expect(screen.getByText("Digital payment (manual QR)")).toBeTruthy();
      expect(screen.getByText("RECORDED-REFERENCE")).toBeTruthy();
      expect(screen.getByText(receipt.note)).toBeTruthy();
      // Zero discounts have no row.
      expect(screen.queryByText(/discount/i)).toBeNull();
    });

    it("reads the issued receipt again without asking for another number", async () => {
      await render(<DeliveryProofScreen />);
      await screen.findByText("AR-0000000001");

      expect(api.getAcknowledgementReceipt).toHaveBeenCalledTimes(1);
      expect(api.prepareAcknowledgementReceipt).not.toHaveBeenCalled();
    });

    it("shows discounts when there are some, and no rounding row at zero", async () => {
      api.getAcknowledgementReceipt.mockResolvedValue({
        ...receipt,
        organizationDiscountMinor: 1000,
        voucherDiscountMinor: 500,
        roundingAdjustmentMinor: 0,
      });
      await render(<DeliveryProofScreen />);
      await screen.findByText("AR-0000000001");

      expect(screen.getByText("Organization discount")).toBeTruthy();
      expect(screen.getByText("−₱10.00")).toBeTruthy();
      expect(screen.getByText("Voucher discount")).toBeTruthy();
      expect(screen.queryByText("Rounding adjustment")).toBeNull();
    });

    it("shows recorded cash facts, and Not recorded where nothing was", async () => {
      api.getAcknowledgementReceipt.mockResolvedValue({
        ...receipt,
        payments: [
          { ...receipt.payments[0], amountMinor: 6000 },
          {
            code: "final_online",
            type: "cash",
            method: "cash",
            reference: null,
            amountMinor: 10011,
            amountReceivedMinor: 11000,
            changeMinor: null,
          },
        ],
      });
      await render(<DeliveryProofScreen />);
      await screen.findByText("AR-0000000001");

      expect(screen.getByText("PAYMENTS")).toBeTruthy();
      expect(screen.getByText("Initial payment")).toBeTruthy();
      expect(screen.getByText("Final payment")).toBeTruthy();
      expect(screen.getByText("Cash")).toBeTruthy();
      expect(screen.getByText("₱110.00")).toBeTruthy();
      expect(screen.getAllByText("Not recorded").length).toBeGreaterThanOrEqual(3);
    });

    it("never calls itself an official receipt beyond the server's own note", async () => {
      await render(<DeliveryProofScreen />);
      await screen.findByText("AR-0000000001");

      expect(screen.getAllByText(/official receipt/i)).toHaveLength(1);
    });

    it("closes, with no amounts, when the server says the window is shut", async () => {
      api.getAcknowledgementReceipt.mockRejectedValue(refused(403, "forbidden"));
      await render(<DeliveryProofScreen />);

      await screen.findByText("The receipt is closed");
      expect(amounts()).toEqual([]);
      // The job is read again to learn why (reassigned, delivered, cancelled).
      await waitFor(() => expect(api.getOrder).toHaveBeenCalledTimes(2));
      expect(api.prepareAcknowledgementReceipt).not.toHaveBeenCalled();
    });

    it("waits for a settled payment, and tries again on request", async () => {
      api.getAcknowledgementReceipt.mockRejectedValue(refused(404, "acknowledgement_receipt_not_found"));
      api.prepareAcknowledgementReceipt.mockRejectedValueOnce(refused(409, "acknowledgement_payment_pending"));
      await render(<DeliveryProofScreen />);

      await screen.findByText("Payment not settled");
      expect(amounts()).toEqual([]);

      await fireEvent.press(screen.getByRole("button", { name: "Try again" }));

      await screen.findByText("AR-0000000001");
      // The retry gets the same receipt back: the order is the key.
      expect(api.prepareAcknowledgementReceipt).toHaveBeenCalledTimes(2);
    });

    it.each(["acknowledgement_amount_mismatch", "acknowledgement_amount_unavailable"])(
      "%s sends the rider to Operations, with nothing to copy",
      async (code) => {
        api.getAcknowledgementReceipt.mockRejectedValue(refused(404, "acknowledgement_receipt_not_found"));
        api.prepareAcknowledgementReceipt.mockRejectedValue(refused(409, code));
        await render(<DeliveryProofScreen />);

        await screen.findByText("GRIDGO could not issue the receipt");
        expect(screen.getByText(/Do not write the amounts yourself/)).toBeTruthy();
        expect(amounts()).toEqual([]);
      },
    );

    it("falls back to the paper receipt on an API without the route", async () => {
      api.getAcknowledgementReceipt.mockRejectedValue(refused(404, "not_found"));
      await render(<DeliveryProofScreen />);

      await screen.findByText("Receipt details are not available yet");
      expect(api.prepareAcknowledgementReceipt).not.toHaveBeenCalled();
      await fireEvent.press(tick());
      expect(tick().props.accessibilityState).toMatchObject({ checked: true });
    });

    it.each([
      ["delivered", () => api.getOrder.mockResolvedValue({ ...atDoor, state: "issue_window_open" })],
      ["cancelled", () => api.getOrder.mockResolvedValue({ ...atDoor, state: "cancelled" })],
      ["given to another rider", () => api.getOrder.mockRejectedValue(refused(403, "forbidden"))],
    ])("drops the receipt the moment a refresh shows the job %s", async (_label, change) => {
      await render(<DeliveryProofScreen />);
      await screen.findByText("AR-0000000001");
      expect(amounts().length).toBeGreaterThan(0);

      change();
      await act(async () => {
        mockLiveRefresh?.();
      });

      await waitFor(() => expect(screen.queryByText("AR-0000000001")).toBeNull());
      expect(amounts()).toEqual([]);
      expect(api.getAcknowledgementReceipt).toHaveBeenCalledTimes(1);
    });
  });

  describe("the tick", () => {
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
      api.getOrder.mockResolvedValue(atDoor);
      await render(<DeliveryProofScreen />);
      await screen.findByText("AR-0000000001");

      // Unticked, and still the button is live.
      expect(confirm().props.accessibilityState).not.toMatchObject({ disabled: true });

      await fireEvent.press(tick());
      await fireEvent.press(confirm());

      await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
      expect(api.recordDelivery).toHaveBeenCalledTimes(1);
      expect(api.recordDelivery).toHaveBeenCalledWith("ord_1", {
        evidenceFileId: "fil_door",
        evidenceType: "photo",
        handoffReminderVersion: 1,
        remindedClient: true,
        clientAgreedToPhoto: false,
      });
    });

    it("explains a delivery the server refused because the receipt could not be issued", async () => {
      api.getOrder.mockResolvedValue(atDoor);
      api.recordDelivery.mockRejectedValue(refused(409, "acknowledgement_amount_mismatch"));
      await render(<DeliveryProofScreen />);
      await screen.findByText("AR-0000000001");

      await fireEvent.press(confirm());

      await screen.findByText("Delivery not recorded");
      expect(screen.getByText(/amounts do not add up/)).toBeTruthy();
      expect(mockRouter.back).not.toHaveBeenCalled();
    });
  });

  describe("the receipt comes before the handover", () => {
    it("holds the delivery until arrival is recorded, and says why", async () => {
      await render(<DeliveryProofScreen />);
      await screen.findByText("Acknowledgement receipt");

      expect(held()).toBe(true);
      expect(screen.getByText(/Tap “I'm at the client's door” and copy/)).toBeTruthy();
      await fireEvent.press(confirm());
      expect(api.recordDelivery).not.toHaveBeenCalled();
    });

    it("prepares the receipt, then delivers", async () => {
      api.getAcknowledgementReceipt.mockRejectedValue(refused(404, "acknowledgement_receipt_not_found"));
      await render(<DeliveryProofScreen />);
      await screen.findByText("Acknowledgement receipt");

      await fireEvent.press(arrive());
      await screen.findByText("AR-0000000001");
      expect(held()).toBe(false);

      await fireEvent.press(confirm());

      await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
      expect(api.recordDelivery).toHaveBeenCalledTimes(1);
      expect(api.prepareAcknowledgementReceipt.mock.invocationCallOrder[0]).toBeLessThan(
        api.recordDelivery.mock.invocationCallOrder[0],
      );
    });

    it("holds the delivery while the receipt is still loading", async () => {
      api.getOrder.mockResolvedValue(atDoor);
      api.getAcknowledgementReceipt.mockReturnValue(new Promise(() => undefined));
      await render(<DeliveryProofScreen />);
      await screen.findByLabelText("Loading the receipt");

      expect(held()).toBe(true);
      expect(screen.getByText(/Loading the acknowledgement receipt/)).toBeTruthy();
      await fireEvent.press(confirm());
      expect(api.recordDelivery).not.toHaveBeenCalled();
    });

    it("holds the delivery when the receipt fails to load, until a retry brings it", async () => {
      api.getOrder.mockResolvedValue(atDoor);
      api.getAcknowledgementReceipt.mockRejectedValueOnce(refused(500, "internal"));
      await render(<DeliveryProofScreen />);
      await screen.findByText("The receipt did not load");

      expect(held()).toBe(true);
      await fireEvent.press(confirm());
      expect(api.recordDelivery).not.toHaveBeenCalled();

      await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
      await screen.findByText("AR-0000000001");
      expect(held()).toBe(false);
    });

    it("delivers on an API without the receipt route", async () => {
      api.getOrder.mockResolvedValue(atDoor);
      api.getAcknowledgementReceipt.mockRejectedValue(refused(404, "not_found"));
      await render(<DeliveryProofScreen />);
      await screen.findByText("Receipt details are not available yet");

      expect(held()).toBe(false);
      await fireEvent.press(confirm());
      await waitFor(() => expect(api.recordDelivery).toHaveBeenCalledTimes(1));
    });

    it("delivers on an API older than arrival tracking, with the paper reminder only", async () => {
      api.getOrder.mockResolvedValue({ ...onTheWay, deliveryMilestones: undefined });
      await render(<DeliveryProofScreen />);
      await screen.findByText("Acknowledgement receipt");

      expect(screen.queryByRole("button", { name: "I'm at the client's door" })).toBeNull();
      expect(tick()).toBeTruthy();
      expect(held()).toBe(false);
      await fireEvent.press(confirm());
      await waitFor(() => expect(api.recordDelivery).toHaveBeenCalledTimes(1));
      expect(api.getAcknowledgementReceipt).not.toHaveBeenCalled();
    });
  });

  describe("the receipt lives only while the handover is on screen", () => {
    beforeEach(() => {
      api.getOrder.mockResolvedValue(atDoor);
    });

    it("drops the receipt the moment the app goes to the background", async () => {
      await render(<DeliveryProofScreen />);
      await screen.findByText("AR-0000000001");

      await appGoes("background");

      expect(screen.queryByText("AR-0000000001")).toBeNull();
      expect(amounts()).toEqual([]);
    });

    it("keeps it hidden on return until the job has been read again", async () => {
      await render(<DeliveryProofScreen />);
      await screen.findByText("AR-0000000001");
      await appGoes("background");

      const fresh = deferred<Order>();
      api.getOrder.mockReturnValueOnce(fresh.promise);
      await appGoes("active");

      expect(screen.getByLabelText("Checking this job before the receipt opens again")).toBeTruthy();
      expect(screen.queryByText("AR-0000000001")).toBeNull();
      expect(held()).toBe(true);

      await act(async () => fresh.resolve(atDoor));

      await screen.findByText("AR-0000000001");
      expect(api.getAcknowledgementReceipt).toHaveBeenCalledTimes(2);
    });

    it("stays hidden when the job cannot be read again, and offers to try", async () => {
      await render(<DeliveryProofScreen />);
      await screen.findByText("AR-0000000001");
      await appGoes("background");

      api.getOrder.mockRejectedValueOnce(new TypeError("Network request failed"));
      await appGoes("active");

      await screen.findByText("The receipt is hidden");
      expect(screen.queryByText("AR-0000000001")).toBeNull();
      expect(amounts()).toEqual([]);
      expect(held()).toBe(true);

      await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
      await screen.findByText("AR-0000000001");
    });

    it("does not come back when the job moved on while the app was away", async () => {
      await render(<DeliveryProofScreen />);
      await screen.findByText("AR-0000000001");
      await appGoes("background");

      api.getOrder.mockResolvedValue({ ...atDoor, state: "cancelled" });
      await appGoes("active");

      await waitFor(() => expect(api.getOrder).toHaveBeenCalledTimes(2));
      expect(screen.queryByText("AR-0000000001")).toBeNull();
      expect(amounts()).toEqual([]);
      expect(api.getAcknowledgementReceipt).toHaveBeenCalledTimes(1);
    });

    it("ignores a receipt that arrives after the app went away", async () => {
      const late = deferred<AcknowledgementReceipt>();
      api.getAcknowledgementReceipt.mockReturnValueOnce(late.promise);
      await render(<DeliveryProofScreen />);
      await screen.findByLabelText("Loading the receipt");

      await appGoes("background");
      await act(async () => late.resolve(receipt));
      expect(screen.queryByText("AR-0000000001")).toBeNull();

      const fresh = deferred<Order>();
      api.getOrder.mockReturnValueOnce(fresh.promise);
      await appGoes("active");
      expect(screen.queryByText("AR-0000000001")).toBeNull();
      expect(amounts()).toEqual([]);
    });

    it("ignores an arrival answered after the app went away, and checks the job instead", async () => {
      api.getOrder.mockResolvedValue(onTheWay);
      const recorded = deferred<Order>();
      api.recordArrival.mockReturnValueOnce(recorded.promise);
      await render(<DeliveryProofScreen />);
      await screen.findByText("Acknowledgement receipt");

      await fireEvent.press(arrive());
      await appGoes("background");
      await act(async () => recorded.resolve(atDoor));
      expect(api.getAcknowledgementReceipt).not.toHaveBeenCalled();

      api.getOrder.mockResolvedValue(atDoor);
      await appGoes("active");

      await screen.findByText("AR-0000000001");
      expect(api.getOrder).toHaveBeenCalledTimes(2);
    });

    it("drops the receipt when another screen covers it, and checks again on return", async () => {
      await render(<DeliveryProofScreen />);
      await screen.findByText("AR-0000000001");

      await setFocus(false);
      expect(screen.queryByText("AR-0000000001")).toBeNull();
      expect(amounts()).toEqual([]);

      await setFocus(true);
      await screen.findByText("AR-0000000001");
      expect(api.getOrder).toHaveBeenCalledTimes(2);
    });

    it("drops the receipt as soon as the delivery is recorded, before the screen goes", async () => {
      await render(<DeliveryProofScreen />);
      await screen.findByText("AR-0000000001");

      await fireEvent.press(confirm());

      await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
      expect(screen.queryByText("AR-0000000001")).toBeNull();
      expect(amounts()).toEqual([]);
    });
  });

  it("is not asked for at GRIDGO's own counter, where there is no client", async () => {
    api.getOrder.mockResolvedValue({ ...atDoor, fulfillmentMode: "pickup", deliveryMilestones: undefined });
    await render(<DeliveryProofScreen />);
    const dropOff = await screen.findByRole("button", { name: /confirm drop-off/i });

    expect(screen.queryByText("Acknowledgement receipt")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(api.getAcknowledgementReceipt).not.toHaveBeenCalled();
    expect(amounts()).toEqual([]);

    await fireEvent.press(dropOff);
    await waitFor(() => expect(api.recordDelivery).toHaveBeenCalledTimes(1));
    expect(api.recordArrival).not.toHaveBeenCalled();
  });
});
