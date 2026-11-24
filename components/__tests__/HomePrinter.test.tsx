import { render, screen } from "@testing-library/react-native";

import { OfferSheet } from "@/components/OfferSheet";
import { TripPanel } from "@/components/TripPanel";
import { TripStepHeader } from "@/components/TripStepHeader";
import type { Order } from "@/lib/api";
import { tripShop } from "@/lib/tripNav";

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@/hooks/useRoute", () => ({ useRoute: () => ({ route: null }) }));
jest.mock("@/components/NavigateButton", () => ({ NavigateButton: () => null }));

// As gridgo-api#439 serves a home-printer job to the rider (made-up values).
const offer = {
  id: "ord_home",
  clientId: "user_client",
  supplierId: "user_home",
  riderId: null,
  state: "ready_for_dispatch",
  fulfillmentMode: "delivery",
  title: "Standard flyer",
  quantity: 1,
  deliveryFeeMinor: 8_900,
  riderPayoutMinor: 7_120,
  printerType: "home",
  barangay: "Sample Barangay",
  pickup: { barangay: "Sample Barangay" },
  dropoff: { lat: 7.0907, lng: 125.6146, label: "Sample drop-off, Lanang" },
  supplierContact: { shopName: "Sample Barangay", printerType: "home", barangay: "Sample Barangay" },
  timeline: [],
  dispatchOffer: { id: "off_1", status: "offered" },
} as unknown as Order;
const assigned = {
  ...offer,
  state: "rider_assigned",
  riderId: "user_rider",
  dispatchOffer: null,
  pickup: { lat: 7.073412, lng: 125.612834, label: "Sample Street", landmark: "Blue gate", propertyType: "house" },
} as unknown as Order;
const shopTrip = {
  ...assigned,
  printerType: undefined,
  barangay: undefined,
  pickup: { lat: 7.06, lng: 125.6, label: "Shop, Matina" },
  supplierContact: { shopName: "Sample Shop", contactName: "Sample Person" },
} as unknown as Order;

const sheet = { secondsLeft: null, fractionLeft: null, busy: null, error: null, onAccept: jest.fn(), onDecline: jest.fn() };
const panel = {
  phase: "pickup_checks" as const,
  step: "to_shop" as const,
  action: { kind: "none" as const },
  routeSummary: null,
  busy: false,
  error: null,
  onAction: jest.fn(),
  onDone: jest.fn(),
};

describe("a home printer offer", () => {
  it("shows the house tag and the barangay, and no street or pin", async () => {
    await render(<OfferSheet offer={offer} {...sheet} />);
    expect(screen.getByText("Home printer · Sample Barangay")).toBeTruthy();
    expect(screen.getByLabelText("Pickup at a home printer in Sample Barangay")).toBeTruthy();
    expect(screen.getByText("Exact pin shows after you accept")).toBeTruthy();
    expect(screen.queryByText(/Sample Street/)).toBeNull();
    expect(screen.queryByTestId("home-pickup-note")).toBeNull();
  });

  it("leaves a shop offer as it was", async () => {
    await render(<OfferSheet offer={{ ...shopTrip, state: "ready_for_dispatch", dispatchOffer: { id: "off_2" } } as Order} {...sheet} />);
    expect(screen.queryByTestId("home-printer-tag")).toBeNull();
    expect(screen.getByText("Shop, Matina")).toBeTruthy();
  });
});

describe("after Accept", () => {
  it("puts the pin's street on the trip panel with the discreet note", async () => {
    await render(<TripPanel trip={assigned} stop={tripShop(assigned)} {...panel} />);
    expect(screen.getByText("Pick up at a home printer")).toBeTruthy();
    expect(screen.getByText("Sample Street, Sample Barangay")).toBeTruthy();
    expect(screen.getByText("This is a private home, please be discreet.")).toBeTruthy();
    expect(screen.getByText("House · Blue gate")).toBeTruthy();
    expect(screen.getByLabelText("Call the home printer")).toBeTruthy();
  });

  it("says it on the pickup screens' header too", async () => {
    await render(<TripStepHeader order={assigned} stopKind="pickup" stopLabel="Sample Street, Sample Barangay" />);
    expect(screen.getByText("AT THE HOME PRINTER")).toBeTruthy();
    expect(screen.getByTestId("home-pickup-note")).toBeTruthy();
  });

  it("drops the note when the API no longer sends the pin", async () => {
    const ended = { ...assigned, state: "completed", pickup: { barangay: "Sample Barangay" } } as unknown as Order;
    await render(<TripStepHeader order={ended} stopKind="pickup" stopLabel="Home printer, Sample Barangay" />);
    expect(screen.queryByTestId("home-pickup-note")).toBeNull();
  });

  it("changes nothing for a shop", async () => {
    await render(<TripPanel trip={shopTrip} stop={tripShop(shopTrip)} {...panel} />);
    expect(screen.getByText("Pick up at")).toBeTruthy();
    expect(screen.getByText("Shop, Matina")).toBeTruthy();
    expect(screen.queryByTestId("home-pickup-note")).toBeNull();
    expect(screen.getByLabelText("Call the shop")).toBeTruthy();

    await render(<TripStepHeader order={shopTrip} stopKind="pickup" stopLabel="Shop, Matina" />);
    expect(screen.getByText("AT THE SHOP")).toBeTruthy();
  });
});
