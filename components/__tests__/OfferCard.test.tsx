import { render, screen } from "@testing-library/react-native";

import { OfferCard } from "@/components/OfferCard";
import type { Order } from "@/lib/api";

jest.mock("@/components/TripMap", () => ({
  TripMap: () => null,
}));

jest.mock("@/hooks/useRoute", () => ({
  useRoute: () => ({ route: null, loading: false }),
}));

const offer = {
  id: "ord_1",
  clientId: "user_client",
  supplierId: "user_supplier",
  riderId: null,
  state: "ready_for_dispatch",
  productId: "prod_flyer",
  title: "Storefront tarpaulin",
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
} as Order;

describe("OfferCard accept control", () => {
  it("prints the order id under the title", async () => {
    await render(<OfferCard offer={offer} onAccept={jest.fn()} />);

    expect(screen.getByText("Storefront tarpaulin")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
  });

  it("says Accepting only while this card's accept is in flight", async () => {
    await render(<OfferCard offer={offer} accepting onAccept={jest.fn()} />);

    expect(screen.getByRole("button", { name: "Accepting…" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Accept this job" })).toBeNull();
  });

  it("keeps Accept this job when the rider already has a trip", async () => {
    await render(<OfferCard offer={offer} disabled onAccept={jest.fn()} />);

    const button = screen.getByRole("button", { name: "Accept this job" });
    expect(button.props.accessibilityState?.disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Accepting…" })).toBeNull();
  });
});

describe("OfferCard earnings", () => {
  it("leads with the rider's share and names the gross fee under it", async () => {
    await render(
      <OfferCard
        offer={{ ...offer, deliveryFeeMinor: 2500, riderCommissionBps: 8500, riderPayoutMinor: 2125 }}
        onAccept={jest.fn()}
      />,
    );

    expect(screen.getByText("YOU EARN")).toBeTruthy();
    expect(screen.getByText("₱21.25")).toBeTruthy();
    expect(screen.getByText("85% of the ₱25.00 delivery fee")).toBeTruthy();
  });

  it("shows the whole fee, with no split line, against an API without the split", async () => {
    await render(<OfferCard offer={offer} onAccept={jest.fn()} />);

    expect(screen.getByText("₱50.00")).toBeTruthy();
    expect(screen.queryByText(/delivery fee/)).toBeNull();
  });
});
