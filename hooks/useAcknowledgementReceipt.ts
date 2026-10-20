import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { useReadVersion } from "@/hooks/useReadVersion";
import * as api from "@/lib/api";
import {
  receiptProblem,
  receiptStage,
  type AcknowledgementReceipt,
  type ReceiptLoad,
  type ReceiptProblem,
} from "@/lib/acknowledgementReceipt";

export type { ReceiptLoad } from "@/lib/acknowledgementReceipt";

type Options = {
  /** The job as the server returned it after the rider recorded arrival. */
  onOrder: (order: api.Order) => void;
  /** Read the job again; true only when a fresh copy was adopted. */
  verify: () => Promise<boolean>;
  /** The server closed the receipt: re-read the job to learn where it went. */
  onClosed: () => void;
};

const UNVERIFIED: ReceiptProblem = {
  kind: "retry",
  title: "The receipt is hidden",
  body:
    "GRIDGO shows it again once it has checked this job is still yours to hand over. Check this phone's connection and try again.",
};

/**
 * The acknowledgement receipt for the job at the door, held in memory only,
 * and only while the rider is looking at the handover.
 *
 * The receipt is open while the job is at the door for this assignment
 * (`receiptStage` → `at_door`), the app is in the foreground and the delivery
 * screen is on top. Leaving any of those drops it at once and orphans any
 * read or arrival still in flight, so a late answer cannot bring it back.
 * Coming back does not restore it either: the job is read again first
 * (`verify`), and until that succeeds the receipt stays hidden — a phone that
 * was away while Operations cancelled or reassigned the job has no business
 * showing the old one. Nothing here is persisted or logged.
 *
 * Reads first and issues only when nothing is issued yet, so opening the
 * screen again never asks for a number. Issuing twice is safe anyway: the
 * order is the idempotency key and a retry returns the same receipt. A `403`
 * means the server has closed the window; `onClosed` re-reads the job to
 * learn why.
 */
export function useAcknowledgementReceipt(order: api.Order | null, { onOrder, verify, onClosed }: Options) {
  const stage = receiptStage(order);
  const orderId = order?.id ?? null;

  const [foreground, setForeground] = useState(
    () => AppState.currentState !== "background" && AppState.currentState !== "inactive",
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => setForeground(state === "active"));
    return () => sub.remove();
  }, []);
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const visible = foreground && focused;

  // Every time the receipt goes out of sight is a new session: whatever the
  // last one held or asked for is dropped, and it reopens only once checked.
  const [session, setSession] = useState(0);
  const [verified, setVerified] = useState(true);
  const [verifyFailed, setVerifyFailed] = useState(false);
  const [wasVisible, setWasVisible] = useState(visible);
  if (wasVisible !== visible) {
    setWasVisible(visible);
    if (!visible) {
      setSession((n) => n + 1);
      setVerified(false);
      setVerifyFailed(false);
    }
  }

  const assignment = order && stage === "at_door" ? `${order.id}|${order.riderId}|${order.riderAssignedAt ?? ""}` : null;
  const openKey = assignment && visible && verified ? `${assignment}#${session}` : null;

  const [held, setHeld] = useState<{ key: string; load: ReceiptLoad } | null>(null);
  if (held && held.key !== openKey) setHeld(null);

  const latest = useRef({ onOrder, verify, onClosed, session });
  useEffect(() => {
    latest.current = { onOrder, verify, onClosed, session };
  }, [onOrder, verify, onClosed, session]);

  const nextRead = useReadVersion();
  const read = useCallback(() => {
    const current = nextRead();
    if (!openKey || !orderId) return Promise.resolve();
    const key = openKey;
    const adopt = (load: ReceiptLoad) => setHeld((now) => (now?.key === key ? { key, load } : now));
    setHeld({ key, load: { status: "loading" } });
    return api
      .getAcknowledgementReceipt(orderId)
      .catch((e: unknown) => {
        if (api.apiErrorCode(e) !== "acknowledgement_receipt_not_found") throw e;
        if (!current()) return null;
        return api.prepareAcknowledgementReceipt(orderId);
      })
      .then((receipt: AcknowledgementReceipt | null) => {
        if (!receipt || !current()) return;
        if (receipt.orderId !== orderId) throw new Error("receipt_order_mismatch");
        adopt({ status: "ready", receipt });
      })
      .catch((e: unknown) => {
        if (!current()) return;
        const problem = receiptProblem(e);
        adopt({ status: "problem", problem });
        if (problem.kind === "closed" || problem.kind === "gone") latest.current.onClosed();
      });
  }, [openKey, orderId, nextRead]);

  useEffect(() => {
    void read();
  }, [read]);

  const inWindow = stage === "before_arrival" || stage === "at_door";
  const checking = inWindow && visible && !verified && !verifyFailed;
  useEffect(() => {
    if (!checking) return;
    let live = true;
    void latest.current
      .verify()
      .catch(() => false)
      .then((ok) => {
        if (!live) return;
        if (ok) setVerified(true);
        else setVerifyFailed(true);
      });
    return () => {
      live = false;
    };
  }, [checking]);

  const [arriving, setArriving] = useState(false);
  const [arrivalError, setArrivalError] = useState<string | null>(null);
  const arrive = useCallback(async () => {
    if (!orderId || arriving) return;
    const startedIn = latest.current.session;
    setArriving(true);
    setArrivalError(null);
    try {
      const next = await api.recordArrival(orderId);
      // Away in the meantime: the job is read again on the way back instead.
      if (latest.current.session !== startedIn) return;
      latest.current.onOrder(next);
      setVerified(true);
      setVerifyFailed(false);
    } catch (e) {
      if (latest.current.session !== startedIn) return;
      setArrivalError(
        api.tripRefusal(e, "Your arrival was not recorded. Check your connection and try again.").message,
      );
    } finally {
      setArriving(false);
    }
  }, [orderId, arriving]);

  const retry = useCallback(() => {
    if (verifyFailed) {
      setVerifyFailed(false);
      return Promise.resolve();
    }
    return read();
  }, [verifyFailed, read]);

  let load: ReceiptLoad = { status: "none" };
  if (stage === "at_door" && visible) {
    if (verifyFailed) load = { status: "problem", problem: UNVERIFIED };
    else if (!verified) load = { status: "checking" };
    else load = held?.key === openKey ? held.load : { status: "loading" };
  }

  return { stage, load, retry, arrive, arriving, arrivalError };
}
