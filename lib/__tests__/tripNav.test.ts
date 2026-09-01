import { GRIDGO_OFFICE } from "@/lib/gridgoOffice";
import type { Order } from "@/lib/api";
import {
  isGridgoOfficePoint,
  nextStop,
  snapRouteOrigin,
  tripDestination,
  tripShop,
} from "@/lib/tripNav";

const shop = { lat: 7.064, lng: 125.6085, label: "Lovis Printshop" };
const client = { lat: 7.047, lng: 125.586, label: "Matina Crossing" };

function order(partial: Partial<Order> = {}): Order {
  return {
    id: "ord_1",
    clientId: "user_client",
    supplierId: "user_supplier",
    riderId: "user_rider",
    state: "rider_assigned",
    productId: "prod_flyer",
    title: "Flyers",
    quantity: 100,
    size: "A5",
    material: "matte",
    deadline: null,
    address: client.label,
    zone: "davao_south",
    deliveryFeeMinor: 2500,
    subtotalMinor: 77000,
    totalMinor: 79500,
    downpaymentMinor: 59625,
    balanceMinor: 19875,
    paymentMethod: "qr_manual",
    paymentStatus: "authorized",
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    timeline: [],
    pickup: shop,
    dropoff: client,
    fulfillmentMode: "delivery",
    ...partial,
  };
}

describe("tripShop / tripDestination", () => {
  it("sends the rider to the print shop first", () => {
    const stop = tripShop(order());
    expect(stop.kind).toBe("shop");
    expect(stop.point).toEqual({ lat: shop.lat, lng: shop.lng });
    expect(stop.navTitle).toBe("TO THE SHOP");
  });

  it("pins the client's door on a delivery job", () => {
    const stop = tripDestination(order());
    expect(stop.kind).toBe("client");
    expect(stop.point).toEqual({ lat: client.lat, lng: client.lng });
    expect(stop.navTitle).toBe("TO THE CLIENT");
  });

  it("pins GRIDGO Office when the client collects there", () => {
    const stop = tripDestination(order({ fulfillmentMode: "pickup", dropoff: null }));
    expect(stop.kind).toBe("office");
    expect(stop.point).toEqual({ lat: GRIDGO_OFFICE.lat, lng: GRIDGO_OFFICE.lng });
    expect(stop.label).toBe(GRIDGO_OFFICE.label);
    expect(stop.navTitle).toBe("TO GRIDGO OFFICE");
  });

  it("treats a drop-off on the office pin as GRIDGO Office", () => {
    const stop = tripDestination(
      order({
        fulfillmentMode: "delivery",
        dropoff: { ...GRIDGO_OFFICE },
      }),
    );
    expect(stop.kind).toBe("office");
    expect(isGridgoOfficePoint(stop.point)).toBe(true);
  });
});

describe("nextStop", () => {
  it("is the shop while checks are still owed", () => {
    expect(nextStop(order({ state: "rider_assigned" }), "pickup_checks")?.kind).toBe("shop");
  });

  it("switches to the client once the package is with the rider", () => {
    expect(nextStop(order({ state: "picked_up" }), "start_delivery")?.kind).toBe("client");
    expect(nextStop(order({ state: "out_for_delivery" }), "delivery_proof")?.kind).toBe(
      "client",
    );
  });

  it("switches to GRIDGO Office after pickup on a collect job", () => {
    const collect = order({ fulfillmentMode: "pickup", dropoff: null, state: "picked_up" });
    expect(nextStop(collect, "start_delivery")?.kind).toBe("office");
  });
});

describe("snapRouteOrigin", () => {
  const here = { lat: 7.07, lng: 125.61 };

  it("does not invent an origin when GPS is missing", () => {
    expect(snapRouteOrigin(null, null)).toBeNull();
  });

  it("takes the first fix", () => {
    expect(snapRouteOrigin(here, null)).toEqual(here);
  });

  it("holds the origin still for a small GPS drift", () => {
    const drifted = { lat: here.lat + 0.0002, lng: here.lng };
    expect(snapRouteOrigin(drifted, here)).toEqual(here);
  });

  it("updates once the rider has actually moved", () => {
    const moved = { lat: here.lat + 0.002, lng: here.lng };
    expect(snapRouteOrigin(moved, here)).toEqual(moved);
  });
});
