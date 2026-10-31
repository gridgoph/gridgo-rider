import type { DeliveryPin, Order } from "@/lib/api";
import { deliveryPinView, pinConfirmedAtLabel } from "@/lib/deliveryPin";
import { GRIDGO_OFFICE } from "@/lib/gridgoOffice";

const NOW = new Date("2026-10-15T08:00:00.000Z"); // 4:00 PM in Davao
const door = { lat: 7.0907, lng: 125.6146, label: "Lanang, blue gate" };

function pin(partial: Partial<DeliveryPin> = {}): DeliveryPin {
  return {
    version: 2,
    status: "confirmed",
    requestedAt: "2026-10-15T05:00:00.000Z",
    confirmedAt: "2026-10-15T06:14:00.000Z",
    point: door,
    notes: "Blue gate beside the pharmacy",
    receiverName: "Alex",
    changeUsed: false,
    ...partial,
  };
}

type PinOrder = Pick<Order, "deliveryPin" | "dropoffConfirmation" | "fulfillmentMode" | "dropoff">;
const order = (partial: Partial<PinOrder> = {}): PinOrder => ({
  fulfillmentMode: "delivery",
  dropoff: door,
  ...partial,
});

describe("the client's drop-off pin, as the rider reads it", () => {
  it("states a confirmation with its time, the receiver and the note", () => {
    expect(deliveryPinView(order({ deliveryPin: pin() }), NOW)).toEqual({
      status: "confirmed",
      title: "Client confirmed this pin",
      detail: "Confirmed 2:14 PM today",
      confirmedAt: "2:14 PM today",
      receiverName: "Alex",
      notes: "Blue gate beside the pharmacy",
      moved: false,
    });
  });

  it("leaves an unanswered prompt quiet and tells the rider the pin stands", () => {
    const view = deliveryPinView(
      order({ deliveryPin: pin({ status: "pending", confirmedAt: null, notes: "", receiverName: "" }) }),
      NOW,
    );
    expect(view).toMatchObject({
      status: "pending",
      title: "Client has not confirmed this pin yet",
      confirmedAt: null,
      receiverName: null,
      notes: null,
    });
    expect(view?.detail).toContain("Deliver to the pin as shown");
  });

  it("says when the client moved the pin before dispatch", () => {
    expect(deliveryPinView(order({ deliveryPin: pin({ changeUsed: true }) }), NOW)?.moved).toBe(true);
  });

  it("treats blank notes and receiver as none", () => {
    const view = deliveryPinView(order({ deliveryPin: pin({ notes: "   ", receiverName: " " }) }), NOW);
    expect(view?.notes).toBeNull();
    expect(view?.receiverName).toBeNull();
  });

  it("is honest about an order from before pin confirmation", () => {
    expect(deliveryPinView(order(), NOW)).toMatchObject({
      status: "none",
      title: "No pin confirmation on this order",
      detail: "An older order. Deliver to the address as shown.",
      receiverName: null,
      notes: null,
    });
  });

  it("keeps a confirmed answer from the earlier out-for-delivery flow", () => {
    const view = deliveryPinView(
      order({
        dropoffConfirmation: {
          status: "confirmed",
          requestedAt: "2026-10-14T05:00:00.000Z",
          answeredAt: "2026-10-14T05:09:00.000Z",
          point: door,
        },
      }),
      NOW,
    );
    expect(view).toMatchObject({ status: "confirmed", detail: "Confirmed Wed, Oct 14, 1:09 PM" });
  });

  it("has nothing to say about a job ending at GRIDGO Office", () => {
    expect(deliveryPinView(order({ fulfillmentMode: "pickup" }), NOW)).toBeNull();
    expect(
      deliveryPinView(order({ dropoff: { ...GRIDGO_OFFICE, label: "GRIDGO Office" } }), NOW),
    ).toBeNull();
  });

  it("never prints an unreadable time", () => {
    expect(pinConfirmedAtLabel("not a date", NOW)).toBeNull();
    expect(deliveryPinView(order({ deliveryPin: pin({ confirmedAt: "nope" }) }), NOW)?.detail).toBeNull();
  });
});
