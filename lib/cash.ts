import type {
  CashAmounts,
  OperationalSettings,
  Order,
  OrderCashDetail,
  RiderWallet,
  WalletActivity,
} from "@/lib/api";
import { formatPhp, notificationImageUrl } from "@/lib/api";

/**
 * Cash on delivery, as a rider meets it (gridgo-api
 * `docs/CASH_ON_DELIVERY_API.md`, decided 8 Nov 2026, gridgo-api#360).
 *
 * The rider carries cash both ways: they pay the shop its exact price at the
 * counter, and collect the client's exact total at the door. GRIDGO's share is
 * held from their wallet when they accept and taken when they collect, so the
 * rider keeps the rest. Every figure here is the server's snapshot in PHP
 * centavos — this file never computes a share, a split or a total. It only
 * decides what to say about them.
 *
 * Cash ships off. With it off, nothing here offers a top-up or uses the word
 * cash; a wallet that already holds money stays readable.
 */

/** True for a cash-on-delivery order, whatever its stage. */
export function isCashOrder(order: Pick<Order, "cash"> | null | undefined): boolean {
  return order?.cash?.method === "cash";
}

/** The server's four figures, or null when this order is not cash or the rider may not see them. */
export function cashAmountsOf(order: Pick<Order, "cash" | "cashAmounts"> | null | undefined): CashAmounts | null {
  if (!order || !isCashOrder(order)) return null;
  const amounts = order.cashAmounts;
  if (!amounts) return null;
  const whole = [amounts.shopMinor, amounts.collectMinor, amounts.gridgoMinor, amounts.riderMinor];
  return whole.every((value) => Number.isSafeInteger(value) && value >= 0) ? amounts : null;
}

export type CashSlipRow = {
  key: "shop" | "collect" | "voucher" | "gridgo" | "rider";
  label: string;
  /** A short second line under the label, or null. */
  note: string | null;
  minor: number;
  /** How the amount reads: money leaving the rider's hands, arriving, or what they keep. */
  sign: "out" | "in" | "keep";
};

/**
 * The cash job as a slip, in the order the money moves: pay the shop, collect
 * from the client, GRIDGO's share, and what is left — the rider's. A voucher
 * GRIDGO pays for is its own line, because the client hands over that much
 * less than the other three add up to.
 */
export function cashSlipRows(amounts: CashAmounts, receiver: "client" | "host" = "client"): CashSlipRow[] {
  const rows: CashSlipRow[] = [
    { key: "shop", label: "Pay the shop", note: "In cash, at the counter", minor: amounts.shopMinor, sign: "out" },
    receiver === "host"
      ? { key: "collect", label: "Collect from the host", note: "In cash, for the whole group", minor: amounts.collectMinor, sign: "in" }
      : { key: "collect", label: "Collect from the client", note: "In cash, at the door", minor: amounts.collectMinor, sign: "in" },
  ];
  if (amounts.voucherMinor) {
    rows.push({ key: "voucher", label: "Voucher, paid by GRIDGO", note: "Added to your wallet", minor: amounts.voucherMinor, sign: "in" });
  }
  rows.push(
    { key: "gridgo", label: "GRIDGO's share", note: "Taken from your wallet", minor: amounts.gridgoMinor, sign: "out" },
    { key: "rider", label: "You keep", note: null, minor: amounts.riderMinor, sign: "keep" },
  );
  return rows;
}

/** "−₱400.00" / "+₱669.00" — the sign is a word's job too, never colour alone. */
export function signedPesos(minor: number, sign: "out" | "in"): string {
  return `${sign === "out" ? "−" : "+"}${formatPhp(minor)}`;
}

/** What a rider ticks before Accept: they hold the shop's cash now, not later. */
export function shopCashConfirmLabel(amounts: CashAmounts): string {
  return `I have ${formatPhp(amounts.shopMinor)} in cash to pay the shop`;
}

/** What accepting does to the wallet, said before the tap. */
export function walletHoldLine(amounts: CashAmounts, receiver: "client" | "host" = "client"): string {
  return `Accepting holds ${formatPhp(amounts.gridgoMinor)} of your wallet as GRIDGO's share. It is taken when you collect the ${receiver}'s cash, and released if the job does not go ahead.`;
}

/** Where an assigned cash job stands, from `GET /orders/:id/cash`. */
export type CashStage = "pay_shop" | "carry" | "collected" | "returned" | "none";

export function cashStage(
  order: Pick<Order, "cash" | "state"> | null | undefined,
  detail: Pick<OrderCashDetail, "shopPaidAt" | "collectedAt" | "noShowApprovedAt"> | null | undefined,
): CashStage {
  if (!order || !isCashOrder(order)) return "none";
  if (order.cash?.status === "online_repayment_required" || order.cash?.status === "no_show_repaid") return "returned";
  if (!detail) return "none";
  if (detail.noShowApprovedAt) return "returned";
  if (detail.collectedAt) return "collected";
  if (!detail.shopPaidAt) return order.state === "rider_assigned" ? "pay_shop" : "none";
  return "carry";
}

/**
 * One key per intent. A retry of the same tap reuses it, so a reply lost on a
 * weak signal returns the first answer instead of moving money twice.
 */
export function newIdempotencyKey(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  const tail = uuid ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `rider-${prefix}-${tail}`.slice(0, 120);
}

/**
 * One accept per offer: the offer id is the intent, so a retry after a lost
 * reply returns the first answer and never holds GRIDGO's share twice.
 */
export function cashAcceptKey(offerId: string): string {
  return `rider-accept-${offerId}`.slice(0, 120);
}

/** Cash is on only when the server says so. An older API without the setting is off. */
export function cashEnabled(settings: Pick<OperationalSettings, "cash"> | null | undefined): boolean {
  return settings?.cash?.enabled === true;
}

/** A QR sits on white in both themes: a scanner reads dark modules on light paper. */
export const QR_PAPER = "#FFFFFF";

/** GRIDGO's receiving QR as a URL this phone can load, or null when none is active. */
export function paymentQrUrl(settings: Pick<OperationalSettings, "paymentQr"> | null | undefined): string | null {
  return notificationImageUrl(settings?.paymentQr?.imageUrl ?? null);
}

/** The amount chips, from the server, in pesos order. Falls back to the documented three. */
export function topupAmounts(wallet: Pick<RiderWallet, "topupAmountsMinor"> | null | undefined): number[] {
  const listed = (wallet?.topupAmountsMinor ?? []).filter((minor) => Number.isSafeInteger(minor) && minor > 0);
  return (listed.length ? listed : [20_000, 50_000, 100_000]).slice().sort((a, b) => a - b);
}

/** "₱500" — a chip says a round amount without centavos. */
export function chipPesos(minor: number): string {
  return minor % 100 === 0 ? `₱${(minor / 100).toLocaleString("en-PH")}` : formatPhp(minor);
}

/** A reference as the server will store it: trimmed and upper case, 1–120 characters. */
export function normaliseReference(text: string): string {
  return text.trim().toUpperCase();
}

export function topupBlockReason(input: { amountMinor: number | null; reference: string; screenshot: "none" | "sending" | "stored" | "failed" }): string | null {
  if (input.amountMinor == null) return "Choose how much you sent.";
  const reference = normaliseReference(input.reference);
  if (!reference) return "Type the reference number from your payment app.";
  if (reference.length > 120) return "That reference is too long. Check it against your payment app.";
  if (input.screenshot === "sending") return "Wait for the screenshot to finish sending.";
  return null;
}

export type TopupStatus = "pending" | "confirmed" | "rejected";

export type WalletRow = {
  id: string;
  at: string;
  title: string;
  /** Secondary line: a reference, or what the movement was for. */
  detail: string | null;
  /** The signed change to spendable money, or null when only cash in hand moved. */
  deltaMinor: number | null;
  /** Cash that changed hands outside the wallet (paid at the counter, collected at the door). */
  cashMinor: number | null;
  topup: TopupStatus | null;
  icon: "topup" | "hold" | "release" | "share" | "cash" | "credit" | "claim";
};

const TITLES: Record<string, { title: string; icon: WalletRow["icon"] }> = {
  wallet_reserved: { title: "Held for a cash job", icon: "hold" },
  wallet_released: { title: "Hold released", icon: "release" },
  gridgo_share_debited: { title: "GRIDGO's share taken", icon: "share" },
  shop_paid: { title: "Paid the shop", icon: "cash" },
  cash_collected: { title: "Collected from the client", icon: "cash" },
  no_show_returned: { title: "Shop payment returned to you", icon: "credit" },
  no_show_repaid: { title: "Fare paid after the client repaid", icon: "credit" },
  voucher_funded: { title: "Voucher paid by GRIDGO", icon: "credit" },
  redelivery_settled: { title: "Redelivery fare", icon: "credit" },
  cash_incident_opened: { title: "Claim opened with the shop", icon: "claim" },
  cash_incident_resolution: { title: "Shop returned your cash", icon: "claim" },
};

/*
  With cash off the history stays — it is the rider's money — but nothing on
  the screen talks about cash jobs. These replace the titles that do.
*/
const TITLES_CASH_OFF: Record<string, string> = {
  wallet_reserved: "Held for a job",
  cash_incident_resolution: "Shop repaid you",
};

/** The marker beside money that moved outside the wallet. */
export function outsideWalletLabel(cashOn: boolean): string {
  return cashOn ? "In cash" : "Outside wallet";
}

const CASH_HANDS = new Set(["shop_paid", "cash_collected", "cash_incident_opened", "cash_incident_resolution"]);

/**
 * The wallet's movements as the rider reads them, newest first.
 *
 * A top-up is one row whatever happened to it: the submission and Operations'
 * decision on it arrive as two movements, paired here by reference (the
 * decision is always the later one). A pending top-up has not changed what the
 * rider can spend, so it shows its amount without a sign.
 */
export function walletRows(activity: readonly WalletActivity[], { cashOn = true }: { cashOn?: boolean } = {}): WalletRow[] {
  const sorted = [...activity].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const decided = new Map<string, WalletActivity[]>();
  for (const row of sorted) {
    if ((row.type === "topup_confirmed" || row.type === "topup_rejected") && row.reference) {
      decided.set(row.reference, [...(decided.get(row.reference) ?? []), row]);
    }
  }
  const rows: WalletRow[] = [];
  for (const row of sorted) {
    if (row.type === "topup_confirmed" || row.type === "topup_rejected") continue;
    if (row.type === "topup_pending") {
      // The newest decision on this reference that came after this submission.
      const decision = [...(decided.get(row.reference ?? "") ?? [])].reverse().find((candidate) => candidate.at >= row.at);
      if (decision) decided.set(row.reference ?? "", (decided.get(row.reference ?? "") ?? []).filter((c) => c !== decision));
      const topup: TopupStatus = !decision ? "pending" : decision.type === "topup_confirmed" ? "confirmed" : "rejected";
      rows.push({
        id: row.id,
        at: decision?.at ?? row.at,
        title: "Top-up",
        detail: row.reference ? `Ref ${row.reference}` : null,
        deltaMinor: topup === "confirmed" ? row.amountMinor : null,
        cashMinor: topup === "confirmed" ? null : row.amountMinor,
        topup,
        icon: "topup",
      });
      continue;
    }
    const known = TITLES[row.type] ?? { title: "Wallet change", icon: "credit" as const };
    const delta = row.availableDeltaMinor || row.balanceDeltaMinor || 0;
    rows.push({
      id: row.id,
      at: row.at,
      title: (!cashOn && TITLES_CASH_OFF[row.type]) || known.title,
      detail: null,
      deltaMinor: CASH_HANDS.has(row.type) || delta === 0 ? null : delta,
      cashMinor: CASH_HANDS.has(row.type) || delta === 0 ? row.amountMinor : null,
      topup: null,
      icon: known.icon,
    });
  }
  return rows;
}

/** "+₱500.00" or "−₱22.30". */
export function deltaLabel(minor: number): string {
  return minor < 0 ? `−${formatPhp(-minor)}` : `+${formatPhp(minor)}`;
}

export function topupStatusChip(status: TopupStatus): {
  label: string;
  tone: "success" | "warning" | "error";
  icon: "circle-check" | "clock" | "circle-x";
} {
  switch (status) {
    case "confirmed":
      return { label: "Added", tone: "success", icon: "circle-check" };
    case "rejected":
      return { label: "Not found", tone: "error", icon: "circle-x" };
    default:
      return { label: "Checking", tone: "warning", icon: "clock" };
  }
}

/**
 * What the server's records say about this phone's no-show record for a job.
 *
 * - `clear`: the no-show is over — the client's cash was collected, Operations
 *   approved the return, or the job is no longer this rider's to deliver.
 * - `adopt`: the server projects the wait and report (`noShowStartedAt`,
 *   `noShowReportedAt`) and they differ from the phone — including both null
 *   after Operations rejected a report, which lets the rider wait again or
 *   collect.
 * - `keep`: nothing on the server contradicts the phone. On a projection
 *   without those two fields a rejected report cannot be told apart from a
 *   pending one, so the phone keeps what it saw rather than guess.
 */
export function noShowFromServer(
  local: CashNoShowLike | undefined,
  order: Pick<Order, "riderId" | "state" | "cash"> | null,
  detail: Pick<OrderCashDetail, "collectedAt" | "noShowApprovedAt" | "noShowStartedAt" | "noShowReportedAt"> | null,
  riderId: string | null,
): { kind: "keep" } | { kind: "clear" } | { kind: "adopt"; record: CashNoShowLike } {
  if (!order || !detail) return { kind: "keep" };
  const mine = Boolean(riderId) && order.riderId === riderId && ACTIVE_DELIVERY.has(order.state);
  if (!mine || detail.collectedAt || detail.noShowApprovedAt || order.cash?.status === "online_repayment_required") {
    return local ? { kind: "clear" } : { kind: "keep" };
  }
  const knowsReport = "noShowReportedAt" in detail;
  const knowsStart = "noShowStartedAt" in detail;
  if (!knowsReport && !knowsStart) return { kind: "keep" };
  const reportedAtMs = timeOf(detail.noShowReportedAt);
  const startedAtMs = knowsStart ? timeOf(detail.noShowStartedAt) : (local?.startedAtMs ?? reportedAtMs);
  // No wait on the server, or a report this phone sent that the server no
  // longer holds: Operations rejected it and cleared the wait with it.
  if (startedAtMs == null || (knowsReport && reportedAtMs == null && local?.reportedAtMs)) {
    return local ? { kind: "clear" } : { kind: "keep" };
  }
  const record = {
    startedAtMs,
    contactMethod: local?.contactMethod ?? null,
    reportedAtMs: knowsReport ? reportedAtMs : (local?.reportedAtMs ?? null),
  };
  if (local && local.startedAtMs === record.startedAtMs && local.reportedAtMs === record.reportedAtMs) return { kind: "keep" };
  return { kind: "adopt", record };
}

function timeOf(value: string | null | undefined): number | null {
  const ms = value ? Date.parse(value) : NaN;
  return Number.isFinite(ms) ? ms : null;
}

type CashNoShowLike = { startedAtMs: number; contactMethod: "call" | "message" | null; reportedAtMs: number | null };
const ACTIVE_DELIVERY = new Set(["rider_assigned", "picked_up", "out_for_delivery"]);

/** Seconds left on the no-show wait, never below zero. Null before the wait starts. */
export function noShowSecondsLeft(startedAtMs: number | null, waitSeconds: number, nowMs: number): number | null {
  if (startedAtMs == null || !Number.isFinite(startedAtMs)) return null;
  return Math.max(0, Math.ceil((startedAtMs + waitSeconds * 1000 - nowMs) / 1000));
}

/** "10 minutes" — how the wait is said before it starts. */
export function waitMinutesLabel(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (seconds < 60) return `${seconds} seconds`;
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

/** Why the no-show report cannot be sent yet, or null. */
export function noShowReportBlockReason(input: {
  secondsLeft: number | null;
  reason: string;
  photo: "none" | "sending" | "stored" | "failed";
}): string | null {
  if (input.secondsLeft == null) return "Call or message the client first, then start the wait.";
  if (input.secondsLeft > 0) return "Stay at the door until the wait ends.";
  if (input.photo !== "stored") {
    return input.photo === "sending" ? "Wait for the photo to finish sending." : "Take a photo of the door or gate where you waited.";
  }
  if (!input.reason.trim()) return "Say in one sentence what happened.";
  return null;
}
