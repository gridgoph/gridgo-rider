import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import type { Order } from "@/lib/api";
import { ApiError } from "@/lib/api";
import { useActiveTrip } from "@/store/activeTrip";
import { useNotifications } from "@/store/notifications";
import { usePush } from "@/store/push";
import { useSession } from "@/store/session";

jest.mock("expo-router", () => ({
  router: { replace: jest.fn(), push: jest.fn() },
  useRouter: () => jest.requireMock("expo-router").router,
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = require("react");
    useEffect(callback, [callback]);
  },
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  listOffers: jest.fn(),
  listOrders: jest.fn(),
  acceptOffer: jest.fn(),
}));

jest.mock("@/components/TripMap", () => ({
  TripMap: () => null,
}));

jest.mock("@/components/PushEnableCard", () => ({
  PushEnableCard: () => null,
}));

import OffersScreen from "@/app/(tabs)/offers";

const api = jest.requireMock("@/lib/api") as {
  listOffers: jest.Mock;
  listOrders: jest.Mock;
  acceptOffer: jest.Mock;
};

const rider = {
  id: "user_rider",
  email: "carlo@gridgo.ph",
  name: "Carlo Rider",
  role: "rider" as const,
  verificationStatus: "approved" as const,
};

function order(partial: Partial<Order> & Pick<Order, "id" | "state">): Order {
  return {
    clientId: "user_client",
    supplierId: "user_supplier",
    riderId: null,
    productId: "prod_flyer",
    title: "Test",
    quantity: 1,
    size: "A5",
    material: "matte",
    deadline: null,
    address: "Matina Crossing, Davao City",
    zone: "davao_south",
    subtotalMinor: 77000,
    deliveryFeeMinor: 5000,
    deliveryDistanceMeters: null,
    totalMinor: 82000,
    downpaymentMinor: 61500,
    balanceMinor: 20500,
    paymentMethod: "qr_manual",
    paymentStatus: "authorized",
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    timeline: [],
    ...partial,
  };
}

const offer = order({
  id: "ord_tarpaulin",
  state: "ready_for_dispatch",
  title: "Storefront tarpaulin",
});

const otherOffer = order({
  id: "ord_other",
  state: "ready_for_dispatch",
  title: "Event banner",
  updatedAt: "2026-07-01T00:00:00.000Z",
});

const activeJob = order({
  id: "ord_active",
  state: "rider_assigned",
  riderId: rider.id,
  title: "Job already in hand",
});

describe("Offers accept button", () => {
  let view: Awaited<ReturnType<typeof render>> | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    useSession.setState({
      user: rider,
      loading: false,
      error: null,
      authSource: "clerk",
    });
    useActiveTrip.setState({
      order: null,
      loaded: true,
      loading: false,
      error: null,
    });
    useNotifications.setState({ unread: 0, readIds: [], hydrated: true });
    usePush.setState({
      supported: false,
      permission: "unknown",
      token: null,
      busy: false,
      error: null,
    });
    api.listOffers.mockResolvedValue([offer]);
    api.listOrders.mockResolvedValue([]);
    api.acceptOffer.mockResolvedValue(activeJob);
  });

  afterEach(async () => {
    await view?.unmount();
  });

  it("removes a competing rider's accepted offer while Offers stays open", async () => {
    const { invalidate } = require("@/lib/live");
    view = await render(<OffersScreen />);
    await screen.findByText("Storefront tarpaulin");
    api.listOffers.mockResolvedValue([]);
    await act(async () => { invalidate("dispatch"); });
    await waitFor(() => expect(screen.queryByText("Storefront tarpaulin")).toBeNull());
  });

  it("does not stay on Accepting when the rider already has a job", async () => {
    useActiveTrip.setState({ order: activeJob, loaded: true });
    api.listOrders.mockResolvedValue([activeJob]);

    view = await render(<OffersScreen />);

    expect(await screen.findByText("You already have a job in hand")).toBeTruthy();
    expect(await screen.findByText("Storefront tarpaulin")).toBeTruthy();

    const accept = await screen.findByRole("button", { name: "Accept this job" });
    expect(accept).toBeTruthy();
    expect(accept.props.accessibilityState?.disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Accepting…" })).toBeNull();

    await act(async () => {
      fireEvent.press(accept);
    });

    expect(api.acceptOffer).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Accepting…" })).toBeNull();
    expect(screen.getByRole("button", { name: "Accept this job" })).toBeTruthy();
  });

  it("leaves Accepting after a refused accept, even once the trip in hand is known", async () => {
    view = await render(<OffersScreen />);
    await screen.findByText("Storefront tarpaulin");

    api.acceptOffer.mockRejectedValue(new ApiError(409, { error: "not_offerable" }));
    api.listOrders.mockResolvedValue([activeJob]);

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Accept this job" }));
    });

    await waitFor(() => {
      expect(screen.getByText("You already have a job in hand")).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: "Accept this job" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Accepting…" })).toBeNull();
  });

  it("does not leave a second card on Accepting while one accept is in flight", async () => {
    let finishFirst: (value: Order) => void = () => undefined;
    api.listOffers.mockResolvedValue([offer, otherOffer]);
    api.acceptOffer.mockImplementation(
      () =>
        new Promise<Order>((resolve) => {
          finishFirst = resolve;
        }),
    );

    view = await render(<OffersScreen />);
    await screen.findByText("Storefront tarpaulin");

    const buttons = screen.getAllByRole("button", { name: "Accept this job" });
    expect(buttons).toHaveLength(2);

    await act(async () => {
      fireEvent.press(buttons[0]);
    });

    expect(await screen.findByRole("button", { name: "Accepting…" })).toBeTruthy();
    const waiting = screen.getByRole("button", { name: "Accept this job" });
    expect(waiting.props.accessibilityState?.disabled).toBe(true);

    await act(async () => {
      fireEvent.press(waiting);
    });
    expect(api.acceptOffer).toHaveBeenCalledTimes(1);

    await act(async () => {
      finishFirst(activeJob);
    });
  });
});
