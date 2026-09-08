import { render, screen } from "@testing-library/react-native";

import type { Order } from "@/lib/api";
import { useSession } from "@/store/session";

jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void) => { require("react").useEffect(callback, [callback]); },
  useLocalSearchParams: () => ({ orderId: "ord_done" }),
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getOrder: jest.fn(),
}));

import PastJobScreen from "@/app/past-job";

const api = jest.requireMock("@/lib/api") as { getOrder: jest.Mock };

const rider = {
  id: "user_rider",
  email: "carlo@gridgo.ph",
  name: "Carlo Rider",
  role: "rider" as const,
};

const completed: Order = {
  id: "ord_done",
  clientId: "user_client",
  supplierId: "user_supplier",
  riderId: "user_rider",
  state: "completed",
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
  createdAt: "2026-08-31T15:00:00.000Z",
  updatedAt: "2026-09-01T01:00:00.000Z",
  pickup: { lat: 7.06, lng: 125.6, label: "PrintRight Davao" },
  dropoff: { lat: 7.07, lng: 125.61, label: "Matina Crossing" },
  timeline: [
    {
      at: "2026-08-31T15:24:00.000Z",
      state: "submitted",
      by: "user_client",
      note: "Placed; payment sent for confirmation",
    },
    {
      at: "2026-08-31T16:05:00.000Z",
      state: "rider_assigned",
      by: "user_rider",
      note: "Rider accepted",
    },
    {
      at: "2026-09-01T00:40:00.000Z",
      state: "delivered",
      by: "user_rider",
      note: "",
    },
  ],
};

describe("a past job", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSession.setState({ user: rider });
    api.getOrder.mockResolvedValue(completed);
  });

  it("shows the completed job and puts the latest HISTORY row first", async () => {
    await render(<PastJobScreen />);

    expect(await screen.findByText("Flyers x500")).toBeTruthy();
    expect(screen.getByText("Delivery complete")).toBeTruthy();
    expect(screen.getByText("HISTORY")).toBeTruthy();

    expect(screen.getByLabelText("Delivered, current status")).toBeTruthy();
    expect(screen.getByText("Head to pickup")).toBeTruthy();
    expect(screen.getByText("Rider accepted")).toBeTruthy();
    expect(screen.getByText("PrintRight Davao")).toBeTruthy();
    expect(screen.getByText("Matina Crossing")).toBeTruthy();
  });
});
