import { useEffect, useMemo, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { useRiderAction } from "@/hooks/useRiderAction";
import { useRiderLocation } from "@/hooks/useRiderLocation";
import {
  arrivalCopy,
  claimArrivalNotice,
  claimArrivalSheet,
  shouldAnnounceArrival,
} from "@/lib/arrival";
import { presentArrivalNotification } from "@/lib/arrivalNotify";
import { classifyLocation } from "@/lib/locationFreshness";
import { nextStop } from "@/lib/tripNav";
import { useActiveTrip } from "@/store/activeTrip";
import { askConfirm, useSheets } from "@/store/sheets";

/** How often a live fix is re-aged so a parked phone cannot keep saying "arrived". */
const FRESHNESS_TICK_MS = 5_000;

/**
 * Tell the rider they have reached the next stop.
 *
 * Mounted once from the root shell so it still fires on Offers, on the city
 * map, and on the full-screen trip map — arrival is about where the phone is,
 * not which tab is open.
 *
 * The pop-out is GRIDGO's own confirmation sheet, never a drawn overlay. A local
 * notification covers the phone-in-pocket case; while GRIDGO is in front the
 * existing foreground handler stays silent so a banner does not sit on top of
 * the sheet. Each stop on a job is announced at most once.
 */
export function useArrivalAlert(): void {
  const trip = useActiveTrip((s) => s.order);
  const { phase } = useRiderAction();
  const heading = trip ? nextStop(trip, phase) : null;

  const needsGps = Boolean(trip) && phase !== "complete" && phase !== "idle";
  const riderLocation = useRiderLocation({ enabled: needsGps });

  const [now, setNow] = useState(() => Date.now());
  const [appState, setAppState] = useState<AppStateStatus>(
    () => AppState.currentState,
  );
  const confirmBusy = useSheets((s) => Boolean(s.confirm));
  const presenting = useRef(false);

  useEffect(() => {
    const sub = AppState.addEventListener("change", setAppState);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!needsGps) return;
    const handle = setInterval(() => setNow(Date.now()), FRESHNESS_TICK_MS);
    return () => clearInterval(handle);
  }, [needsGps]);

  const freshness = useMemo(
    () =>
      classifyLocation({
        fixAtMs: riderLocation.fixAtMs,
        nowMs: now,
        permission: riderLocation.permission,
        accuracyMetres: riderLocation.accuracy,
      }),
    [
      now,
      riderLocation.accuracy,
      riderLocation.fixAtMs,
      riderLocation.permission,
    ],
  );

  useEffect(() => {
    if (!needsGps || !heading || !trip) return;

    const verdict = shouldAnnounceArrival({
      orderId: trip.id,
      stop: heading,
      rider: riderLocation.coords,
      accuracyMetres: riderLocation.accuracy,
      freshness: freshness.level,
    });
    if (!verdict.inside) return;

    const copy = arrivalCopy(heading);

    if (claimArrivalNotice(verdict.key)) {
      void presentArrivalNotification({
        copy,
        orderId: trip.id,
        kind: verdict.kind,
        key: verdict.key,
      });
    }

    if (appState !== "active") return;
    if (presenting.current || confirmBusy) return;
    if (!claimArrivalSheet(verdict.key)) return;

    presenting.current = true;
    void askConfirm({
      question: copy.question,
      consequence: copy.consequence,
      confirmLabel: copy.confirmLabel,
      cancelLabel: copy.cancelLabel,
    }).finally(() => {
      presenting.current = false;
    });
  }, [
    appState,
    confirmBusy,
    freshness.level,
    heading,
    needsGps,
    riderLocation.accuracy,
    riderLocation.coords,
    trip,
  ]);
}
