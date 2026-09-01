import type { Order } from "@/lib/api";
import { isPastJob, listPastJobs, pastJobAt } from "@/lib/riderHistory";

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
    timeline: [],
    pickup: { lat: 7.06, lng: 125.6, label: "PrintRight Davao" },
    dropoff: { lat: 7.07, lng: 125.61, label: "Matina Crossing" },
    ...patch,
  };
}

describe("the past-jobs ledger", () => {
  it("lists this rider's completed job and keeps a cancelled one", () => {
    const entries = listPastJobs(
      [
        order({ id: "done", state: "completed", title: "Flyers x500" }),
        order({ id: "stopped", state: "cancelled", title: "Tarpaulin" }),
        order({ id: "live", state: "out_for_delivery", title: "Still riding" }),
        order({ id: "offer", state: "ready_for_dispatch", riderId: null, title: "Open offer" }),
        order({ id: "theirs", state: "completed", riderId: "user_other", title: "Not yours" }),
      ],
      "user_rider",
    );

    expect(entries.map((entry) => entry.orderId)).toEqual(["done", "stopped"]);
    expect(entries.find((entry) => entry.orderId === "stopped")?.statusLabel).toBe("Cancelled");
    expect(isPastJob(order({ id: "live", state: "rider_assigned" }), "user_rider")).toBe(false);
  });

  it("dates a past job from the newest trail event, not an older update", () => {
    const job = order({
      id: "done",
      state: "completed",
      updatedAt: "2026-08-12T10:00:00+08:00",
      timeline: [
        { at: "2026-08-10T09:00:00+08:00", state: "rider_assigned", by: "user_rider", note: "Rider accepted" },
        { at: "2026-08-10T11:00:00+08:00", state: "delivered", by: "user_rider", note: "" },
      ],
    });

    expect(pastJobAt(job)).toBe("2026-08-10T11:00:00+08:00");
  });

  it("is empty when nobody is signed in", () => {
    expect(listPastJobs([order({ id: "done", state: "completed" })], null)).toEqual([]);
  });
});
