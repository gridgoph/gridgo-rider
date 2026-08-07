import { useEffect, useRef, useState } from "react";

import type { LatLng } from "@/lib/geo";
import { isValidLatLng } from "@/lib/geo";
import { fetchRoute, type RouteResult } from "@/lib/osrm";

type Args = {
  from: LatLng | null | undefined;
  to: LatLng | null | undefined;
  /** Skip the network call when false (e.g. off-screen list item). */
  enabled?: boolean;
};

/**
 * Loads an OSRM route between two points, with automatic straight-line
 * fallback. Never throws — trip UI stays usable offline.
 */
export function useRoute({ from, to, enabled = true }: Args) {
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (!enabled || !isValidLatLng(from) || !isValidLatLng(to)) {
      setRoute(null);
      setLoading(false);
      return;
    }

    const id = ++seq.current;
    const controller = new AbortController();
    setLoading(true);

    void (async () => {
      const result = await fetchRoute(from, to, { signal: controller.signal });
      if (id !== seq.current) return;
      setRoute(result);
      setLoading(false);
    })();

    return () => {
      controller.abort();
    };
  }, [from?.lat, from?.lng, to?.lat, to?.lng, enabled]);

  return { route, loading };
}
