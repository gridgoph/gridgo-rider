import { useEffect, useRef, useState } from "react";

import {
  isLaunchReady,
  LAUNCH_RENDER_TIMEOUT_MS,
  type LaunchFlags,
  pendingLaunchWork,
} from "@/lib/launchGate";

/**
 * Whether the app may render its first frame — with a deadline on the answer.
 *
 * The root layout renders nothing until this is true, so this hook is the last
 * thing standing between a rider and a blank screen. It therefore refuses to
 * wait indefinitely for anything: once `LAUNCH_RENDER_TIMEOUT_MS` has passed
 * the app renders whatever state it has.
 *
 * In development it also reports how long the launch took and what was still
 * outstanding when it gave up, which is the only way to tell fonts and storage
 * apart from outside the phone.
 */
export function useLaunchReady(flags: LaunchFlags): boolean {
  const [deadlinePassed, setDeadlinePassed] = useState(false);
  const startedAt = useRef(Date.now());
  const reported = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => setDeadlinePassed(true), LAUNCH_RENDER_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  const ready = isLaunchReady({ ...flags, deadlinePassed });

  useEffect(() => {
    if (!__DEV__ || !ready || reported.current) return;
    reported.current = true;

    const elapsed = Date.now() - startedAt.current;
    const stalled = pendingLaunchWork(flags);
    if (stalled) {
      console.warn(
        `[GRIDGO launch] rendering after ${elapsed}ms without ${stalled}. ` +
          "The app degraded rather than waiting; the rider lands on welcome.",
      );
    } else {
      console.log(`[GRIDGO launch] ready in ${elapsed}ms`);
    }
    // `flags` is only read for the one-shot report; `ready` is what gates it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  return ready;
}
