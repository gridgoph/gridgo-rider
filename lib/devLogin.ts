/**
 * Local-development sign-in convenience — and the reason it is shaped this way.
 *
 * The rider app's sign-in screen is the first thing a hosted pilot build shows.
 * Prefilling a working account there hands anyone who opens the app a one-tap
 * rider session. Rotating the pilot password does not fix that: the address
 * itself is the disclosure.
 *
 * So the address and password are not hidden behind a runtime flag, an
 * environment variable, or a comment — any of which still ships the literals
 * inside the JavaScript a phone downloads. `__DEV__` is substituted by Metro
 * at bundle time, so in a production build the expression below folds to
 * `null` and the literals are dropped from the emitted bundle entirely.
 *
 * `__tests__/productionBundleNoCredentials.test.ts` greps a real production
 * export to prove it; `lib/__tests__/devLogin.guard.test.ts` keeps every
 * account address in this one module and asserts the guard is the build-time
 * form.
 *
 * Source of truth: the official Clerk rider account. Password still matches
 * `gridgo-api` `src/demo-fixtures.js` (`DEMO_PASSWORD`). Do not revert the
 * address to a `@gridgo.ph` fixture.
 */

export type DevLoginCredentials = {
  email: string;
  password: string;
};

/**
 * Credentials written *inline* inside the live `__DEV__` branch, not hoisted
 * to a module constant. A top-level `const` sits outside the discarded branch
 * and would survive on tree shaking rather than on the guard.
 */
export const DEV_LOGIN: DevLoginCredentials | null = __DEV__
  ? {
      // Official Clerk rider. Password: gridgo-api DEMO_PASSWORD.
      email: "sgeto509@gmail.com",
      password: "Ilovegridgo-0990",
    }
  : null;
