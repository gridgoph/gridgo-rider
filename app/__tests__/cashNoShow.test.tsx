import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import type { Order, OrderCashDetail } from "@/lib/api";
import { useCashNoShow } from "@/store/cashNoShow";
import { useSession } from "@/store/session";

import CashNoShowScreen from "@/app/trip/no-show";

const mockRouter = { back: jest.fn(), replace: jest.fn(), push: jest.fn(), dismissTo: jest.fn() };
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ orderId: "ord_1" }),
  useRouter: () => mockRouter,
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual<typeof import("react")>("react");
    useEffect(callback, [callback]);
  },
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getOrder: jest.fn(),
  getOrderCash: jest.fn(),
  startCashNoShow: jest.fn(),
  reportCashNoShow: jest.fn(),
}));

/** The live invalidation `useTripOrder` listens to, fired by hand. */
let mockLiveRefresh: (() => void) | null = null;
jest.mock("@/hooks/useLiveRefresh", () => ({
  useLiveRefresh: (_topics: string[], onRefresh: () => void) => {
    mockLiveRefresh = onRefresh;
  },
}));

// Native pieces this screen only needs to exist.
jest.mock("@/components/ContactBar", () => ({ ContactBar: () => null }));
jest.mock("@/components/CashPhotoField", () => ({ CashPhotoField: () => null }));
jest.mock("@/hooks/useCashPhoto", () => ({
  useCashPhoto: () => ({ phase: "stored", fileId: "fil_wait", uri: null, error: null, take: jest.fn(), retry: jest.fn(), forget: jest.fn() }),
}));

const api = jest.requireMock("@/lib/api") as {
  getOrder: jest.Mock;
  getOrderCash: jest.Mock;
  startCashNoShow: jest.Mock;
  reportCashNoShow: jest.Mock;
};

const order = (version: number) =>
  ({
    id: "ord_1",
    riderId: "user_rider",
    clientId: "user_client",
    supplierId: "user_supplier",
    state: "out_for_delivery",
    title: "Flyers x100",
    cash: { method: "cash", version, status: "due", noShowWaitSeconds: 60 },
    cashAmounts: { shopMinor: 1_000, collectMinor: 10_350, gridgoMinor: 2_230, riderMinor: 7_120 },
    timeline: [],
  }) as unknown as Order;

const record = (version: number, patch: Partial<OrderCashDetail> = {}): OrderCashDetail => ({
  version,
  status: "due",
  amountDueMinor: 10_350,
  shopPaidAt: "2026-11-18T00:20:00.000Z",
  collectedAt: null,
  noShowApprovedAt: null,
  repaymentConfirmedAt: null,
  ...patch,
});

const STARTED = "2026-11-18T01:01:00.000Z";
const REPORTED = "2026-11-18T01:12:00.000Z";
let server: { order: Order; cash: OrderCashDetail };

beforeEach(() => {
  jest.clearAllMocks();
  useSession.setState({
    user: { id: "user_rider", email: "rider@example.test", name: "Rider", role: "rider", verificationStatus: "approved" },
  } as never);
  // This phone reported the no-show; the server accepted it.
  useCashNoShow.setState({
    byOrder: { ord_1: { startedAtMs: Date.parse(STARTED), contactMethod: "call", reportedAtMs: Date.parse(REPORTED) } },
    hydrated: true,
    serverVersion: {},
  });
  server = { order: order(5), cash: record(5, { noShowStartedAt: STARTED, noShowReportedAt: REPORTED }) };
  api.getOrder.mockImplementation(async () => server.order);
  api.getOrderCash.mockImplementation(async () => server.cash);
});

/*
  Cash review P1-2: Operations can reject a no-show report. The server then
  clears the report and the wait; the rider must be able to wait again (or
  collect), not sit on a "reported" screen the phone remembers.
*/
describe("a no-show report through rejection", () => {
  it("shows the report while the server holds it", async () => {
    await render(<CashNoShowScreen />);
    expect(await screen.findByText("No-show reported")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Start the/ })).toBeNull();
  });

  it("after the rejection, offers the wait again and starts it on the server's current version", async () => {
    await render(<CashNoShowScreen />);
    await screen.findByText("No-show reported");

    server = { order: order(6), cash: record(6, { noShowStartedAt: null, noShowReportedAt: null }) };
    await act(async () => {
      mockLiveRefresh?.();
    });

    const start = await screen.findByRole("button", { name: "Start the 1 minute wait" });
    expect(screen.queryByText("No-show reported")).toBeNull();
    expect(useCashNoShow.getState().byOrder.ord_1).toBeUndefined();

    api.startCashNoShow.mockImplementationOnce(async () => {
      server = { order: order(7), cash: record(7, { noShowStartedAt: new Date().toISOString(), noShowReportedAt: null }) };
      return { cash: { version: 7, status: "due" } };
    });
    await fireEvent.press(start);
    await waitFor(() => expect(api.startCashNoShow).toHaveBeenCalledTimes(1));
    expect(api.startCashNoShow.mock.calls[0][1]).toEqual({ expectedVersion: 6, contactMethod: "call" });
    expect(await screen.findByTestId("no-show-timer")).toBeTruthy();
  });

  it("after the client paid, the phone forgets the no-show", async () => {
    server = { order: order(7), cash: record(7, { collectedAt: "2026-11-18T01:30:00.000Z" }) };
    await render(<CashNoShowScreen />);
    await waitFor(() => expect(useCashNoShow.getState().byOrder.ord_1).toBeUndefined());
    expect(screen.queryByText("No-show reported")).toBeNull();
  });
});
