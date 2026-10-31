/**
 * What the rider reads about the client's drop-off pin.
 *
 * When production finishes, the client is asked "Will you be at this pin?"
 * and may answer "Yes, I'll be here" with notes for the rider and the name of
 * whoever receives the package. They may also move the pin once, until the
 * first rider is assigned (gridgo-api `docs/DELIVERY_PIN_API.md`). The rider
 * projection carries only the final pin, its status, the notes and the
 * receiver's name — never the original pin, a proposal, money or a phone
 * number — so this file never asks for more.
 *
 * Three honest states:
 *  - `confirmed`: the client said they (or their receiver) will be there.
 *  - `pending`:   they were asked and have not answered. The pin stands as
 *                 given, and they can still confirm while the rider rides.
 *  - `none`:      an order from before pin confirmation. Nobody was asked,
 *                 so the app says that rather than implying a "no".
 *
 * A job going to GRIDGO Office has no client door and so no pin: `null`.
 */
import type { Order } from "@/lib/api";
import { isValidLatLng } from "@/lib/geo";
import { isGridgoOfficePoint } from "@/lib/tripNav";
import { stopLatLng } from "@/lib/riderOrder";

export type DeliveryPinStatus = "confirmed" | "pending" | "none";

export type DeliveryPinView = {
  status: DeliveryPinStatus;
  /** The status line: icon + this label carry it, never colour alone. */
  title: string;
  /** What the status means for the rider, or null when the title says it all. */
  detail: string | null;
  /** When the client confirmed, in Davao time; null unless confirmed. */
  confirmedAt: string | null;
  /** The receiver's name, or null when the client receives it themselves. */
  receiverName: string | null;
  /** The client's own words for the rider, or null when they left none. */
  notes: string | null;
  /** The client moved the pin once before dispatch; the map shows the result. */
  moved: boolean;
};

type PinFields = Pick<Order, "deliveryPin" | "dropoffConfirmation" | "fulfillmentMode" | "dropoff">;

function trimmed(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** "2:14 PM today" / "Thu, Oct 9, 9:05 AM", in Davao time. */
export function pinConfirmedAtLabel(iso: string, now: Date | number = Date.now()): string | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const time = at.toLocaleTimeString("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
  });
  const day = (date: Date) => date.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  if (day(at) === day(new Date(now))) return `${time} today`;
  const date = at.toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return `${date}, ${time}`;
}

/**
 * The pin as this rider should read it, or null when the job has no client
 * door (GRIDGO Office).
 */
export function deliveryPinView(order: PinFields, now: Date | number = Date.now()): DeliveryPinView | null {
  if (order.fulfillmentMode === "pickup") return null;
  const pin = order.deliveryPin;
  const point = isValidLatLng(stopLatLng(pin?.point)) ? stopLatLng(pin?.point) : stopLatLng(order.dropoff);
  if (isGridgoOfficePoint(point)) return null;

  if (pin) {
    const confirmed = pin.status === "confirmed";
    const at = confirmed && pin.confirmedAt ? pinConfirmedAtLabel(pin.confirmedAt, now) : null;
    return {
      status: confirmed ? "confirmed" : "pending",
      title: confirmed ? "Client confirmed this pin" : "Client has not confirmed this pin yet",
      detail: confirmed
        ? at
          ? `Confirmed ${at}`
          : null
        : "They can still confirm while you ride. Deliver to the pin as shown.",
      confirmedAt: at,
      receiverName: trimmed(pin.receiverName),
      notes: trimmed(pin.notes),
      moved: pin.changeUsed === true,
    };
  }

  // The earlier out-for-delivery confirmation: a confirmed answer still counts.
  const legacy = order.dropoffConfirmation;
  if (legacy?.status === "confirmed") {
    const at = pinConfirmedAtLabel(legacy.answeredAt, now);
    return {
      status: "confirmed",
      title: "Client confirmed this pin",
      detail: at ? `Confirmed ${at}` : null,
      confirmedAt: at,
      receiverName: null,
      notes: null,
      moved: false,
    };
  }
  if (legacy) {
    return {
      status: "pending",
      title: "Client has not confirmed this pin yet",
      detail: "Deliver to the pin as shown.",
      confirmedAt: null,
      receiverName: null,
      notes: null,
      moved: false,
    };
  }

  return {
    status: "none",
    title: "No pin confirmation on this order",
    detail: "An older order. Deliver to the address as shown.",
    confirmedAt: null,
    receiverName: null,
    notes: null,
    moved: false,
  };
}
