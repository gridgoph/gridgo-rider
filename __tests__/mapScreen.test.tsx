import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import MapScreen from "@/app/(tabs)/map";
import type { Order } from "@/lib/api";
import { useActiveTrip } from "@/store/activeTrip";
import { resetRiderOnlineForTests, setRiderOnline } from "@/store/riderOnline";
import { useSession } from "@/store/session";
import { useTripArrivals } from "@/store/tripArrivals";

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
jest.mock("@/components/TripMap", () => ({ TripMap: () => null }));
jest.mock("@/components/ChatButton", () => ({ ChatButton: () => null }));
jest.mock("@/components/AlertsButton", () => ({ AlertsButton: () => null }));
jest.mock("@/hooks/useRoute", () => ({ useRoute: () => ({ route: null }) }));
const mockHere = { coords: { lat: 7.07, lng: 125.61 }, accuracy: 12, fixAtMs: 1, heading: null, permission: "granted", error: null };
jest.mock("@/hooks/useRiderLocation", () => ({ useRiderLocation: () => mockHere }));
const mockHealth = { issues: [] };
jest.mock("@/hooks/useLocationHealth", () => ({ useLocationHealth: () => mockHealth }));
jest.mock("@/hooks/useAttention", () => ({ useAttention: () => null }));
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

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: new Date(SERVER_NOW), advanceTimers: true });
  mockParams = {};
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

  it("asks before going offline mid-job", async () => {
    mockAskConfirm.mockResolvedValue(false);
    await renderMap(<MapScreen />);
    await screen.findByTestId("trip-panel");
    await act(async () => fireEvent.press(screen.getByTestId("map-status")));
    expect(mockAskConfirm).toHaveBeenCalledWith(expect.objectContaining({ question: "Go offline during this job?" }));
    expect(screen.getByLabelText(/online/i)).toBeTruthy();
  });
});
