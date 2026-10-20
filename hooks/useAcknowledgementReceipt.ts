import { useCallback, useEffect, useRef, useState } from "react";

import { useReadVersion } from "@/hooks/useReadVersion";
import * as api from "@/lib/api";
import {
  receiptProblem,
  type AcknowledgementReceipt,
  type ReceiptProblem,
} from "@/lib/acknowledgementReceipt";

export type ReceiptLoad =
  | { status: "none" }
  | { status: "loading" }
  | { status: "ready"; receipt: AcknowledgementReceipt }
  | { status: "problem"; problem: ReceiptProblem };

/**
 * The acknowledgement receipt for the job at the door, held in memory only.
 *
 * `orderId` is null unless the rider is inside the receipt window
 * (`receiptStage` → `at_door`); the moment it goes null — delivered,
 * cancelled, reassigned, or the screen gone — the receipt is dropped. Nothing
 * here is persisted or logged.
 *
 * Reads first and issues only when nothing is issued yet, so opening the
 * screen again never asks for a number. Issuing twice is safe anyway: the
 * order is the idempotency key and a retry returns the same receipt. A `403`
 * means the server has closed the window; `onClosed` lets the screen re-read
 * the job to learn why.
 */
export function useAcknowledgementReceipt(orderId: string | null, onClosed?: () => void) {
  const [load, setLoad] = useState<ReceiptLoad>(orderId ? { status: "loading" } : { status: "none" });
  const [previousOrderId, setPreviousOrderId] = useState(orderId);
  if (previousOrderId !== orderId) {
    setPreviousOrderId(orderId);
    setLoad(orderId ? { status: "loading" } : { status: "none" });
  }

  const closed = useRef(onClosed);
  useEffect(() => {
    closed.current = onClosed;
  }, [onClosed]);

  const nextRead = useReadVersion();
  const read = useCallback(() => {
    const current = nextRead();
    if (!orderId) return Promise.resolve();
    return api
      .getAcknowledgementReceipt(orderId)
      .catch((e: unknown) => {
        if (api.apiErrorCode(e) !== "acknowledgement_receipt_not_found") throw e;
        if (!current()) return null;
        return api.prepareAcknowledgementReceipt(orderId);
      })
      .then((receipt) => {
        if (!receipt || !current()) return;
        if (receipt.orderId !== orderId) throw new Error("receipt_order_mismatch");
        setLoad({ status: "ready", receipt });
      })
      .catch((e: unknown) => {
        if (!current()) return;
        const problem = receiptProblem(e);
        setLoad({ status: "problem", problem });
        if (problem.kind === "closed" || problem.kind === "gone") closed.current?.();
      });
  }, [orderId, nextRead]);

  const retry = useCallback(() => {
    setLoad({ status: "loading" });
    return read();
  }, [read]);

  useEffect(() => {
    void read();
  }, [read]);

  return { load, retry };
}
