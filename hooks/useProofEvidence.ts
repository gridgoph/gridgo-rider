import { useCallback, useEffect, useRef, useState } from "react";

import { uploadEvidence, type UploadHandle } from "@/lib/attachments";
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
export function useProofEvidence({ orderId, step }: Args) {
  const [evidence, setEvidence] = useState<ProofEvidence | null>(null);
  const [upload, setUpload] = useState<EvidenceUpload>(UPLOAD_IDLE);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [cameraBlocked, setCameraBlocked] = useState(false);
  const handleRef = useRef<UploadHandle | null>(null);
  const aliveRef = useRef(true);

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
      const handle = uploadEvidence({
        orderId,
        evidence: file,
        onPhase: (phase) => {
          if (!aliveRef.current) return;
          setUpload(phase);
        },
      });
      handleRef.current = handle;
      // Failures are already reported through onPhase; this only stops the
      // rejection from surfacing as an unhandled promise.
      handle.result.catch(() => undefined);
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
    (uri: string) => {
      setCaptureError(null);
      const file = signatureEvidence(uri, Date.now());
      setEvidence(file);
      send(file);
    },
    [send],
  );

  const retry = useCallback(() => {
    if (evidence) send(evidence);
  }, [evidence, send]);

  const clear = useCallback(() => {
    handleRef.current?.cancel();
    handleRef.current = null;
    setEvidence(null);
    setUpload(UPLOAD_IDLE);
    setCaptureError(null);
  }, []);

  return {
    evidence,
    upload,
    captureError,
    /** True once the camera has failed for a reason retrying will not fix. */
    cameraBlocked,
    takePhoto,
    attachSignature,
    retry,
    clear,
  };
}
