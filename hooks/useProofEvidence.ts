import { useCallback, useEffect, useRef, useState } from "react";

import {
  uploadEvidence,
  type EvidenceTarget,
  type StoredEvidence,
  type UploadHandle,
} from "@/lib/attachments";
import { type EvidenceUpload, type ProofEvidence, UPLOAD_IDLE } from "@/lib/proofEvidence";
import {
  captureFailureMessage,
  captureProofPhoto,
  signatureEvidence,
  type CaptureStep,
} from "@/lib/proofPhoto";

type Args = {
  orderId: string;
  step: CaptureStep;
  /** Every purpose this capture must be stored under before it counts. */
  targets: readonly EvidenceTarget[];
};

/**
 * Capture-and-send for one piece of proof.
 *
 * The rider never presses "upload": capturing starts the transfer, because a
 * separate send step is one more thing to forget at the door. What they do
 * control is retrying, retaking, and — when the camera will not run — signing
 * instead.
 *
 * A capture is deliberately not saved into the proof draft. The camera writes
 * to a cache the system may reclaim, so an app restart cannot promise the file
 * is still there — and offering a photo that no longer exists is exactly the
 * kind of claim this flow is here to stop.
 *
 * `upload.phase === "stored"` is the only state that means the server has the
 * file. Nothing here ever sets it optimistically.
 */
export function useProofEvidence({ orderId, step, targets }: Args) {
  const [evidence, setEvidence] = useState<ProofEvidence | null>(null);
  const [upload, setUpload] = useState<EvidenceUpload>(UPLOAD_IDLE);
  const [stored, setStored] = useState<StoredEvidence>({});
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [cameraBlocked, setCameraBlocked] = useState(false);
  const handleRef = useRef<UploadHandle | null>(null);
  const aliveRef = useRef(true);
  // Targets are a literal at every call site; holding the latest in a ref keeps
  // `send` stable without asking each screen to memoise its array.
  const targetsRef = useRef(targets);
  targetsRef.current = targets;

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      handleRef.current?.cancel();
    };
  }, []);

  const send = useCallback(
    (file: ProofEvidence) => {
      handleRef.current?.cancel();
      setStored({});
      const handle = uploadEvidence({
        orderId,
        evidence: file,
        targets: targetsRef.current,
        onPhase: (phase) => {
          if (!aliveRef.current) return;
          setUpload(phase);
        },
      });
      handleRef.current = handle;
      // Failures are already reported through onPhase; this only stops the
      // rejection from surfacing as an unhandled promise.
      handle.result
        .then((ids) => {
          if (aliveRef.current) setStored(ids);
        })
        .catch(() => undefined);
    },
    [orderId],
  );

  const takePhoto = useCallback(async () => {
    setCaptureError(null);
    const outcome = await captureProofPhoto(step);
    if (!outcome.ok) {
      setCaptureError(captureFailureMessage(outcome.reason));
      setCameraBlocked(outcome.reason !== "cancelled");
      return;
    }
    setCameraBlocked(false);
    setEvidence(outcome.evidence);
    send(outcome.evidence);
  }, [send, step]);

  const attachSignature = useCallback(
    async (uri: string) => {
      setCaptureError(null);
      try {
        const file = await signatureEvidence(uri, Date.now(), step);
        setEvidence(file);
        send(file);
      } catch {
        setCaptureError("Could not read that signature. Capture it again.");
      }
    },
    [send, step],
  );

  const retry = useCallback(() => {
    if (evidence) send(evidence);
  }, [evidence, send]);

  const clear = useCallback(() => {
    handleRef.current?.cancel();
    handleRef.current = null;
    setEvidence(null);
    setUpload(UPLOAD_IDLE);
    setStored({});
    setCaptureError(null);
  }, []);

  return {
    evidence,
    upload,
    /** File ids the server confirmed, keyed by purpose. Empty until stored. */
    stored,
    captureError,
    /** True once the camera has failed for a reason retrying will not fix. */
    cameraBlocked,
    takePhoto,
    attachSignature,
    retry,
    clear,
  };
}
