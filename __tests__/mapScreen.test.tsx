import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import MapScreen from "@/app/(tabs)/map";
import type { Order } from "@/lib/api";
import { useActiveTrip } from "@/store/activeTrip";
import { resetRiderOnlineForTests, setRiderOnline } from "@/store/riderOnline";
import { useSession } from "@/store/session";
import { useTripArrivals } from "@/store/tripArrivals";
import { emptyTripLocation, useTripLocation } from "@/store/tripLocation";

let mockParams: Record<string, string | undefined> = {};
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  router: { push: jest.fn(), replace: jest.fn() },
  useRouter: () => jest.requireMock("expo-router").router,
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual<typeof import("react")>("react");
    useEffect(callback, [callback]);
  },
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  listDispatchOffers: jest.fn(),
  listOrders: jest.fn(),
  listCatalogShops: jest.fn(),
  acceptOffer: jest.fn(),
  declineOffer: jest.fn(),
  recordShopMilestone: jest.fn(),
  recordArrival: jest.fn(),
  getOperatingStatus: jest.fn(),
  getActiveOrder: jest.fn(),
}));

jest.mock("@/components/BrowseMap", () => {
  const { Pressable, Text, View } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    BrowseMap: ({
      places,
      onSelectPlace,
    }: {
      places: { id: string; badge?: number }[];
      onSelectPlace?: (id: string) => void;
    }) => (
      <View>
        <Pressable testID="browse-map" accessibilityLabel="City map" onPress={() => onSelectPlace?.("user_lovis_printshop")} />
        <Text testID="map-badges">
          {places
            .filter((place) => place.badge)
            .map((place) => `${place.id}:${place.badge}`)
            .join(",")}
        </Text>
      </View>
    ),
  };
});
let mockTripMapProps: Record<string, unknown> = {};
jest.mock("@/components/TripMap", () => ({
  TripMap: (props: Record<string, unknown>) => {
    mockTripMapProps = props;
    return null;
  },
}));
jest.mock("@/components/ChatButton", () => ({ ChatButton: () => null }));
jest.mock("@/components/AlertsButton", () => ({ AlertsButton: () => null }));
const mockRouteResult: { route: unknown } = { route: null };
jest.mock("@/hooks/useRoute", () => ({ useRoute: () => mockRouteResult }));
const mockHere = { coords: { lat: 7.07, lng: 125.61 }, accuracy: 12, fixAtMs: 1, heading: null, permission: "granted", error: null };
jest.mock("@/hooks/useRiderLocation", () => ({ useRiderLocation: () => mockHere }));
const mockHealth = { issues: [] };
jest.mock("@/hooks/useLocationHealth", () => ({ useLocationHealth: () => mockHealth }));
const mockUseAttention = jest.fn((_locationIssues?: number) => null);
jest.mock("@/hooks/useAttention", () => ({ useAttention: (n?: number) => mockUseAttention(n) }));
// Stable, like the real hook's callbacks: a fresh function each render would re-fire the focus effect forever.
const mockHours = { opensLine: null, refresh: async () => undefined, adopt: () => undefined };
jest.mock("@/hooks/useDispatchHours", () => ({ useDispatchHours: () => mockHours }));

const mockAskConfirm = jest.fn();
jest.mock("@/store/sheets", () => ({
  ...jest.requireActual("@/store/sheets"),
  askConfirm: (...args: unknown[]) => mockAskConfirm(...args),
}));

const mockRefreshTrip = jest.fn(async () => undefined);
const api = jest.requireMock("@/lib/api") as Record<string, jest.Mock>;
const router = (jest.requireMock("expo-router") as { router: { push: jest.Mock } }).router;

const rider = { id: "user_rider", email: "rider@example.test", name: "Carlo", role: "rider" as const, verificationStatus: "approved" as const };
const SERVER_NOW = "2026-11-18T03:00:00.000Z";

function order(partial: Partial<Order> & Pick<Order, "id" | "state">): Order {
  return {
    clientId: "user_client",
    supplierId: "user_lovis_printshop",
    riderId: null,
    productId: "prod_flyer",
    title: "Storefront tarpaulin",
    quantity: 1,
    size: "A5",
    material: "matte",
    deadline: null,
    address: "Matina Crossing, Davao City",
    zone: "davao_south",
    subtotalMinor: 77000,
    deliveryFeeMinor: 12000,
    riderPayoutMinor: 9600,
    deliveryDistanceMeters: 2400,
    totalMinor: 89000,
    downpaymentMinor: 61500,
    balanceMinor: 27500,
    paymentMethod: "qr_manual",
    paymentStatus: "authorized",
    promisedDate: null,
    artworkName: null,
    fulfillmentMode: "delivery",
    createdAt: "2026-11-18T00:00:00.000Z",
    updatedAt: "2026-11-18T00:00:00.000Z",
    timeline: [],
    ...partial,
  } as Order;
}

const offered = order({
  id: "ord_offer",
  state: "ready_for_dispatch",
  dispatchOffer: {
    id: "dof_1",
    status: "offered",
    riderId: rider.id,
    offeredAt: "2026-11-18T02:59:50.000Z",
    timeoutSeconds: 30,
    expiresAt: "2026-11-18T03:00:20.000Z",
  },
  cargoSummary: {
    lines: [{ lineItemId: "line_1", description: "Tarpaulin 3×6 ft", quantity: 2 }],
    totalQuantity: 2,
  },
  travelEstimate: { distanceMeters: 2400, durationSeconds: null, source: "stored_delivery_distance" },
});

function renderMap(ui: ReactElement) {
  return render(ui, {
    wrapper: ({ children }) => (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}
      >
        {children}
      </SafeAreaProvider>
    ),
  });
}

beforeEach(async () => {
  jest.clearAllMocks();
  // The online choice persists; a test that went online must not leak into the next.
  await AsyncStorage.clear();
  jest.useFakeTimers({ now: new Date(SERVER_NOW), advanceTimers: true });
  mockParams = {};
  mockTripMapProps = {};
  mockRouteResult.route = null;
  useTripLocation.setState({ ...emptyTripLocation, sharing: false, sharingError: null });
  resetRiderOnlineForTests();
  useTripArrivals.setState({ byOrder: {} });
  useSession.setState({ user: rider, loading: false, error: null, authSource: "clerk" } as never);
  useActiveTrip.setState({ order: null, loaded: true, loading: false, error: null, refresh: mockRefreshTrip } as never);
  api.listDispatchOffers.mockResolvedValue({ offers: [offered], serverTime: SERVER_NOW });
  api.listOrders.mockResolvedValue([]);
  api.listCatalogShops.mockResolvedValue([
    {
      supplierId: "user_lovis_printshop",
      shopName: "Lovis Printshop",
      shop: { lat: 7.0867, lng: 125.6161, label: "Iñigo, Corner Cervantes St, Poblacion, Davao City" },
      categories: [],
      itemCount: 8,
    },
  ]);
});

afterEach(() => jest.useRealTimers());

describe("the map home", () => {
  it("starts offline, with the switch in the bottom panel and the map behind it", async () => {
    await renderMap(<MapScreen />);
    await waitFor(() => expect(screen.getByText("You're offline")).toBeTruthy());
    expect(screen.getByLabelText("City map")).toBeTruthy();
    expect(screen.getByLabelText("Center the map on you")).toBeTruthy();
    expect(screen.getByTestId("map-today")).toBeTruthy();
    // An offer is waiting, but nobody is shown it until they go online.
    expect(screen.queryByTestId("offer-sheet")).toBeNull();
  });

  it("opens a shop from its pin, and closes it", async () => {
    await renderMap(<MapScreen />);
    await waitFor(() => expect(api.listCatalogShops).toHaveBeenCalled());
    await act(async () => fireEvent.press(screen.getByTestId("browse-map")));
    expect(screen.getByText("Lovis Printshop")).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByLabelText("Close shop details")));
    expect(screen.queryByText("Lovis Printshop")).toBeNull();
  });

  it("shows one offer once online: the rider's own pay, the countdown, distance and cargo", async () => {
    setRiderOnline(rider.id, true);
    await renderMap(<MapScreen />);
    await screen.findByTestId("offer-sheet");
    expect(screen.getByText("₱96.00")).toBeTruthy();
    expect(screen.getByText("0:20 left")).toBeTruthy();
    expect(screen.getByText(/2\.4 km/)).toBeTruthy();
    expect(screen.getByText("Tarpaulin 3×6 ft")).toBeTruthy();
    // The shop the offer leaves from carries a badge on the map.
    expect(screen.getByTestId("map-badges").props.children).toBe("user_lovis_printshop:1");
  });

  it("opens an offer tapped from a push even while offline", async () => {
    mockParams = { offer: "ord_offer" };
    await renderMap(<MapScreen />);
    expect(await screen.findByTestId("offer-sheet")).toBeTruthy();
  });

  it("accepts with the offer id, then tells the shop the rider is on the way", async () => {
    setRiderOnline(rider.id, true);
    const accepted = order({ id: "ord_offer", state: "rider_assigned", riderId: rider.id });
    api.acceptOffer.mockResolvedValue(accepted);
    api.recordShopMilestone.mockResolvedValue(accepted);
    await renderMap(<MapScreen />);
    await screen.findByTestId("offer-sheet");
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Accept" })));
    expect(api.acceptOffer).toHaveBeenCalledWith("ord_offer", "dof_1");
    expect(api.recordShopMilestone).toHaveBeenCalledWith("ord_offer", "heading_to_shop");
    expect(useActiveTrip.getState().order?.id).toBe("ord_offer");
  });

  it("declines with the offer id and says where the job goes", async () => {
    setRiderOnline(rider.id, true);
    api.declineOffer.mockResolvedValue({ ok: true });
    await renderMap(<MapScreen />);
    await screen.findByTestId("offer-sheet");
    api.listDispatchOffers.mockResolvedValue({ offers: [], serverTime: SERVER_NOW });
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Decline" })));
    expect(api.declineOffer).toHaveBeenCalledWith("ord_offer", "dof_1");
    expect(await screen.findByText(/offering it to the next rider/)).toBeTruthy();
  });

  it("says the time is short in words, not by colour alone", async () => {
    api.listDispatchOffers.mockResolvedValue({
      offers: [{ ...offered, dispatchOffer: { ...offered.dispatchOffer!, expiresAt: "2026-11-18T03:00:08.000Z" } }],
      serverTime: SERVER_NOW,
    });
    setRiderOnline(rider.id, true);
    await renderMap(<MapScreen />);
    expect(await screen.findByText(/^Only 0:0\d left$/)).toBeTruthy();
  });

  it("tells assistive tech whether the rider is online", async () => {
    await renderMap(<MapScreen />);
    const off = await screen.findByTestId("online-switch");
    expect(off.props.accessibilityState).toMatchObject({ checked: false });
    expect(screen.getByTestId("map-status").props.accessibilityState).toMatchObject({ checked: false });
    await act(async () => fireEvent.press(off));
    expect(screen.getByTestId("map-status").props.accessibilityState).toMatchObject({ checked: true });
  });

  it("never asks for offers before Operations approves the rider", async () => {
    useSession.setState({ user: { ...rider, verificationStatus: "pending" } } as never);
    await renderMap(<MapScreen />);
    await waitFor(() => expect(screen.getByText("Not taking jobs yet")).toBeTruthy());
    expect(api.listDispatchOffers).not.toHaveBeenCalled();
  });
});

describe("on a job", () => {
  const assigned = order({ id: "ord_trip", state: "rider_assigned", riderId: rider.id });

  beforeEach(() => {
    useActiveTrip.setState({ order: assigned } as never);
    setRiderOnline(rider.id, true);
  });

  it("swaps the offer for the four-step trip, starting on the way to the shop", async () => {
    await renderMap(<MapScreen />);
    await screen.findByTestId("trip-panel");
    expect(screen.queryByTestId("offer-sheet")).toBeNull();
    expect(screen.getByTestId("trip-rail")).toBeTruthy();
    expect(screen.getByLabelText(/Trip step 1 of 4: To shop/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "I'm at the shop" })).toBeTruthy();
  });

  it("tells the shop the rider arrived, then moves on to the check", async () => {
    api.recordShopMilestone.mockResolvedValue(assigned);
    await renderMap(<MapScreen />);
    await screen.findByTestId("trip-panel");
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "I'm at the shop" })));
    expect(api.recordShopMilestone).toHaveBeenCalledWith("ord_trip", "at_shop");
    expect(screen.getByLabelText(/Trip step 2 of 4: Check/)).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Start the shop check" })));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/trip/pickup", params: { orderId: "ord_trip" } });
  });

  it("still moves on when the arrival notice cannot be sent", async () => {
    api.recordShopMilestone.mockRejectedValue(new TypeError("Network request failed"));
    await renderMap(<MapScreen />);
    await screen.findByTestId("trip-panel");
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "I'm at the shop" })));
    expect(screen.getByText(/The shop was not told you arrived/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start the shop check" })).toBeTruthy();
  });

  describe("the position on the map always carries its age", () => {
    const routed = { routed: true, coordinates: [[125.61, 7.07], [125.62, 7.08]], distanceMeters: 2000, durationSeconds: 300 };

    it("shows a live fix's age and draws the route from it", async () => {
      mockRouteResult.route = routed;
      useTripLocation.setState({ coords: { lat: 7.07, lng: 125.61 }, fixAtMs: Date.now() - 3_000, permission: "granted", accuracy: 12 });
      await renderMap(<MapScreen />);
      await screen.findByTestId("trip-panel");
      expect(screen.getByTestId("trip-position-age")).toHaveTextContent(/Position is live — updated \ds ago · within 12 m/);
      expect(mockTripMapProps.routeCoordinates).toEqual(routed.coordinates);
      expect(mockTripMapProps.riderStale).toBe(false);
      expect(mockUseAttention).toHaveBeenLastCalledWith(0);
    });

    it("says a stale fix is stale, pauses the route, and raises the chip", async () => {
      mockRouteResult.route = routed;
      useTripLocation.setState({ coords: { lat: 7.07, lng: 125.61 }, fixAtMs: Date.now() - 69_000, permission: "granted", accuracy: 12 });
      await renderMap(<MapScreen />);
      await screen.findByTestId("trip-panel");
      expect(screen.getByTestId("trip-position-age")).toHaveTextContent(/Position is stale — last fix 1 min ago/);
      expect(screen.getByText("Route paused until your position updates")).toBeTruthy();
      expect(screen.queryByText(/2\.0 km/)).toBeNull();
      expect(mockTripMapProps.routeCoordinates).toEqual([]);
      expect(mockTripMapProps.riderStale).toBe(true);
      expect(mockTripMapProps.riderHeading).toBeNull();
      expect(mockUseAttention).toHaveBeenLastCalledWith(1);
    });

    it("turns stale while the rider watches, without a new fix", async () => {
      mockRouteResult.route = routed;
      useTripLocation.setState({ coords: { lat: 7.07, lng: 125.61 }, fixAtMs: Date.now() - 40_000, permission: "granted", accuracy: 12 });
      await renderMap(<MapScreen />);
      await screen.findByTestId("trip-panel");
      expect(screen.getByTestId("trip-position-age")).toHaveTextContent(/Position is live/);
      await act(async () => jest.advanceTimersByTime(10_000));
      expect(screen.getByTestId("trip-position-age")).toHaveTextContent(/Position is stale/);
      expect(mockTripMapProps.routeCoordinates).toEqual([]);
    });

    it("says when there is no fix yet rather than drawing a dot", async () => {
      await renderMap(<MapScreen />);
      await screen.findByTestId("trip-panel");
      expect(screen.getByTestId("trip-position-age")).toHaveTextContent("Finding your position");
      expect(screen.getByText("Waiting for your position…")).toBeTruthy();
    });
  });

  it("asks before going offline mid-job", async () => {
    mockAskConfirm.mockResolvedValue(false);
    await renderMap(<MapScreen />);
    await screen.findByTestId("trip-panel");
    await act(async () => fireEvent.press(screen.getByTestId("map-status")));
    expect(mockAskConfirm).toHaveBeenCalledWith(expect.objectContaining({ question: "Go offline during this job?" }));
    expect(screen.getByLabelText(/online/i)).toBeTruthy();
  });
});
