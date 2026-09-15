# Clerk Rider Authentication Implementation Plan

> Historical implementation checklist. Current authentication policy is owned by
> [AGENTS.md — Authentication](../../../AGENTS.md#authentication); this plan is not
> an instruction to restore the earlier invitation-only or metadata-based gate.

**Dependency versions:** See [package.json](../../../package.json).

## Global Constraints

- Follow the versioned Expo documentation linked in [AGENTS.md](../../../AGENTS.md).
- Use `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`; never hardcode a key or expose `CLERK_SECRET_KEY`.
- Store Clerk tokens only through `@clerk/expo/token-cache`, never AsyncStorage.
- Membership checks follow [AGENTS.md — Authentication](../../../AGENTS.md#authentication).
- Preserve the existing `__DEV__` demo login and local API surface.
- Public application policy follows [AGENTS.md — Authentication](../../../AGENTS.md#authentication).
- Keep light/dark labels and workflows identical and use GRIDGO tokens/NativeWind.
- Do not add Facebook because the linked instance does not enable it.

---

### Task 1: Auth policy and API token source

**Files:**
- Create: `lib/clerkAuth.ts`
- Create: `lib/__tests__/clerkAuth.test.ts`
- Modify: `lib/api.ts`
- Modify: `store/session.ts`
- Test: `lib/__tests__/clerkAuth.test.ts`

**Interfaces:**
- Current role resolution and token sourcing live in `hooks/useClerkSessionBridge.ts` and `lib/api.ts`.
- Produces Clerk-session adoption and invalidation methods while preserving legacy persistence.

- Current membership regression coverage: `hooks/__tests__/clerkMembership.test.tsx`.
- [ ] Run the focused test and confirm it fails because the policy module does not exist.
- [ ] Implement the pure role policy and fresh token provider.
- [ ] Extend the Zustand session with explicit `legacy | clerk` ownership and role-safe Clerk adoption.
- [ ] Run focused store/policy/API tests.

### Task 2: Provider, launch bridge, and route gate

**Files:**
- Create: `hooks/useClerkSessionBridge.ts`
- Modify: `app/_layout.tsx`
- Modify: `app/index.tsx`
- Modify: `lib/launchGate.ts`
- Modify: `__tests__/startupNeverHangs.test.tsx`

**Interfaces:**
- Current bridge inputs and readiness semantics live in [hooks/useClerkSessionBridge.ts](../../../hooks/useClerkSessionBridge.ts).

- [ ] Add startup assertions for a stalled Clerk load.
- [ ] Confirm the new startup assertion fails.
- [ ] Mount `ClerkProvider` with `tokenCache` and connect the bridge.
- [ ] Extend the bounded launch gate so Clerk can never create a blank screen.
- [ ] Run startup and auth-gate tests.

### Task 3: Authentication UI

The original invitation-only UI plan is superseded by
[AGENTS.md — Authentication](../../../AGENTS.md#authentication).

### Task 4: Expo configuration and dependencies

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `app.json`
- Modify: `__tests__/configPlugins.test.ts`

**Interfaces:**
- Registers `@clerk/expo` and `expo-secure-store`; uses the existing `gridgorider` deep-link scheme for browser SSO.

- Dependency alignment follows [AGENTS.md](../../../AGENTS.md#push-notifications).
- [ ] Verify the installed Clerk package exports and TypeScript declarations before finalizing hook calls.
- [ ] Add config-plugin assertions, then register both plugins.
- [ ] Run config tests and `npx expo config --type public` without printing secret values.

### Task 5: Full verification and delivery

**Files:**
- Modify only files required by verification findings.

**Interfaces:**
- Produces a reviewable direct PR on `fm/gridgo-rider-clerk`.

- [ ] Run focused tests, full Jest, `npx tsc --noEmit`, and `npm run lint`.
- [ ] Export development and production bundles for required platforms.
- [ ] Scan tracked files and bundles for `CLERK_SECRET_KEY`, development secret values and missing production publishable-key handling.
- [ ] Inspect rendered light/dark authentication screens where browser rendering is available.
- [ ] Run `/home/kali/firstmate/bin/fm-ensure-agents-md.sh .` and retain only durable project guidance.
- [ ] Review the complete diff, commit, push only `fm/gridgo-rider-clerk`, and open a direct PR with `gh-axi`.
