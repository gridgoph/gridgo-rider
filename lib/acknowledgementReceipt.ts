/**
 * The acknowledgement receipt the rider copies onto paper at the client's door.
 *
 * gridgo-api `docs/ACKNOWLEDGEMENT_RECEIPTS_API.md` is the contract. During the
 * pilot this is an acknowledgement receipt, never an official one: GRIDGO
 * issues it from the order and numbers it in one running series, the client
 * gets it in their app, and the rider writes the same facts on the paper copy
 * the client signs.
 *
 * It is the one place a rider sees the client's money (gridgo-api
 * `docs/LEGAL_API.md`, the receipt-only exception), and only while it is
 * needed: after this rider has recorded arrival on this assignment, until the
 * handover is done. The receipt lives in the delivery screen's memory and
 * nowhere else — never a store, never AsyncStorage, never a log, never a list
 * or the job's history — and is dropped the moment that window closes.
 */
import type { DeliveryMilestone, Order } from "@/lib/api";
import { ApiError, apiErrorCode, formatPhp } from "@/lib/api";
import { endsAtOffice } from "@/lib/riderOrder";
import { riderRefusal } from "@/lib/riderRefusals";

export type AcknowledgementReceiptLine = {
  id: string;
  description: string;
  quantity: number;
  /** Null when no unit rate was recorded. Show "Not recorded"; never derive one. */
  unitPriceMinor: number | null;
  subtotalMinor: number;
};

export type AcknowledgementPayment = {
  code: string;
  type: "digital" | "cash" | "unknown";
  method: string | null;
  reference: string | null;
  amountMinor: number;
  amountReceivedMinor: number | null;
  changeMinor: number | null;
};

export type AcknowledgementReceipt = {
  version: number;
  orderId: string;
  orderNumber: string;
  arNumber: string;
  issuedAt: string;
  issuedTo: string;
  currency: "PHP";
  lines: AcknowledgementReceiptLine[];
  deliveryFeeMinor: number;
  organizationDiscountMinor: number;
  voucherDiscountMinor: number;
  roundingAdjustmentMinor: number;
  grandTotalMinor: number;
  payments: AcknowledgementPayment[];
  note: string;
};

/**
 * Where this job stands for the receipt.
 *
 * `none`: no receipt for this rider — a GRIDGO Office drop, a job past the
 * door, or one not out yet. `before_arrival`: on the way, arrival not
 * recorded. `at_door`: arrival recorded for this assignment and the handover
 * is not done, which is when the server opens the receipt to this rider. The
 * server still decides; a `403` from it closes the receipt whatever this says.
 */
export type ReceiptStage = "none" | "before_arrival" | "at_door";

type StageOrder = Pick<Order, "state" | "fulfillmentMode" | "deliveryEvidence" | "deliveryMilestones">;

export function receiptStage(order: StageOrder | null | undefined): ReceiptStage {
  if (!order || endsAtOffice(order)) return "none";
  if (order.state !== "picked_up" && order.state !== "out_for_delivery") return "none";
  if (order.deliveryEvidence?.recordedAt) return "none";
  return arrivalRecorded(order.deliveryMilestones) ? "at_door" : "before_arrival";
}

function arrivalRecorded(milestones: DeliveryMilestone[] | undefined): boolean {
  const arrived = milestones?.find((milestone) => milestone.code === "arrived");
  return arrived?.status === "completed" && Boolean(arrived.at);
}

/** Pesos as the rest of the app writes them. */
export const receiptMoney = formatPhp;

/** A discount, written as the deduction it is. */
export function receiptDeduction(minor: number): string {
  return `−${formatPhp(minor)}`;
}

/** The rounding adjustment keeps its sign, either way. */
export function receiptSigned(minor: number): string {
  return minor < 0 ? `−${formatPhp(-minor)}` : `+${formatPhp(minor)}`;
}

/** The issue time on Davao's clock; the API stores UTC. */
export function receiptIssuedLabel(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "Not recorded";
  return at.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** The rows under the items, in order, with zero discounts and rounding left out. */
export function receiptAdjustments(
  receipt: Pick<
    AcknowledgementReceipt,
    "deliveryFeeMinor" | "organizationDiscountMinor" | "voucherDiscountMinor" | "roundingAdjustmentMinor"
  >,
): { label: string; value: string }[] {
  const rows = [{ label: "Delivery fee", value: receiptMoney(receipt.deliveryFeeMinor) }];
  if (receipt.organizationDiscountMinor) {
    rows.push({ label: "Organization discount", value: receiptDeduction(receipt.organizationDiscountMinor) });
  }
  if (receipt.voucherDiscountMinor) {
    rows.push({ label: "Voucher discount", value: receiptDeduction(receipt.voucherDiscountMinor) });
  }
  if (receipt.roundingAdjustmentMinor) {
    rows.push({ label: "Rounding adjustment", value: receiptSigned(receipt.roundingAdjustmentMinor) });
  }
  return rows;
}

/**
 * The recorded method, in the downloadable copy's words so the paper and the
 * client's PDF agree. `qr_manual` proves no wallet, so it never says GCash or
 * Maya; a method this app does not know is named by its kind, not its code.
 */
const METHOD_LABELS: Record<string, string> = {
  qr_manual: "Digital payment (manual QR)",
  gcash: "GCash",
  maya: "Maya",
  bank_transfer: "Bank transfer",
  qr_ph: "QR Ph",
  cash: "Cash",
};

export function paymentMethodLabel(payment: Pick<AcknowledgementPayment, "method" | "type">): string {
  if (payment.method && METHOD_LABELS[payment.method]) return METHOD_LABELS[payment.method];
  if (payment.type === "digital") return "Digital payment";
  if (payment.type === "cash") return "Cash";
  return "Payment method not recorded";
}

/** Which installment, when a receipt lists more than one. */
const PAYMENT_STAGES: Record<string, string> = {
  initial: "Initial payment",
  downpayment: "Downpayment",
  final_online: "Final payment",
  balance: "Balance payment",
};

export function paymentStageLabel(code: string): string {
  return PAYMENT_STAGES[code] ?? "Payment";
}

export type ReceiptProblem = {
  /**
   * `closed`: outside this rider's window — drop the receipt and re-read the
   * job. `unsupported`: the server has no receipt route yet. `retry`: worth
   * another go once the reason clears. `gone`: the job no longer exists.
   */
  kind: "closed" | "unsupported" | "retry" | "gone";
  title: string;
  body: string;
};

const CLOSED: ReceiptProblem = {
  kind: "closed",
  title: "The receipt is closed",
  body:
    "GRIDGO shows the receipt only at the client's door, while you hand this job over. This job has moved on or is no longer yours. Go back to the trip to see where it is now.",
};

/**
 * What a failed receipt read or preparation means for the rider at the door.
 * Every documented code says what to do; nothing code-shaped reaches the screen.
 */
export function receiptProblem(error: unknown): ReceiptProblem {
  const code = apiErrorCode(error);
  const status = error instanceof ApiError ? error.status : null;
  if (status === 403 || code === "forbidden") return CLOSED;
  if (code === "order_not_found") {
    return { kind: "gone", title: "This job is gone", body: riderRefusal(code)!.message };
  }
  if (status === 404 && code !== "acknowledgement_receipt_not_found") {
    // An API older than the receipt answers the route with a bare 404.
    return {
      kind: "unsupported",
      title: "Receipt details are not available yet",
      body:
        "GRIDGO cannot show this receipt on this server yet. Hand over the paper acknowledgement receipt as usual, and call Operations for its details.",
    };
  }
  switch (code) {
    case "acknowledgement_not_available":
      return { ...CLOSED, body: riderRefusal(code)!.message };
    case "acknowledgement_payment_pending":
      return { kind: "retry", title: "Payment not settled", body: riderRefusal(code)!.message };
    case "acknowledgement_amount_unavailable":
    case "acknowledgement_amount_mismatch":
    case "acknowledgement_customer_unavailable":
      return { kind: "retry", title: "GRIDGO could not issue the receipt", body: riderRefusal(code)!.message };
    default:
      return {
        kind: "retry",
        title: "The receipt did not load",
        body:
          status !== null && status >= 500
            ? "GRIDGO could not prepare the receipt. Try again — if it keeps failing, tell Operations the server is failing."
            : "Check this phone's connection and try again. Do not write the receipt from memory.",
      };
  }
}
