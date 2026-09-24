# Expo SDK 57

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

You are an expert React Native and Expo engineer helping me build GRIDGO.

Write clean, simple, maintainable code. Prioritize clarity over unnecessary abstraction.

Think like a senior mobile developer.

---

## Project Overview

This repo is **GRIDGO Rider** — the rider mobile app for a Davao City managed-printing marketplace. It covers public rider apply, Operations approval, dispatch accept, navigation, the six-point pickup check, delivery evidence, and active-trip location sharing.

GRIDGO ships one app per role. Client, Supplier, Operations, and Super Admin surfaces live in separate codebases. Do not put client request flows, supplier production, or Operations QA into this binary.

The app includes:

- Public rider self-signup, and an honest "not dispatchable until approved" state. Clerk invitation accept remains as a secondary path.
- Dispatch offer accept
- Navigate to supplier for pickup and client for delivery
- The six-point pickup check, its escalation, and the spoken sign-off
- Delivery evidence (photo, or signature when the camera cannot be used)
- Active-trip location pings (live GPS while package is with the rider)

**No cash.** Operational model v2 removed cash on delivery outright — the captain's risk decision about riders carrying the client's balance. There is no cash screen, no COD path, and no peso figure on any screen except the rider's own earnings and, as secondary detail, the gross delivery fee they are a share of. Do not reintroduce one.

**Cross-cutting**

- Auth via Clerk for Google, recovery, and invitation tickets, with password apply and sign-in through the domain API while `AUTH_MODE` is legacy. Role must be `rider`.
- Light and Dark themes with identical labels, states, and workflows.
- Shared design tokens with the client starter (`constants/theme.ts`, `global.css`, logo assets).


## Tech Stack

- Expo
- React Native
- TypeScript
- Expo Router
- NativeWind
- Zustand
- AsyncStorage
- Clerk Expo + SecureStore for production identity sessions
- Zustand for client session state
- Clerk auth + the local **domain API** via `gridgo-api`

Do not introduce new major libraries unless there is a strong reason. Ask before installing anything new.

---


## MVP stack (current phase)

Clerk supplies identity and session JWTs. Supabase, PayMongo, and other production SaaS are not part of this MVP.

Every screen that needs network uses **`lib/api.ts`** against the shared local **`gridgo-api`**:

- **Clerk auth** — Google, recovery, and Operations invitation tickets. Clerk tokens use SecureStore and flow through `lib/api.ts`; rider membership follows [Authentication](#authentication). Password apply and sign-in use the domain API (`POST /auth/signup`, `POST /auth/login`) while `AUTH_MODE` is still `legacy`. Do not flip `AUTH_MODE` from this app.
- **Custom domain API** — orders, dispatch, pickup checklist, delivery evidence, files, settings, notifications.
- **Zustand** — session and feature stores (not React Context for global session).
- **Money** — PHP minor units only, formatted at the edge. The only figures this app renders are the rider's earnings and the gross fee beside them, both read through `riderPay` in `lib/riderPay.ts` (see *Earnings* below).
- **Contract** — `gridgo-api` `docs/OPERATIONAL_MODEL_V2_API.md` is authoritative for routes, states, transitions and role projections; `docs/STORAGE_API.md` for file bytes. Read them before changing a call site rather than inferring from the app.
- **Stable API surface** — feature call sites continue through `lib/api.ts`; auth chooses a fresh Clerk bearer or the development-only legacy bearer there.
- **API base** — `getApiBase()` / `resolveApiBase()` in `lib/api.ts`. Precedence: `EXPO_PUBLIC_API_URL` → Expo dev-server hostname from `expo-constants` + `EXPO_PUBLIC_API_PORT` (default `8787`) → Android emulator `10.0.2.2` when that host is loopback → `127.0.0.1`. Do not hardcode a LAN IP; a physical device inherits the host it loaded the bundle from. Unit tests: `lib/__tests__/apiBase.test.ts`.
- **Development commands:** [README — Scripts](README.md#scripts) owns Expo Go, USB development-client, and Firebase setup. Guarded by `__tests__/devClientScripts.test.ts`. Navigation types come from `expo-router` (`expo-router/js-tabs`, `expo-router/react-navigation`), not from a direct `@react-navigation/*` dependency.
- **Pointing a build at a hosted API is configuration, never code.** Set `EXPO_PUBLIC_API_URL` in the build environment — `EXPO_PUBLIC_API_URL=https://your-api.example npx expo export`, or an EAS build profile's `env`. It wins over every other step, on every platform, including the Android loopback rewrite (asserted for the whole matrix in `apiBase.test.ts`). `EXPO_PUBLIC_*` values are **inlined by Babel at bundle time**, not read at runtime, so the variable has to be set for the command that builds the bundle; setting it only on the server that serves it does nothing. Verify a real build rather than trusting the config: the URL appears as a literal in the exported Hermes bundle and the name `EXPO_PUBLIC_API_URL` does not. Never commit the domain to the repo.

Product scope for this binary: **`PRD.md`**. Fleet blueprint: `gridgo-tinker`.

## Development Philosophy

Build feature by feature.

For every feature:

1. Read this file first.
2. Keep the implementation simple.
3. Avoid overengineering.
4. Prefer readable code over clever code.
5. Build the smallest useful version first.
6. Refactor only when repetition appears.

---

## Decision Making

If something is unclear or could be improved, suggest a better approach. If a new library would significantly help, recommend it, explain why, and ask before adding it.

Do not install new libraries without approval.

---

## Architecture

Use this folder structure:

```
app/
  (auth)/
  (tabs)/
components/
constants/
data/
hooks/
lib/
store/
types/
assets/
```

**app/** is for routes and screens only. Screens compose components and call hooks or stores. They should not contain large reusable UI blocks or business logic.

**components/** is for reusable UI. Create a component when it is reused in multiple places, when it makes a screen easier to read, or when it represents a clear UI concept. Examples for this app: `PrimaryButton`, `SecondaryButton`, `StatusChip`, `DispatchCard`, `ProofCapture`, `LocationPingBadge`, `CountdownTimer`, `EmptyState`. Do not create components too early.

**data/** holds hardcoded content. Keep it typed.

**store/** holds Zustand stores. Examples of state to keep here: session, theme preference (`system` | `light` | `dark`), the in-progress print request draft (product, size, material, quantity, deadline, address, uploaded artwork), cart/reorder items, order list and selected order, active delivery tracking as received (rider location, ETA, last-updated timestamp, stale flag), and the unread notification count. Persist with AsyncStorage when needed — theme preference, session, and the request draft are worth persisting. Never persist rider location or ETAs; they are someone else's live data and go stale the moment the app is backgrounded.

**lib/** holds external service helpers (clerk.ts, api.ts, cn.ts). Never expose secret keys here.

---

## UI Rules

For any UI task:

- Replicate the provided design exactly.
- Match layout, spacing, padding, font sizes, font hierarchy, colors, border radius, shadows, alignment, and proportions.
- Do not approximate. Do not simplify unless explicitly asked.

---

## Design Tokens

This section is the source of truth for GRIDGO's visual system. When a mockup is provided for a screen, replicate it exactly — the tokens below are what it is built from.

Define tokens once in `constants/theme.ts` and consume them by semantic name. Never hard-code a hex value in a screen or component.

### Color

| Token | Light | Dark | Use |
|---|---:|---:|---|
| `canvas` | `#F8F8F8` | `#000000` | Screen background |
| `surface` | `#FFFFFF` | `#141414` | Cards, sheets, navigation |
| `surfaceVariant` | `#F0F0F0` | `#1E1E1E` | Inactive panels, grouping |
| `surfaceHigh` | `#FFFFFF` | `#2A2A2A` | Selected/elevated panel |
| `textPrimary` | `#1A1A1A` | `#F0F0F0` | Headings and core data |
| `textSecondary` | `#4A4A4A` | `#CCCCCC` | Supporting text |
| `textMuted` | `#7A7A7A` | `#808080` | Metadata, inactive labels |
| `outline` | `#DCDCDC` | `#2E2E2E` | Cards, fields, dividers |
| `outlineSubtle` | `#EEEEEE` | `#1E1E1E` | Quiet divider |
| `accent` | `#1A1A1A` | `#F0F0F0` | Monochrome structural control |
| `accentOn` | `#FFFFFF` | `#000000` | Text/icon on accent |
| `brand` | `#D4A017` | `#FFDE58` | Small links and badges, "View all" |
| `actionYellow` | `#FFDE58` | `#FFDE58` | Primary CTA, current step, active nav, map route |
| `success` | `#2E7D32` | `#66BB6A` | Approved, completed |
| `error` | `#C62828` | `#EF5350` | Blocked, failed |
| `warning` | `#F57F17` | `#FFCA28` | Risk, attention |
| `info` | `#1565C0` | `#42A5F5` | Informational, support |

### The yellow rule

`actionYellow` is a finite attention budget, not a brand fill. This is the rule most easily broken and the one that most changes how the product reads.

- One primary CTA per screen or bounded panel. Nothing else.
- Also allowed: the active stepper step, the selected bottom-nav item, and the map route/highlight.
- Also allowed: the rider's own earnings, only through `components/EarningAmount.tsx` — a highlighter band behind dark digits in Light (yellow text fails contrast on white), yellow digits with no band in Dark (`earning-ink` / `earning-mark` tokens). Never a filled box, so it cannot read as a second CTA. A cancelled job's fee was not earned and stays unmarked.
- Navigation, secondary buttons, filters, inputs, tabs, and routine controls stay black/white/charcoal.
- Yellow buttons use black text and a clear verb.
- No yellow page backgrounds and no large black slabs in Light. In Dark, cards must stay visibly elevated from the canvas — never let a surface disappear into black.

### Status

Color never carries meaning alone. Every status is **icon + label + color**: "Approved", "Blocked", "Needs correction", "Last updated 3 min ago". A screen must stay fully readable in grayscale.

### Type

Satoshi for all UI. The four cuts in `assets/fonts/` are embedded at prebuild by the `expo-font` config plugin `fonts` array in `app.json` (Android family name = filename without extension) and loaded at runtime for Expo Go by `useFonts` in `hooks/useAppFonts.ts`. A bare `"expo-font"` plugin string embeds nothing, and a release APK then falls back to the system UI font. Names live in `constants/fonts.ts` — styles must use `Satoshi-Bold`, never `Satoshi` plus a weight. Poppins ExtraBold is brand display only; Instrument Serif is rare decorative text only — never labels, data, or controls.

Scale: display 32/38, H1 28/34, H2 24/30, H3 20/26, body large 16/24, body 14/20, caption 12/16, button 14/20 bold, overline 12/16 medium. Nothing essential goes below 12px.

### Layout and motion

| Token | Value |
|---|---|
| Spacing base | 4px increments; standard gaps 8, 12, 16, 24, 32 |
| Page padding | 16px |
| Radius | Fields 12; cards 12–16; pills 999. Do not mix arbitrary values |
| Elevation | Border first. Use a subtle shadow only when a border cannot carry the separation |
| Touch target | 44 × 44px minimum for every tappable control |
| Motion | 160–240ms ease-out; respect reduced motion |

No essential state may be communicated by animation alone.

### Theme

Light and Dark are the same product with different presentation — identical navigation, labels, states, validation, and workflows. Follow the system preference with an in-app override.

---

## Styling Rules

Use NativeWind classes. Do not use StyleSheet unless it is not possible to style with className.

Use the NativeWind version installed in this project. Check package.json. Do not upgrade without approval.

Reuse class patterns through utilities in global.css.

### className only reaches components NativeWind replaces

Metro aliases `react-native`'s exports to styled ones. A component from any
other package — `SafeAreaView` above all — ignores `className` **silently**: no
error, no warning, and web keeps working because react-native-web hands the
class to the DOM. Losing `flex-1` that way collapsed every screen shell to its
own insets and the app rendered a blank canvas on device while looking correct
in a browser.

So screens open with `components/Screen.tsx`, never a raw `SafeAreaView`, and
any other third-party component gets wrapped once and styled through `style`.
Guarded by `__tests__/screenShell.test.ts`. The wider lesson: a device-only bug
needs a device — Expo web is not a substitute for one, and a clean web render
proves nothing about a phone.

### Style Exception List

Use StyleSheet or inline styles for:

- SafeAreaView (className not supported)
- Any third-party component NativeWind does not replace — `KeyboardAwareScrollView`, `KeyboardStickyView` (same silent-drop trap as SafeAreaView)
- Modal (visible, transparent props)
- Animated.View (animated style values)
- Dynamic styles calculated at runtime
- Platform specific styles
- Pressable or TouchableOpacity pressed states
- Shadows (different per platform)
- `TextInput` inner geometry on Android — apply `fieldInputStyle` from `constants/theme.ts`; `gg-field` deliberately has no horizontal padding because NativeWind can miss or override the native `EditText` inset

Everywhere else, use NativeWind.

---

## Image Rule

Use centralized image imports.

1. Check if constants/images.ts exists.
2. If not, create it.
3. Import all app images there.
4. Use them through the centralized object.

```ts
import mascot from "@/assets/images/mascot.png";

export const images = {
  mascot,
};
```

```tsx
<Image source={images.mascot} />
```

Do not import image assets directly inside screens or components.

---

## State Management

- Zustand for global client state.
- Local state for temporary UI state.
- AsyncStorage for persistence.

---

## TypeScript

- Strict mode.
- No `any`.
- Keep types simple and readable.

---

## Feature Implementation

When building a feature:

1. Read this file first.
2. Identify the files to change.
3. Keep changes focused.
4. Do not rewrite unrelated code.
5. Follow existing patterns.
6. Make sure the feature works end to end.
7. Fix lint and type errors before finishing.

---

## Secrets

- Never expose secret keys in client code.
- Use server routes for tokens, AI calls, and any external API access.

---

## Authentication

Use Clerk. Do not build custom auth, and do not use Supabase Auth.

One Clerk application serves every GRIDGO app, so a person holding two roles keeps one identity. Clerk metadata describes a primary role; it does not establish membership in this app. Never write role metadata from the client.

This app serves `rider`. Authenticated requests select the rider projection with `X-GRIDGO-Role: rider`; `hooks/useClerkSessionBridge.ts` adopts the role-scoped `/auth/me` response with `getToken()` as soon as Clerk reports `isSignedIn` — do not wait on `useUser()`. `store/session.ts` requires its role to be `rider`. Every read and write remains authorized by `gridgo-api`. A refresh-time access rejection blocks Clerk re-adoption and ends the captured Clerk session while preserving the login error. Clerk join wait rules live in `lib/authGate.ts`, with the adoption deadline owned by `store/session.ts` and regression coverage in `hooks/__tests__/clerkMembership.test.tsx`. Rider-facing timeout recovery is documented in [README — Shared backend](README.md#shared-backend).

Riders apply in this app (`app/(auth)/signup.tsx` → `POST /auth/signup` with `role: "rider"`). The API stores the role and starts `verificationStatus: "pending"`; this binary never writes a role. Offers stay closed until Operations approves (`lib/riderApproval.ts`, `components/ApprovalNotice.tsx`). A Clerk `__clerk_ticket` invitation remains as a secondary path. Dual/Clerk mode answers `invitation_required` — report it, do not change `AUTH_MODE`.

---

## Communication

Be concise. Explain what changed and how to test it.

---

## Rider product notes

- **Every pushed screen gives a way back.** Root pushes take `multiOriginPushedScreenOptions` from `lib/navigationHeaders.ts`, which is `headerBackButtonDisplayMode: "minimal"` — the bare chevron, by the captain's decision. (A previous build set `headerBackTitle: "Back"` after riders reported missing the chevron; that was overruled.) The label is also what kept the `(tabs)` route group off screen, so the protection has to come from the absence of a back title rather than from a chosen one. `(tabs)` carries `title: "GRIDGO"` as a second line of defence. Headerless `formSheet` routes have no header to carry it, so each one keeps a labelled cancel in its body in **every** state, loading included (`ConfirmSheetSkeleton` takes a real one). Enumerated, not sampled, by `__tests__/backAffordance.test.ts` — a new route that skips both option objects fails the build.

- **Tabs:** Offers · Active · [action] · Earnings · Account — four destinations around one raised **action**, never a fifth destination. The disc performs the job's next step; its verb, glyph and route come from `lib/riderAction.ts`, driven by `store/activeTrip` + `hooks/useRiderAction`. Alerts is a pushed route behind `components/AlertsButton` (the only place the unread count shows). Rationale for the whole set: `constants/tabs.ts`.
- **Auth gate:** session → route is continuous in `hooks/useAuthGate` + `lib/authGate.ts`. Two guards must both hold before it navigates (`canGateNavigate`): the root navigator exists, and the stored session has been read back — otherwise `replace` throws "Attempted to navigate before mounting the Root Layout component". `app/_layout.tsx` renders nothing until fonts **and** session are ready, so no screen fires an authenticated request without a bearer.
- **Nothing in the launch path may wait forever.** Every gate before the first frame carries a deadline (`lib/launchGate.ts`, `hooks/useLaunchReady`, `hydrate` in `store/session.ts`), including Clerk's SecureStore restoration. The splash is hidden off the same bounded flag — a native call that never answers must degrade to the welcome screen, never to a blank one. `hydrated` is load-bearing in three places (root layout, auth gate, `app/index.tsx`), so it has to flip no matter what storage does; a late answer is still adopted and the continuous gate carries the rider on. For Clerk-to-domain adoption after launch, see [Authentication](#authentication). In dev the launch reports its timing and what stalled. Guarded by `__tests__/startupNeverHangs.test.tsx`.
- **Session persists** to AsyncStorage (`lib/sessionStorage.ts`, `store/session.ts`); a rider stays signed in across launches. A 401 only clears it when the request actually carried a bearer.
- **Tab bar geometry: two content rows, one rule under them.** In `components/GridgoTabBar.tsx`, `tabBarMetrics(platformOS)` gives the platform's own content row — the HIG's **49pt** on iOS, Material 3's **80dp** on Android — and `tabBarPaddingBottom` gives what sits beneath both: whatever the platform reserves *is* the breathing room, with `TAB_BAR_MIN_BOTTOM_GAP` as a floor for a device reserving less. Never `inset + gap`; `Math.max` stays banned as a *replacement* for the inset, so the floor is spelled longhand. `tabBarHeight(os, inset)` is the whole table as code (83 / 57 iOS, 128 / 104 / 88 Android), asserted per device in `components/__tests__/GridgoTabBar.test.tsx`. Two mistakes this cost the captain, both now cited in the file rather than remembered: an 80dp row on iOS is 114pt against UIKit's 83, and MD3's 80dp container sits *above* the system inset (edge-to-edge means ~48dp three-button, ~24dp gesture — never zero), so adding the gap overshot Material on every Android phone.
- **The gap above the tab icons is measured from the *painted* edge, and equals gridgo-supplier's.** `tabBarTopGap(os)` — 4pt iOS, 20dp Android. Every column bottom-aligns (`justify-end` over `minHeight: columnHeight`), so `itemPaddingTop` is slack the layout absorbs and never the term that sets this: it is `columnHeight − itemPaddingBottom − (icon + gap + label)`. The bar therefore paints `absolute inset-0`, as the supplier does. It used to paint from `actionRise` down, leaving a transparent strip for the disc to break — which subtracted from that gap and on iOS put the icons **6pt above** their own hairline. The strip is gone because it stopped being needed, not because it was shrunk: see the disc entry. Android's item padding is **12 / 16**, identical to gridgo-client and gridgo-supplier — all three must match or one of them is wrong.
- **The rider's action disc is labelled, which is why its column overhangs both rows.** `tabBarActionOverhang` — disc + label box + bottom padding against the row. Android: 56 + 16 + 16 = 88 against 80, so it rises **8dp**. iOS: 44 + 16 + 3 = 63 against 49, so it rises **14pt**. Neither is measured into the bar's height (iOS stays on 83pt). That real overhang is what breaks the hairline on both platforms, and it is what let the painted strip go: on Android's old 8dp bottom padding the stack was exactly 80 and overhung nothing, so the hairline had to be lowered to fake it. Shrinking the disc or dropping the label were the alternatives and both are worse — see the function's comment. Disc diameters match gridgo-client per platform; keep all three apps in step.
- **Trip logic:** pure helpers in `lib/riderOrder.ts` (phase ladder, balance/checklist gates, offer/active selection, location window, stop labels) and `lib/pickupChecklist.ts` (the six checks and their gate). Screens must not re-derive these rules inline. The ladder is `pickup_checks → start_delivery → delivery_proof → complete`, with `pickup_blocked` outranking everything while an escalation is open.
- **Map stack (no Google key):** Leaflet over OSM tiles in `components/MapFrame` — `react-native-webview` on device, an iframe on web (`MapFrame.web.tsx`), because the WebView renders only a red error string on Expo web, the one target that can be screenshotted without a phone. OSRM public demo for route/distance (`lib/osrm.ts`). Active-trip routing is GPS → next stop (`lib/tripNav.ts`): shop first, then the client door or GRIDGO Office (`lib/gridgoOffice.ts`, same pin as the API). Origin is snapped ~80 m so public OSRM is not hit on every GPS tick. Never geocode. Routing failure → straight line, an explicit "routing unavailable" status, and **no travel time** (`durationSeconds` is null); never block trip actions. Attribution required. Dark theme uses Carto dark tiles with `EXPO_PUBLIC_CARTO_API_KEY` from gitignored `.env.local` (`lib/cartoTiles.ts`) — never commit the key. Expo inlines it only as the literal `process.env.EXPO_PUBLIC_CARTO_API_KEY`; a member access on `env` ships a keyless URL in a release APK. The Map tab plots live `GET /catalog/shops` pins (`lib/directoryShops.ts`), not the local placeholder directory.
- **Location honesty:** `hooks/useTripTracking.ts` owns foreground GPS across tabs and publishes only in-memory state through `store/tripLocation.ts`. `hooks/useLocationSharing.ts` owns the ping and freshness rules; never persist locations. Every fix carries `fixAtMs`; `lib/locationFreshness.ts` turns it into live / stale / waiting / off, and `LocationSharingBanner` shows sharing state and fix age together. Never render a position without its age.
- **Proof steps are pushed screens:** `app/trip/{pickup,handoff,sign-off,delivery}.tsx`, one action each, opened with `?orderId=`. They re-fetch the order (`hooks/useTripOrder`) rather than trusting a snapshot passed through navigation. Active never inlines a proof form.
- **Evidence is only proof once the server has it.** Capture (`lib/proofPhoto.ts`) → `lib/attachments.ts` (`POST /files` then `POST /files/:id/attach`, per `gridgo-api` `docs/STORAGE_API.md`) → `evidenceBlockReason` in `lib/proofEvidence.ts` gates the confirm button. `sending`, `processing` and `stored` stay distinct; never set `stored` optimistically. Uploads stream from the file URI via XHR `FormData` — never read a photo into JS memory. Photo is the default at the door; the signature pad (`components/SignaturePad.tsx`, PNG via `react-native-view-shot`, white paper and dark ink in both themes because the image leaves the phone) appears there only after the camera actually fails, and is the whole point of the pickup handoff.
- **The six-point pickup check is the app's centre of gravity.** `lib/pickupChecklist.ts` holds the checks, the gate and the copy; `app/trip/pickup.tsx` and `components/PickupCheckRow.tsx` render them. All six must be answered — never defaulted — and one failure stops transport: the escalation needs a photo *and* a sentence before it can be filed, because "a rider refused this" on its own is no better than an unlogged defect. Failure copy comes from each check's `failure` field, never from `label` (a pass-phrased label reads as its own opposite once the check has failed). **Six passes send nothing.** The pickup screen carries them to `app/trip/handoff.tsx`, where the supplier signs on the rider's phone; that screen uploads the pad as a `handoff_signature` PNG (`HANDOFF_SIGNATURE_TARGETS`), then sends the six checks and `{fileId, signerName}` in one `submitPickupChecklist` call — the server refuses the checks without it (`409 handoff_signature_required`), so custody moves only on a signature. Gate and copy are pure in `lib/handoffSignature.ts`; strokes and signer persist in `store/tripProof` (numbers, not a capture) and the only file id kept is one the server confirmed, so a retry after a dropped connection names it rather than asking the supplier to sign twice. The server returns the trained sign-off line, rendered from `order.pickupChecklist.signOffPrompt` — never hard-coded here — as an instruction on `app/trip/sign-off.tsx` and, for as long as it is owed, on Active (`owesSignOff`). The spoken sign-off is deliberately **not** a phase: nothing on the server records that it was said; the signature is the record.
- **A rider is not dispatchable until Operations says so.** `lib/riderApproval.ts` maps `verificationStatus` to what the rider reads; `components/ApprovalNotice.tsx` renders it where the work would be, on Offers, Active and Earnings. Every dispatch route answers `403` for an unapproved account, so those screens must not fire the request at all — an ordinary empty list reads as "no jobs today" and a rider will pull-to-refresh it forever. Account and trip reconciliation belongs to the root-mounted `hooks/useAlertStream.ts`, including while waiting for approval.
- **The keyboard never covers the field being typed into.** Screens with a field open through `components/FormScroll.tsx` (`KeyboardAwareScrollView` from `react-native-keyboard-controller`), with `<KeyboardProvider>` at the root of `app/_layout.tsx`. React Native's `KeyboardAvoidingView` is **banned**, not tuned: every call site passed `behavior={undefined}` on Android, where it renders a plain `View` and relied on a window resize that edge-to-edge stopped delivering; and even given a behavior it resizes a container, never scrolls to the focused input, and cannot see a scroll view's content inset. `StickyActionBar` rides the keyboard (`KeyboardStickyView`, offset by the bottom inset so it is not counted twice) and reports its height back as `stickyActionHeight`, so a focused field clears the bar as well as the keyboard. The one screen that should *shrink* rather than scroll — `app/chat.tsx`, a message list over a pinned composer — uses the controller's own `KeyboardAvoidingView`, which reads the keyboard frame from its controller; it is the same name from a different package, and the guard tells them apart by import. Enumerated, not sampled, by `__tests__/keyboardAvoidance.test.ts`. **None of this is provable in a browser** — web has no soft keyboard — so a change here needs a phone.
- **Controls:** fixed sets use `components/ChoiceList.tsx` (many, with guidance) or `components/SegmentedControl.tsx` (two or three, on GRIDGO tokens rather than the OS-styled native control). `store/tripProof.ts` (AsyncStorage) keeps the in-progress checklist — typed and chosen values only, never a capture, because the camera cache can be reclaimed.
- **Confirmations are native sheets, never a hand-rolled `<Modal>`:** a route with `confirmSheetScreenOptions` from `lib/navigationHeaders.ts` (`presentation: "formSheet"`, `sheetAllowedDetents: "fitToContents"`, corner radius from `radius.xl` rather than a literal), body in `components/ConfirmSheetBody.tsx`. That buys platform spring physics, drag-dismiss, the Android back gesture, a real scrim and a screen-reader focus trap for free. Where the screen has already made the choice explicit, prefer inline disclosure — the button names the outcome (`checklistActionLabel` + `checklistConsequence`) — over a sheet that asks again.
- **Screen furniture:** `ScreenHeader` (title + one control), `EmptyState` (icon + invitation, centred), `DestinationRow` (label + chevron, not CTA styling), `StickyActionBar` (pinned action on pushed proof screens only — tab screens keep the CTA in the flow so it never stacks under the yellow disc).
- **Waiting has two shapes, and neither is a bare spinner.** Content that has not arrived gets a skeleton: named shapes in `components/Skeleton.tsx` (text / circle / block / button) under a highlight sweep, composed per screen in `components/SkeletonScreens.tsx`. A skeleton's job is to *hold the layout the answer will take* — a short placeholder replaced by tall content is what riders read as the page jumping when they switch tabs, so add a composition rather than reaching for a generic card. Work the rider has committed to, over a screen that stays mounted, gets `components/BlockingOverlay.tsx` instead: scrim, centred indicator, and it swallows touches so nobody edits a code mid-submit. The sweep is ~1s and ambient — it is deliberately outside the 160–240ms interaction budget, which governs responses to taps, not this. Under reduced motion the shapes stay and the sweep does not.
- **`refreshing` belongs to the pull gesture and nothing else.** Driving a `RefreshControl` from a focus effect spins it over the screen title every time the rider taps the tab, with no pull behind it. Re-fetch on focus quietly, behind the data already on screen.
- **Tab scenes never animate:** `animation: "none"` is set explicitly in `app/(tabs)/_layout.tsx`. The library defaults to it; writing it down stops it drifting.
- **Onboarding:** full-height horizontal pager over a non-interactive art layer (parallax 0.4× + cross-fade). Exit is explicit via `lib/onboardingExit.ts` — Settings replay uses `?from=settings` and returns to `/settings`; do not rely on `canGoBack()` alone. Copy and art in `data/onboarding.ts` + `components/illustrations/` (rider beats only).
- **Logo lockup:** `components/GridgoLogo.tsx` — mark left, wordmark and typed `role` stacked right, the mark spanning the **whole** text block. Every role renders as plain type; there is no rider pill, so all product lockups are one family. `size` is the **wordmark type size**, not the mark edge — the mark follows from `gridgoLogoMetrics`, which is why the two cannot be sized apart. Yellow appears exactly twice (the lit dot, and `GO` on `brand`). Rider always uses `role="rider"`. Identity screens only (login, onboarding, design-system masthead); do not decorate every header. Do not recolour or redraw the mark.
- **Nothing published is a way in.** A production login screen never prefills credentials. Development builds prefill the rider fixture via `lib/devLogin.ts` behind `__DEV__` (Metro strips the dead branch, so the address and password do not exist in a release bundle — proved by `__tests__/productionBundleNoCredentials.test.ts`). Do not reintroduce a runtime flag or a top-level constant for those strings; both still ship. The password field has a show/hide control (44dp target, accessible label that flips with state). Public apply is `app/(auth)/signup.tsx`. Invitation accept stays at `app/(auth)/accept-invitation.tsx`. Google authenticates identity but never supplies role metadata. Keep the API base with its reachability chip on login. Auth screens pushed off welcome use the native stack header (`multiOriginPushedScreenOptions`); do not add a custom `AuthBackButton`. Do not draw `PushEnableCard` on login. `expo-notifications` is loaded through `lib/expoNotifications.ts` — never a static import on the launch path — so Expo Go Android SDK 53 cannot white-screen the app.
- **Settings:** pushed route `app/settings.tsx` (theme + View onboarding). Account keeps identity, the way into Alerts and Settings, and Sign out — and nothing diagnostic: the API base belongs on login (with its reachability chip), not on a rider's account screen.
- **Illustrations:** source SVGs in `assets/illustrations/` (provenance in `NOTICE.md`); RN components collapse fills onto the five-step ramp in `palette.ts` — no yellow in art. Do not hand-edit generated `*Illustration.tsx`; re-convert from the SVG.
- **Nothing on screen names an internal:** `apiErrorMessage` in `lib/api.ts` maps known API codes to recovery copy and swaps anything code-shaped (`isInternalCode`) for the caller's own sentence, so a raw `not_offerable` or `HTTP 500` can never reach a rider.
- **Earnings are derived, not fetched:** the demo API has no payouts route, so `lib/riderEarnings.ts` builds them from the rider's delivered orders. One number, and it is the rider's own: `riderPayoutMinor`, their snapshotted share of the distance-banded delivery fee (gridgo-api `#rider-delivery-split`). Every money render goes through `riderPay` (`lib/riderPay.ts`), which falls back to the whole `deliveryFeeMinor` when the API omits the split and never recomputes the server's rounding; the gross appears only as secondary detail (`riderPayDetail`, `components/RiderPayRows.tsx`).
- **Alerts show where the job actually is.** `components/AlertCard.tsx` carries an unread state, a swipe that marks read, an absolute date and time, and a four-step stage bar (`lib/orderStage.ts` + `components/OrderStageBar.tsx`: Assigned · Checked · On the way · Delivered). The stage is derived from the **order**, never the message — a message was true when it was sent. The bar is monochrome on purpose: an active stepper step may take `actionYellow`, but several cards to a list would put four yellow discs on one screen. `store/notifications.ts` owns account-scoped read acknowledgements, persistence, rollback, deletion, and ordered inbox adoption. See its contract comment before changing alert state.

## Push notifications

The **third** delivery leg, beside `GET /notifications`: the server sends the same notification record through **FCM HTTP v1** so it arrives with the app closed. `docs/OPERATIONAL_MODEL_V2_API.md` → *Push notifications* in **gridgo-api** is the contract. This is `gridgo-supplier`'s shape, ported — including **unclaimed register before sign-in** — and only `pushTargetRoute`, the copy in `pushOfferCopy`, and where `PushEnableCard` is drawn are this app's. **Fix a fleet-wide push problem in all three apps, not one.**

- Files: `lib/push.ts` + `store/push.ts` + `hooks/usePushNotifications.ts` + `components/PushEnableCard.tsx`. `POST /devices` and logout `{deviceToken}` live in `lib/api.ts`.
- **`google-services.json` is never committed.** Project `gridgo-c2ce9`, package `ph.gridgo.rider`. `GOOGLE_SERVICES_JSON` names a path, or a copy dropped in the repo root is found; absent, `app.config.ts` omits the key so `expo start` / `tsc` / jest / `expo config --type public` still work. A named missing path throws. The release workflow stages it from `GOOGLE_SERVICES_JSON_BASE64` and asserts the file covers this package before prebuild. **Never hand-edit Gradle** — the Expo plugin owns that.
- **Ask only from a tap on `PushEnableCard`.** Android 13+ shows the dialog once. The card is drawn on Alerts, Offers, and Active. See the login exclusion above. Signed-out may ask *only*; it is never told it is blocked or that registration failed.
- **Registration does not wait for a session.** A granted phone registers unclaimed at launch (`api.registerDeviceUnclaimed`, own `fetch` so a 401 cannot sign anyone out). Signing in claims the same token. Sign-out sends `{deviceToken}` on logout and then `usePush.release` re-registers unclaimed. Never authenticated unregister on sign-out.
- **A tap opens only an authorized destination.** `hooks/usePushNotifications.ts` validates ownership before passing data to `lib/push.ts` routing. See the hook’s contract comment for readiness, offline retry, and account-change handling; approval is not a prerequisite for reading Alerts.
- **A foreground push shows nothing** (`PUSH_FOREGROUND_BEHAVIOR`). The Alerts list and unread badge already carry the same record.
- **Expo Go cannot do this.** Wrap every `expo-notifications` call (`store/push.ts`, `withoutNativeModule` in the hook, including the module-scope handler). An unwrapped throw is a white screen, not a degraded feature.
- **Prebuild rewrites `package.json`.** Commit before running it; `git checkout package.json` after prebuild also throws away an uncommitted `expo-notifications`. Check `npx expo-modules-autolinking search -p android | grep expo-notifications` before blaming the plugin.

- **Package versions:** install only versions from `node_modules/expo/bundledNativeModules.json` (`npx expo install …`); confirm with `npx expo install --check` before shipping.

- **A dropped dependency must also leave `expo.plugins`.** Config plugins resolve by name from `node_modules` during config evaluation — `expo start` and native builds — never during bundling, so a plugin naming an uninstalled package kills launch with `PluginError` while tests pass and both bundles export. That is how a stale `@react-native-community/datetimepicker` entry outlived the v2 rebuild that removed the dependency. `__tests__/configPlugins.test.ts` is the cheap hermetic guard (every plugin module has a dependency); the real check is `npx expo config --type public`, which is worth running after any dependency removal.

- **The APK riders sideload is built, proved, and published by CI.** `.github/workflows/android-release.yml`: a merge to `main` (or a manual dispatch) runs `expo prebuild` → `assembleRelease` → `scripts/verify-release-apk.sh` → GitHub Release and `upload-apk rider` (bytes on stdin over the deploy key's forced command) → then `actions/upload-artifact@v4` with `continue-on-error`. Publish is first because a full Actions artifact quota must not skip the landing site. `android/` is generated, never committed — `.gitignore` keeps it out and a checked-in copy drifts from `app.json` on every Expo upgrade — so `npx expo config --type public` has to gate the build. Two failures are invisible in a green log and both are asserted against the built APK rather than trusted: Expo's generated `android/app/build.gradle` points the release build type at `signingConfigs.debug`, so signing comes from AGP's injected config and the APK's certificate is then compared to the keystore alias; and **`EXPO_PUBLIC_*` values are inlined by Babel at bundle time, not read at runtime** — and only when the source uses the literal member expression `process.env.EXPO_PUBLIC_*` (`lib/cartoTiles.ts`) — so the API URL, Clerk publishable key, and CARTO basemap key are present on config, prebuild, and Gradle. Release requires `pk_live_`, and the verifier finds those configured values in `assets/index.android.bundle`; missing any cannot ship a blank, loopback-bound, or watermarked map app. `__tests__/releaseWorkflow.test.ts` fails the build if this wiring moves. Triggers earn different outputs: a pull request gets config, typecheck and tests and references no secret at all; only the default branch names a Release or replaces what the landing site serves.

- **The suite needs Node 24; on Node 22 three startup-gate tests hang.** `__tests__/startupNeverHangs.test.tsx` drives the root layout on fake timers, and under Node 22 three of its five tests never settle — they run to whatever `testTimeout` allows and fail, on any machine, not just CI. Node 24 passes them in milliseconds. So `.github/workflows/android-release.yml` pins `node-version: 24` rather than an older LTS. It is a harness-only difference (jest's fake timers, not anything the app does on a phone), but it makes the node version a real dependency: check it before concluding a green suite has gone red on its own.

- **A sideloaded build must not call itself 1.0.0 forever.** There is no store listing to tell two APKs apart, and Android refuses to install over an equal `versionCode`. So `app.config.ts` — which now sits over `app.json` and is the config Expo actually evaluates — stamps a build identity: `app.json` keeps MAJOR.MINOR as the release line, CI's run number owns the patch segment and the `versionCode` (`GRIDGO_BUILD_NUMBER`). Locally the `app.json` version stands unchanged, so nothing on a developer's machine pretends to be a release. The rule lives in `app.config.ts` rather than `lib/` because @expo/config's loader will not resolve an extensionless relative `.ts` import and the `.ts` spelling that does resolve is a `tsc` error; `__tests__/appConfigVersion.test.ts` tests it where it runs.

## Final Reminder

Before every feature:

- Read this file.
- Follow it strictly.
- Build clean, simple code.
- Replicate UI exactly when designs are provided.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
