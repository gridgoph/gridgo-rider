import { useEffect, useState } from "react";

import type { LatLng } from "@/lib/geo";
import { ROUTE_SNAP_METRES, snapRouteOrigin } from "@/lib/tripNav";

/**
 * GPS for the road router, held still until the rider has moved ~80 m.
 * The live pin on the map still uses the unsnapped fix.
 */
export function useSnappedOrigin(live: LatLng | null | undefined): LatLng | null {
  const [origin, setOrigin] = useState<LatLng | null>(null);

  useEffect(() => {
    setOrigin((previous) => snapRouteOrigin(live ?? null, previous, ROUTE_SNAP_METRES));
  }, [live?.lat, live?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  return origin;
}
