import { act, fireEvent, render, screen } from "@testing-library/react-native";

import type { Order } from "@/lib/api";
import { useSession } from "@/store/session";

import EarningsScreen from "@/app/(tabs)/earnings";
import { invalidate } from "@/lib/live";
import PastJobsScreen from "@/app/past-jobs";

jest.mock("expo-router", () => ({
  router: { replace: jest.fn(), push: jest.fn() },
  useRouter: () => jest.requireMock("expo-router").router,
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual<typeof import("react")>("react");
    useEffect(callback, [callback]);
  },
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  listOrders: jest.fn(),
}));

const api = jest.requireMock("@/lib/api") as { listOrders: jest.Mock };

const rider = {
  id: "user_rider",
  email: "carlo@gridgo.ph",
  name: "Carlo Rider",
  role: "rider" as const,
  verificationStatus: "approved" as const,
};

function order(patch: Partial<Order> & Pick<Order, "id" | "state">): Order {
  return {
    clientId: "user_client",
    supplierId: "user_supplier",
    riderId: "user_rider",
    productId: "prod",
    title: "Flyers x500",
    quantity: 5,
    size: "A5",
    material: "matte",
    deadline: null,
    address: "Matina Crossing, Davao City",
    zone: "davao_south",
    subtotalMinor: 50_000,
    totalMinor: 60_000,
    downpaymentMinor: 45_000,
    balanceMinor: 15_000,
    deliveryFeeMinor: 10_000,
    paymentMethod: "qr_manual",
    paymentStatus: "paid",
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-08-10T01:00:00+08:00",
    updatedAt: "2026-08-10T10:00:00+08:00",
    timeline: [
      { at: "2026-08-10T09:00:00+08:00", state: "rider_assigned", by: "user_rider", note: "Rider accepted" },
      { at: "2026-08-10T11:00:00+08:00", state: "delivered", by: "user_rider", note: "" },
    ],
    pickup: { lat: 7.06, lng: 125.6, label: "PrintRight Davao" },
    dropoff: { lat: 7.07, lng: 125.61, label: "Matina Crossing" },
    ...patch,
  };
}

describe("Past jobs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSession.setState({ user: rider });
    api.listOrders.mockResolvedValue([
      order({ id: "ord_done", state: "completed", title: "Flyers x500" }),
      order({ id: "ord_live", state: "out_for_delivery", title: "Still out" }),
    ]);
  });

  it("shows a completed job and opens its trail", async () => {
    await render(<PastJobsScreen />);

    expect(await screen.findByText("Flyers x500")).toBeTruthy();
    expect(screen.getByText("Closed")).toBeTruthy();
    expect(screen.queryByText("Still out")).toBeNull();

    await fireEvent.press(screen.getByText("Flyers x500"));
    expect(jest.requireMock("expo-router").router.push).toHaveBeenCalledWith({
      pathname: "/past-job",
      params: { orderId: "ord_done" },
    });
  });

  it("invites a new rider to take a job when the ledger is empty", async () => {
    api.listOrders.mockResolvedValue([]);
    await render(<PastJobsScreen />);

    expect(await screen.findByText("No past jobs yet")).toBeTruthy();
    await fireEvent.press(screen.getByText("See offers"));
    expect(jest.requireMock("expo-router").router.replace).toHaveBeenCalledWith("/(tabs)/offers");
  });
});

it.each([PastJobsScreen, EarningsScreen])("keeps the newest delivery when an earlier read finishes last (%p)", async (Screen) => {
  jest.useFakeTimers();
  useSession.setState({ user: rider });
  let finish!: (orders: Order[]) => void;
  api.listOrders.mockReturnValueOnce(new Promise<Order[]>((resolve) => { finish = resolve; }))
    .mockResolvedValue([order({ id: "done", state: "completed", title: "Newest delivery" })]);
  try {
    await render(<Screen />);
    await act(async () => { invalidate("orders"); await jest.advanceTimersByTimeAsync(100); });
    expect(screen.getByText("Newest delivery")).toBeTruthy();
    await act(async () => { finish([]); });
    expect(screen.getByText("Newest delivery")).toBeTruthy();
  } finally { jest.useRealTimers(); }
});
