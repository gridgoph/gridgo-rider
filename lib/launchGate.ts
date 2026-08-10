/**
 * Deadlines for the launch path.
 *
 * A rider's first frame waits on two asynchronous things: the typefaces, and
 * the session read back from the phone. Both are fast when they work and
 * neither is guaranteed to answer — a native storage call can sit unresolved,
 * and an asset download over a dev server can stall. When the app treated
 * "not answered yet" as "keep waiting", the result was a permanent blank
 * screen with the splash still up and no way out of it.
 *
 * So nothing in the launch path is allowed to wait forever. Every gate here
 * has a deadline, and every deadline degrades to something the rider can act
 * on: the login screen beats a black rectangle.
 */

/**
 * How long the stored session may take to read back before the app stops
 * waiting on it and treats the rider as signed out.
 *
 * A late answer is still honoured — see `store/session.ts`. The auth gate is
 * continuous, so a session that arrives after this moves the rider off login
 * by itself.
 */
export const SESSION_READ_TIMEOUT_MS = 2_000;

/**
 * How long the whole first frame may be held back before it renders regardless
 * of what is still outstanding.
 *
 * Strictly longer than `SESSION_READ_TIMEOUT_MS`, so in the ordinary stalled
 * case the session gate has already given up and the shell renders with a
 * decided (signed-out) session rather than an undecided one. This is the
 * backstop for anything else the launch path might come to wait on.
 */
export const LAUNCH_RENDER_TIMEOUT_MS = 3_000;

export type LaunchFlags = {
  /** Typefaces loaded, or failed and fallen back to the system font. */
  fontsReady: boolean;
  /** The stored session has been read back, or given up on. */
  sessionHydrated: boolean;
};

/**
 * Whether the app may render its first frame.
 *
 * Normally this is "everything is ready". After the deadline it is "ready or
 * not", because a frame that renders imperfectly can still be used, and one
 * that never renders cannot.
 */
export function isLaunchReady(input: LaunchFlags & { deadlinePassed: boolean }): boolean {
  if (input.deadlinePassed) return true;
  return input.fontsReady && input.sessionHydrated;
}

/**
 * What the launch path is still waiting on, for the development log.
 *
 * Returns null when nothing is outstanding. Names are the rider-irrelevant
 * internals of startup, so this only ever reaches the Metro console.
 */
export function pendingLaunchWork(flags: LaunchFlags): string | null {
  const pending: string[] = [];
  if (!flags.fontsReady) pending.push("fonts");
  if (!flags.sessionHydrated) pending.push("stored session");
  return pending.length ? pending.join(" + ") : null;
}
