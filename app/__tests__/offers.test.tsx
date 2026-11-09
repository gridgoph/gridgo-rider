import { invalidate } from "@/lib/live";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import type { Order } from "@/lib/api";
import { ApiError } from "@/lib/api";
import { useActiveTrip } from "@/store/activeTrip";
import { useNotifications } from "@/store/notifications";
import { usePush } from "@/store/push";
import { useSession } from "@/store/session";

import OffersScreen from "@/app/(tabs)/offers";

let mockOrderId: string | undefined;
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ orderId: mockOrderId }),
  router: { replace: jest.fn(), push: jest.fn(), setParams: jest.fn(), prefetch: jest.fn() },
  useRouter: () => jest.requireMock("expo-router").router,
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual<typeof import("react")>("react");
    useEffect(callback, [callback]);
  },
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  listOffers: jest.fn(),
  listOrders: jest.fn(),
  acceptOffer: jest.fn(),
  getOperatingStatus: jest.fn(),
}));

jest.mock("@/components/TripMap", () => ({
  TripMap: () => null,
}));

jest.mock("@/components/PushEnableCard", () => ({
  PushEnableCard: () => null,
}));

const api = jest.requireMock("@/lib/api") as {
  listOffers: jest.Mock;
  listOrders: jest.Mock;
  acceptOffer: jest.Mock;
  getOperatingStatus: jest.Mock;
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
    mockOrderId = undefined;
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
    api.getOperatingStatus.mockResolvedValue({ isOpenNow: true, scheduledReviewAt: "2026-11-04T02:00:00.000Z" });
  });

  afterEach(async () => {
    await view?.unmount();
  });

  it("holds the shared restart lock while an offer acceptance is in flight", async () => {
    let resolveAccept!: (order: Order) => void;
    api.acceptOffer.mockReturnValue(new Promise<Order>((resolve) => {
      resolveAccept = resolve;
    }));
    view = await render(<OffersScreen />);
    await screen.findByText("Storefront tarpaulin");
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Accept this job" }));
    });
    const lockedWhilePending = useActiveTrip.getState().acceptingOffer;
    await act(async () => resolveAccept(activeJob));
    expect(lockedWhilePending).toBe(true);
    expect(useActiveTrip.getState().acceptingOffer).toBe(false);
  });

  it("removes a competing rider's accepted offer while Offers stays open", async () => {
    view = await render(<OffersScreen />);
    await screen.findByText("Storefront tarpaulin");
    api.listOffers.mockResolvedValue([]);
    await act(async () => { invalidate("dispatch"); });
    await waitFor(() => expect(screen.queryByText("Storefront tarpaulin")).toBeNull());
  });

  it("removes a paused offer and keeps the explanation after refreshing", async () => {
    view = await render(<OffersScreen />);
    await screen.findByText("Storefront tarpaulin");
    api.acceptOffer.mockRejectedValue(new ApiError(409, { error: "dispatch_paused" }));
    api.listOffers.mockResolvedValue([]);
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Accept this job" }));
    });
    await waitFor(() => expect(screen.queryByText("Storefront tarpaulin")).toBeNull());
    expect(screen.getByText(/This job is paused/)).toBeTruthy();
    expect(screen.getByText("Could not accept this job")).toBeTruthy();
    expect(screen.queryByText("Offers did not load")).toBeNull();
    expect(screen.queryByRole("button", { name: "Accepting…" })).toBeNull();
  });

  it("keeps the offers-load heading when loading fails", async () => {
    api.listOffers.mockRejectedValue(new Error("offline"));
    view = await render(<OffersScreen />);
    expect(await screen.findByText("Offers did not load")).toBeTruthy();
    expect(screen.getByText("Offers did not load. Check the phone's connection and pull down to try again.")).toBeTruthy();
    expect(screen.queryByText("Could not accept this job")).toBeNull();
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

  it("confirms the accept on its card before opening Active", async () => {
    const router = jest.requireMock("expo-router").router as { push: jest.Mock };
    view = await render(<OffersScreen />);
    await screen.findByText("Storefront tarpaulin");

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Accept this job" }));
    });

    expect(api.acceptOffer).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Job accepted. Opening your trip…")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Accept this job" })).toBeNull();
    // The beat is the card's: the "job in hand" notice does not cut in.
    expect(screen.queryByText("You already have a job in hand")).toBeNull();
    expect(router.push).not.toHaveBeenCalled();

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/(tabs)/active"), { timeout: 2000 });
    expect(api.acceptOffer).toHaveBeenCalledTimes(1);
  });

  it("says a dropped connection plainly on the card it happened on", async () => {
    view = await render(<OffersScreen />);
    await screen.findByText("Storefront tarpaulin");
    api.acceptOffer.mockRejectedValue(new TypeError("Network request failed"));

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Accept this job" }));
    });

    expect(await screen.findByText("Check this phone’s connection, then try again.")).toBeTruthy();
    expect(screen.queryByText(/Network request failed/)).toBeNull();
    expect(screen.queryByText("Could not accept this job")).toBeNull();
    const accept = screen.getByRole("button", { name: "Accept this job" });
    expect(accept.props.accessibilityState?.disabled).toBe(false);
  });

  it("says one plain line when the phone is fully offline, then accepts on retry", async () => {
    const router = jest.requireMock("expo-router").router as { push: jest.Mock };
    view = await render(<OffersScreen />);
    await screen.findByText("Storefront tarpaulin");
    const offline = new TypeError("Network request failed");
    api.acceptOffer.mockRejectedValueOnce(offline);
    api.listOffers.mockRejectedValueOnce(offline);
    api.listOrders.mockRejectedValueOnce(offline);

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Accept this job" }));
    });

    expect(await screen.findByText("Check this phone’s connection, then try again.")).toBeTruthy();
    expect(screen.queryByText(/Network request failed/)).toBeNull();
    expect(screen.queryByText("Offers did not load")).toBeNull();
    expect(screen.queryByText("Could not accept this job")).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Accept this job" }));
    });

    expect(screen.getByText("Job accepted. Opening your trip…")).toBeTruthy();
    expect(screen.queryByText("Check this phone’s connection, then try again.")).toBeNull();
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/(tabs)/active"), { timeout: 2000 });
    expect(api.acceptOffer).toHaveBeenCalledTimes(2);
  });

  it("keeps the confirmation when a pool read already in flight answers", async () => {
    view = await render(<OffersScreen />);
    await screen.findByText("Storefront tarpaulin");
    let finishRefresh: (value: Order[]) => void = () => undefined;
    api.listOffers.mockImplementationOnce(
      () =>
        new Promise<Order[]>((resolve) => {
          finishRefresh = resolve;
        }),
    );
    await act(async () => { invalidate("dispatch"); });
    await waitFor(() => expect(api.listOffers).toHaveBeenCalledTimes(2));

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Accept this job" }));
    });
    expect(screen.getByText("Job accepted. Opening your trip…")).toBeTruthy();

    await act(async () => { finishRefresh([]); });
    expect(screen.getByText("Job accepted. Opening your trip…")).toBeTruthy();
  });

  it("still shows a standalone refresh failure", async () => {
    view = await render(<OffersScreen />);
    await screen.findByText("Storefront tarpaulin");
    api.listOffers.mockRejectedValueOnce(new Error("offline"));

    await act(async () => { invalidate("dispatch"); });

    expect(await screen.findByText("Offers did not load")).toBeTruthy();
  });

  it("says a taken job on its card while the card is still listed", async () => {
    view = await render(<OffersScreen />);
    await screen.findByText("Storefront tarpaulin");
    api.acceptOffer.mockRejectedValue(new ApiError(409, { error: "not_offerable" }));

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Accept this job" }));
    });

    expect(await screen.findByText(/This job is no longer available/)).toBeTruthy();
    expect(screen.queryByText("Could not accept this job")).toBeNull();
  });

  describe("outside operating hours", () => {
    const CLOSED = { isOpenNow: false, scheduledReviewAt: "2026-11-05T00:00:00.000Z" };
    const OPENS = /^Opens 8:00 AM (today|tomorrow|[A-Z])/;

    beforeEach(() => {
      api.getOperatingStatus.mockResolvedValue(CLOSED);
      api.listOffers.mockResolvedValue([]);
    });

    it("reads as closed, not as no jobs, when the list is empty", async () => {
      view = await render(<OffersScreen />);
      expect(await screen.findByText("Dispatch is closed")).toBeTruthy();
      expect(screen.getByText(OPENS)).toBeTruthy();
      expect(screen.queryByText("No open offers")).toBeNull();
    });

    it("shows nothing new while open", async () => {
      api.getOperatingStatus.mockResolvedValue({ isOpenNow: true, scheduledReviewAt: CLOSED.scheduledReviewAt });
      view = await render(<OffersScreen />);
      expect(await screen.findByText("No open offers")).toBeTruthy();
      expect(screen.queryByText("Dispatch is closed")).toBeNull();
      expect(screen.queryByText(OPENS)).toBeNull();
    });

    it("clears on the next read once dispatch opens, and the list comes back", async () => {
      view = await render(<OffersScreen />);
      await screen.findByText("Dispatch is closed");
      api.getOperatingStatus.mockResolvedValue({ isOpenNow: true, scheduledReviewAt: CLOSED.scheduledReviewAt });
      api.listOffers.mockResolvedValue([offer]);
      await act(async () => { invalidate("dispatch"); });
      expect(await screen.findByText("Storefront tarpaulin")).toBeTruthy();
      expect(screen.queryByText("Dispatch is closed")).toBeNull();
    });

    it("makes no claim from an API that does not say", async () => {
      api.getOperatingStatus.mockResolvedValue(null);
      view = await render(<OffersScreen />);
      expect(await screen.findByText("No open offers")).toBeTruthy();
      expect(screen.queryByText("Dispatch is closed")).toBeNull();
    });

    it("keeps the list and the same offers when the hours cannot be read", async () => {
      api.getOperatingStatus.mockRejectedValue(new Error("offline"));
      api.listOffers.mockResolvedValue([offer]);
      view = await render(<OffersScreen />);
      expect(await screen.findByText("Storefront tarpaulin")).toBeTruthy();
      expect(screen.queryByText("Dispatch is closed")).toBeNull();
      expect(screen.queryByText("Offers did not load")).toBeNull();
    });

    it("sits above an offer still listed, without touching it", async () => {
      api.listOffers.mockResolvedValue([offer]);
      view = await render(<OffersScreen />);
      expect(await screen.findByText("Dispatch is closed")).toBeTruthy();
      const accept = await screen.findByRole("button", { name: "Accept this job" });
      expect(accept.props.accessibilityState?.disabled).toBe(false);
    });

    it("does not promise the next offer straight away with a job in hand", async () => {
      useActiveTrip.setState({ order: activeJob, loaded: true });
      api.listOrders.mockResolvedValue([activeJob]);
      view = await render(<OffersScreen />);
      expect(await screen.findByText("Dispatch is closed")).toBeTruthy();
      expect(screen.getByText(/appear here once dispatch opens/)).toBeTruthy();
      expect(screen.queryByText(/straight away/)).toBeNull();
    });

    it("does not call a job from an alert gone while dispatch is closed", async () => {
      mockOrderId = "ord_tarpaulin";
      view = await render(<OffersScreen />);
      expect(await screen.findByText("This job is not open right now")).toBeTruthy();
      expect(screen.queryByText("This job is no longer available")).toBeNull();
    });

    it("does not read the hours for a rider waiting on approval", async () => {
      useSession.setState({ user: { ...rider, verificationStatus: "pending" as const } });
      view = await render(<OffersScreen />);
      await waitFor(() => expect(screen.queryByText("No open offers")).toBeNull());
      expect(api.getOperatingStatus).not.toHaveBeenCalled();
      expect(screen.queryByText("Dispatch is closed")).toBeNull();
    });

    describe("a refused accept", () => {
      const refusal = new ApiError(409, {
        error: "outside_operating_hours",
        message: "Dispatch resumes during operating hours.",
        scheduledReviewAt: CLOSED.scheduledReviewAt,
      });

      beforeEach(() => {
        api.getOperatingStatus.mockResolvedValue({ isOpenNow: true, scheduledReviewAt: CLOSED.scheduledReviewAt });
        api.listOffers.mockResolvedValue([offer]);
        api.acceptOffer.mockRejectedValue(refusal);
      });

      it("says the plain line on the card still listed", async () => {
        view = await render(<OffersScreen />);
        await screen.findByText("Storefront tarpaulin");
        api.getOperatingStatus.mockResolvedValue(CLOSED);

        await act(async () => {
          fireEvent.press(screen.getByRole("button", { name: "Accept this job" }));
        });

        expect(await screen.findByText(/^Dispatch is closed\. Opens 8:00 AM .*\.$/)).toBeTruthy();
        expect(screen.queryByText(/nothing was recorded/)).toBeNull();
        expect(screen.queryByText(/operating_hours/)).toBeNull();
      });

      it("is the closed state, with no error on top, once the card has gone", async () => {
        view = await render(<OffersScreen />);
        await screen.findByText("Storefront tarpaulin");
        api.getOperatingStatus.mockResolvedValue(CLOSED);
        api.listOffers.mockResolvedValue([]);

        await act(async () => {
          fireEvent.press(screen.getByRole("button", { name: "Accept this job" }));
        });

        expect(await screen.findByText("Dispatch is closed")).toBeTruthy();
        expect(screen.getByText(OPENS)).toBeTruthy();
        expect(screen.queryByText("Could not accept this job")).toBeNull();
        expect(screen.queryByText("No open offers")).toBeNull();
      });

      it("trusts the refusal when the hours cannot be read again", async () => {
        view = await render(<OffersScreen />);
        await screen.findByText("Storefront tarpaulin");
        api.getOperatingStatus.mockRejectedValue(new Error("offline"));
        api.listOffers.mockResolvedValue([]);

        await act(async () => {
          fireEvent.press(screen.getByRole("button", { name: "Accept this job" }));
        });

        expect(await screen.findByText("Dispatch is closed")).toBeTruthy();
        expect(screen.getByText(OPENS)).toBeTruthy();
      });
    });
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


it("opens only the job named by the alert and can return to the pool", async () => {
  jest.clearAllMocks();
  mockOrderId = "alert_job";
  useSession.setState({ user: rider });
  useActiveTrip.setState({ order: null });
  api.listOrders.mockResolvedValue([]);
  api.listOffers.mockResolvedValue([
    order({id:"other_job",state:"ready_for_dispatch",title:"Other offer"}),
    order({id:"alert_job",state:"ready_for_dispatch",title:"Alert offer"}),
  ]);
  const view = await render(<OffersScreen />);
  expect(await screen.findByText("Alert offer")).toBeTruthy();
  expect(screen.queryByText("Other offer")).toBeNull();
  expect(api.acceptOffer).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText("View all offers"));
  expect(jest.requireMock("expo-router").router.setParams).toHaveBeenCalledWith({orderId:undefined});
  await view.unmount();
});

it("explains a stale job alert without substituting another offer", async () => {
  jest.clearAllMocks();
  mockOrderId = "gone";
  useSession.setState({ user: rider });
  useActiveTrip.setState({ order: null });
  api.listOrders.mockResolvedValue([]);
  api.listOffers.mockResolvedValue([order({id:"other_job",state:"ready_for_dispatch",title:"Other offer"})]);
  const view = await render(<OffersScreen />);
  expect(await screen.findByText("This job is no longer available")).toBeTruthy();
  expect(screen.queryByText("Other offer")).toBeNull();
  await view.unmount();
});
