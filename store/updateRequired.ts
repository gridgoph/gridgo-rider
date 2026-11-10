import { create } from "zustand";

import { getApiBase, setUpdateRequiredHandler } from "@/lib/api";
import type { AppBuild } from "@/lib/appUpdate";
import { fetchRiderMinimum, isBelowMinimum } from "@/lib/minimumBuild";

/**
 * Whether this build is too old to carry GRIDGO's jobs (`lib/minimumBuild.ts`).
 * In memory only: the minimum is read again on every launch and foreground,
 * and a 426 holds until this build is replaced.
 */
type UpdateRequiredState = {
  /** The build this phone names to GRIDGO; `null` (dev, web, iPhone) is never below a minimum. */
  installed: AppBuild | null;
  /** The published rider minimum from the last read; `null` is no minimum. */
  minimum: number | null;
  /** The API refused a request with `426 app_update_required`. */
  refused: boolean;
  /** A custody screen met a handover flow this build does not know. */
  unknownFlow: boolean;
};

export const useUpdateRequired = create<UpdateRequiredState>(() => ({
  installed: null,
  minimum: null,
  refused: false,
  unknownFlow: false,
}));

/** The one answer the screens read. */
export function updateRequired(state: UpdateRequiredState): boolean {
  return state.refused || state.unknownFlow || isBelowMinimum(state.installed, state.minimum);
}

let reading: Promise<void> | null = null;

/** Read the published minimum. A failed read is "no minimum", never a block. */
export function checkMinimumBuild(
  installed: AppBuild | null,
  { fetchImpl = fetch, apiBase = getApiBase() }: { fetchImpl?: typeof fetch; apiBase?: string } = {},
): Promise<void> {
  useUpdateRequired.setState({ installed });
  if (!installed) return Promise.resolve();
  reading ??= fetchRiderMinimum(fetchImpl, apiBase)
    .then((minimum) => useUpdateRequired.setState({ minimum }))
    .finally(() => {
      reading = null;
    });
  return reading;
}

/** Hear the API's `426 app_update_required` from any request. */
export function bindUpdateRequiredHandler(): () => void {
  return setUpdateRequiredHandler((minimumBuild) => {
    useUpdateRequired.setState((state) => ({
      refused: true,
      minimum: minimumBuild ?? state.minimum,
    }));
  });
}

/** A custody screen found a handover flow this build cannot run. */
export function markUnknownHandoverFlow(): void {
  if (!useUpdateRequired.getState().unknownFlow) useUpdateRequired.setState({ unknownFlow: true });
}

/** Test seam. */
export function resetUpdateRequiredForTests(): void {
  reading = null;
  useUpdateRequired.setState({ installed: null, minimum: null, refused: false, unknownFlow: false });
}
