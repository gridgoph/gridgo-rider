import { useCallback, useRef, useState } from "react";

import * as api from "@/lib/api";
import {
  cashPickFailure,
  pickCashPhoto,
  uploadCashPhoto,
  type CashPhotoAsset,
  type CashPhotoPurpose,
} from "@/lib/cashEvidence";

export type CashPhotoPhase = "none" | "sending" | "stored" | "failed";

/**
 * One cash photo: picked, sent, and held as a file id only once the server
 * has stored it. `stored` is never set before the upload answers, and a new
 * pick drops the old id, so a request can only ever name a file the server
 * confirmed for this capture.
 *
 * In memory only. The camera cache can be reclaimed, so a photo is not
 * promised across a restart; the server's id is what the cash request needs.
 */
export function useCashPhoto(purpose: CashPhotoPurpose, source: "camera" | "library") {
  const [asset, setAsset] = useState<CashPhotoAsset | null>(null);
  const [phase, setPhase] = useState<CashPhotoPhase>("none");
  const [fileId, setFileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const send = useCallback(
    async (next: CashPhotoAsset) => {
      const mine = ++generation.current;
      setPhase("sending");
      setFileId(null);
      setError(null);
      try {
        const id = await uploadCashPhoto(next, purpose);
        if (mine !== generation.current) return;
        setFileId(id);
        setPhase("stored");
      } catch (e) {
        if (mine !== generation.current) return;
        setPhase("failed");
        setError(api.apiErrorMessage(e, "The photo did not reach GRIDGO. Move to a spot with signal and send it again."));
      }
    },
    [purpose],
  );

  const take = useCallback(async () => {
    const picked = await pickCashPhoto(source, purpose.replace(/_/g, "-"));
    if (!picked.ok) {
      const message = cashPickFailure(picked.reason, source);
      if (message) setError(message);
      return;
    }
    setAsset(picked.asset);
    await send(picked.asset);
  }, [source, purpose, send]);

  const retry = useCallback(() => {
    if (asset) void send(asset);
  }, [asset, send]);

  const clear = useCallback(() => {
    ++generation.current;
    setAsset(null);
    setFileId(null);
    setPhase("none");
    setError(null);
  }, []);

  /** The server refused the file it was given (already bound, say): keep the picture, send it again. */
  const forget = useCallback(() => {
    ++generation.current;
    setFileId(null);
    setPhase(asset ? "failed" : "none");
  }, [asset]);

  return { asset, phase, fileId, error, take, retry, clear, forget };
}

export type CashPhoto = ReturnType<typeof useCashPhoto>;
