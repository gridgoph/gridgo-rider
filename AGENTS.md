# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

You are an expert React Native and Expo engineer helping me build GRIDGO.

Write clean, simple, maintainable code. Prioritize clarity over unnecessary abstraction.

Think like a senior mobile developer.

---

## Project Overview

This repo is **GRIDGO Rider** — the rider mobile app for a Davao City managed-printing marketplace. It covers self sign-up and accreditation, dispatch accept, navigation, the six-point pickup check, delivery evidence, and active-trip location sharing.

GRIDGO ships one app per role. Client, Supplier, Operations, and Super Admin surfaces live in separate codebases. Do not put client request flows, supplier production, or Operations QA into this binary.

The app includes:

- Rider self sign-up, and an honest "not dispatchable until approved" state
- Dispatch offer accept
- Navigate to supplier for pickup and client for delivery
- The six-point pickup check, its escalation, and the spoken sign-off
- Delivery evidence (photo, or signature when the camera cannot be used)
- Active-trip location pings (live GPS while package is with the rider)

**No cash.** Operational model v2 removed cash on delivery outright — the captain's risk decision about riders carrying the client's balance. There is no cash screen, no COD path, and no peso figure on any screen except the rider's own delivery fee. Do not reintroduce one.

**Cross-cutting**

- Auth via the replaceable local demo API (`gridgo-api`). Role must be `rider`.
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
- Zustand for client session state
- Local **custom auth + domain API** via `gridgo-api` (MVP — not Clerk/Supabase/PayMongo; replaceable later)

Do not introduce new major libraries unless there is a strong reason. Ask before installing anything new.

---


## MVP stack (current phase)

For this MVP we **do not** integrate Clerk, Supabase, PayMongo, or other production SaaS.

Every screen that needs network uses **`lib/api.ts`** against the shared local **`gridgo-api`**:

- **Custom auth** — email/password → bearer token, plus rider self sign-up; role enforced in Zustand session (`store/session.ts`). Mismatched role is rejected (no role switcher).
- **Custom domain API** — orders, dispatch, pickup checklist, delivery evidence, files, settings, notifications.
- **Zustand** — session and feature stores (not React Context for global session).
- **Money** — PHP minor units only, formatted at the edge. The only figure this app renders is `deliveryFeeMinor`, the rider's own fee.
- **Contract** — `gridgo-api` `docs/OPERATIONAL_MODEL_V2_API.md` is authoritative for routes, states, transitions and role projections; `docs/STORAGE_API.md` for file bytes. Read them before changing a call site rather than inferring from the app.
- **Replace later** — keep the same `lib/api.ts` surface when Clerk/Supabase/PayMongo land.
- **API base** — `getApiBase()` / `resolveApiBase()` in `lib/api.ts`. Precedence: `EXPO_PUBLIC_API_URL` → Expo dev-server hostname from `expo-constants` + `EXPO_PUBLIC_API_PORT` (default `8787`) → Android emulator `10.0.2.2` when that host is loopback → `127.0.0.1`. Do not hardcode a LAN IP; physical Expo Go devices inherit the host they loaded the bundle from. Unit tests: `lib/__tests__/apiBase.test.ts`.

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
- Navigation, secondary buttons, filters, inputs, tabs, and routine controls stay black/white/charcoal.
- Yellow buttons use black text and a clear verb.
- No yellow page backgrounds and no large black slabs in Light. In Dark, cards must stay visibly elevated from the canvas — never let a surface disappear into black.

### Status

Color never carries meaning alone. Every status is **icon + label + color**: "Approved", "Blocked", "Needs correction", "Last updated 3 min ago". A screen must stay fully readable in grayscale.

### Type

Satoshi for all UI, falling back to `system-ui` until the licensed font files are available. Poppins ExtraBold is brand display only; Instrument Serif is rare decorative text only — never labels, data, or controls.

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
- KeyboardAvoidingView (behavior props)
- Modal (visible, transparent props)
- Animated.View (animated style values)
- Dynamic styles calculated at runtime
- Platform specific styles
- Pressable or TouchableOpacity pressed states
- Shadows (different per platform)

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

One Clerk application serves every GRIDGO app, so a person holding two roles keeps one account. The platform role (`client`, `supplier`, `rider`, `ops_admin`, `super_admin`) lives in Clerk `publicMetadata`, is writable only through the Backend API, and reaches this app as a session claim — read it, never write it.

This app serves `client`. Check the role once, at the door, and hand a non-client user off to their own app. That check decides what renders, nothing more: every read and write is decided server-side by Row Level Security against the Clerk user id and role claim, so removing the check would grant no access.

Clients are the only role that signs up. Supplier, rider, and admin accounts exist only by invitation from Operations, so this app never offers a path to create one.

---

## Communication

Be concise. Explain what changed and how to test it.

---

## Rider product notes

- **Every pushed screen gives a way back.** Root pushes take `multiOriginPushedScreenOptions` from `lib/navigationHeaders.ts`, which is `headerBackButtonDisplayMode: "minimal"` — the bare chevron, by the captain's decision. (A previous build set `headerBackTitle: "Back"` after riders reported missing the chevron; that was overruled.) The label is also what kept the `(tabs)` route group off screen, so the protection has to come from the absence of a back title rather than from a chosen one. `(tabs)` carries `title: "GRIDGO"` as a second line of defence. Headerless `formSheet` routes have no header to carry it, so each one keeps a labelled cancel in its body in **every** state, loading included (`ConfirmSheetSkeleton` takes a real one). Enumerated, not sampled, by `__tests__/backAffordance.test.ts` — a new route that skips both option objects fails the build.

- **Tabs:** Offers · Active · [action] · Earnings · Account — four destinations around one raised **action**, never a fifth destination. The disc performs the job's next step; its verb, glyph and route come from `lib/riderAction.ts`, driven by `store/activeTrip` + `hooks/useRiderAction`. Alerts is a pushed route behind `components/AlertsButton` (the only place the unread count shows). Rationale for the whole set: `constants/tabs.ts`.
- **Auth gate:** session → route is continuous in `hooks/useAuthGate` + `lib/authGate.ts`. Two guards must both hold before it navigates (`canGateNavigate`): the root navigator exists, and the stored session has been read back — otherwise `replace` throws "Attempted to navigate before mounting the Root Layout component". `app/_layout.tsx` renders nothing until fonts **and** session are ready, so no screen fires an authenticated request without a bearer.
- **Nothing in the launch path may wait forever.** Every gate before the first frame carries a deadline (`lib/launchGate.ts`, `hooks/useLaunchReady`, `hydrate` in `store/session.ts`), and the splash is hidden off the same bounded flag — a native call that never answers must degrade to the login screen, never to a blank one. `hydrated` is load-bearing in three places (root layout, auth gate, `app/index.tsx`), so it has to flip no matter what storage does; a late answer is still adopted and the continuous gate carries the rider on. In dev the launch reports its timing and what stalled. Guarded by `__tests__/startupNeverHangs.test.tsx`.
- **Session persists** to AsyncStorage (`lib/sessionStorage.ts`, `store/session.ts`); a rider stays signed in across launches. A 401 only clears it when the request actually carried a bearer.
- **Tab bar geometry is one rule, not one per platform.** `tabBarPaddingBottom` in `components/GridgoTabBar.tsx`: where the system reserves space at the bottom, that reservation **is** the row's breathing room; `TAB_DESIGN_PADDING` is a floor for a device that reserves none, never an addend. Both platforms' specs agree — MD3's `NavigationBar` pads by the inset *outside* an 80dp minimum, UIKit is 49pt + the inset, and React Navigation's own bar is branch-free about it. The per-platform fork this replaced put 8dp of unasked-for bar under every Android phone, on two beliefs that are both false: that an Android inset means something different, and that a three-button phone reports zero (it reports ~48dp — the app is edge-to-edge, so `navigationBars` reaches JS in both navigation modes). `Math.max` stays banned *as an accident*; a floor written out and argued for is the rule itself. Layout footprint is 80 + padding, painted is 64 + padding — the four device cases and their numbers live in the function's doc comment and are asserted, inset-in to padding-out, by `components/__tests__/GridgoTabBar.test.tsx`. Content row is MD3 80dp; the action column is 56 disc + 16 label box + 8 pad = the same 80. Must match gridgo-client and gridgo-supplier exactly.
- **Trip logic:** pure helpers in `lib/riderOrder.ts` (phase ladder, balance/checklist gates, offer/active selection, location window, stop labels) and `lib/pickupChecklist.ts` (the six checks and their gate). Screens must not re-derive these rules inline. The ladder is `pickup_checks → start_delivery → delivery_proof → complete`, with `pickup_blocked` outranking everything while an escalation is open.
- **Map stack (Expo Go, no Google key):** Leaflet over OSM tiles in `components/MapFrame` — `react-native-webview` on device, an iframe on web (`MapFrame.web.tsx`), because the WebView renders only a red error string on Expo web, the one target that can be screenshotted without a phone. OSRM public demo for route/distance (`lib/osrm.ts`); coordinates from order `pickup`/`dropoff` only — never geocode. Routing failure → straight line, an explicit "routing unavailable" status, and **no travel time** (`durationSeconds` is null); never block trip actions. Attribution required. Dark theme uses Carto dark tiles.
- **Location honesty:** live GPS via `expo-location` + `useRiderLocation` / `useLocationSharing` while `picked_up` / `out_for_delivery`; never persisted. Every fix carries `fixAtMs`; `lib/locationFreshness.ts` turns it into live / stale / waiting / off, and `LocationSharingBanner` shows sharing state and fix age together. Never render a position without its age.
- **Proof steps are pushed screens:** `app/trip/{pickup,sign-off,delivery}.tsx`, one action each, opened with `?orderId=`. They re-fetch the order (`hooks/useTripOrder`) rather than trusting a snapshot passed through navigation. Active never inlines a proof form.
- **Evidence is only proof once the server has it.** Capture (`lib/proofPhoto.ts`) → `lib/attachments.ts` (`POST /files` then `POST /files/:id/attach`, per `gridgo-api` `docs/STORAGE_API.md`) → `evidenceBlockReason` in `lib/proofEvidence.ts` gates the confirm button. `sending`, `processing` and `stored` stay distinct; never set `stored` optimistically. Uploads stream from the file URI via XHR `FormData` — never read a photo into JS memory. Photo is the default; the signature pad (`components/SignaturePad.tsx`, PNG via `react-native-view-shot`) appears only after the camera actually fails.
- **The six-point pickup check is the app's centre of gravity.** `lib/pickupChecklist.ts` holds the checks, the gate and the copy; `app/trip/pickup.tsx` and `components/PickupCheckRow.tsx` render them. All six must be answered — never defaulted — and one failure stops transport: the escalation needs a photo *and* a sentence before it can be filed, because "a rider refused this" on its own is no better than an unlogged defect. Failure copy comes from each check's `failure` field, never from `label` (a pass-phrased label reads as its own opposite once the check has failed). When all six pass the server returns the trained sign-off line, which is rendered from `order.pickupChecklist.signOffPrompt` — never hard-coded here — as an instruction on `app/trip/sign-off.tsx` and, for as long as it is owed, on Active (`owesSignOff`). The sign-off is deliberately **not** a phase: nothing on the server records that it was said.
- **A rider is not dispatchable until Operations says so.** `lib/riderApproval.ts` maps `verificationStatus` to what the rider reads; `components/ApprovalNotice.tsx` renders it where the work would be, on Offers, Active and Earnings. Every dispatch route answers `403` for an unapproved account, so those screens must not fire the request at all — an ordinary empty list reads as "no jobs today" and a rider will pull-to-refresh it forever. The account is re-read on the tab shell's poll (`app/(tabs)/_layout.tsx`), because an approval that never reaches the phone leaves the rider staring at a wait that cannot resolve.
- **Controls:** fixed sets use `components/ChoiceList.tsx` (many, with guidance) or `components/SegmentedControl.tsx` (two or three, on GRIDGO tokens rather than the OS-styled native control). `store/tripProof.ts` (AsyncStorage) keeps the in-progress checklist — typed and chosen values only, never a capture, because the camera cache can be reclaimed.
- **Confirmations are native sheets, never a hand-rolled `<Modal>`:** a route with `confirmSheetScreenOptions` from `lib/navigationHeaders.ts` (`presentation: "formSheet"`, `sheetAllowedDetents: "fitToContents"`, corner radius from `radius.xl` rather than a literal), body in `components/ConfirmSheetBody.tsx`. That buys platform spring physics, drag-dismiss, the Android back gesture, a real scrim and a screen-reader focus trap for free. Where the screen has already made the choice explicit, prefer inline disclosure — the button names the outcome (`checklistActionLabel` + `checklistConsequence`) — over a sheet that asks again.
- **Screen furniture:** `ScreenHeader` (title + one control), `EmptyState` (icon + invitation, centred), `DestinationRow` (label + chevron, not CTA styling), `StickyActionBar` (pinned action on pushed proof screens only — tab screens keep the CTA in the flow so it never stacks under the yellow disc).
- **Waiting has two shapes, and neither is a bare spinner.** Content that has not arrived gets a skeleton: named shapes in `components/Skeleton.tsx` (text / circle / block / button) under a highlight sweep, composed per screen in `components/SkeletonScreens.tsx`. A skeleton's job is to *hold the layout the answer will take* — a short placeholder replaced by tall content is what riders read as the page jumping when they switch tabs, so add a composition rather than reaching for a generic card. Work the rider has committed to, over a screen that stays mounted, gets `components/BlockingOverlay.tsx` instead: scrim, centred indicator, and it swallows touches so nobody edits a code mid-submit. The sweep is ~1s and ambient — it is deliberately outside the 160–240ms interaction budget, which governs responses to taps, not this. Under reduced motion the shapes stay and the sweep does not.
- **`refreshing` belongs to the pull gesture and nothing else.** Driving a `RefreshControl` from a focus effect spins it over the screen title every time the rider taps the tab, with no pull behind it. Re-fetch on focus quietly, behind the data already on screen.
- **Tab scenes never animate:** `animation: "none"` is set explicitly in `app/(tabs)/_layout.tsx`. The library defaults to it; writing it down stops it drifting.
- **Onboarding:** full-height horizontal pager over a non-interactive art layer (parallax 0.4× + cross-fade). Exit is explicit via `lib/onboardingExit.ts` — Settings replay uses `?from=settings` and returns to `/settings`; do not rely on `canGoBack()` alone. Copy and art in `data/onboarding.ts` + `components/illustrations/` (rider beats only).
- **Logo lockup:** `components/GridgoLogo.tsx` — mark left, wordmark and typed `role` stacked right, the mark spanning the **whole** text block. Every role renders as plain type; there is no rider pill, so all product lockups are one family. `size` is the **wordmark type size**, not the mark edge — the mark follows from `gridgoLogoMetrics`, which is why the two cannot be sized apart. Yellow appears exactly twice (the lit dot, and `GO` on `brand`). Rider always uses `role="rider"`. Identity screens only (login, onboarding, design-system masthead); do not decorate every header. Do not recolour or redraw the mark.
- **Settings:** pushed route `app/settings.tsx` (theme + View onboarding). Account keeps identity, the way into Alerts and Settings, and Sign out — and nothing diagnostic: the API base belongs on login (with its reachability chip), not on a rider's account screen.
- **Illustrations:** source SVGs in `assets/illustrations/` (provenance in `NOTICE.md`); RN components collapse fills onto the five-step ramp in `palette.ts` — no yellow in art. Do not hand-edit generated `*Illustration.tsx`; re-convert from the SVG.
- **Nothing on screen names an internal:** `apiErrorMessage` in `lib/api.ts` maps known API codes to recovery copy and swaps anything code-shaped (`isInternalCode`) for the caller's own sentence, so a raw `not_offerable` or `HTTP 500` can never reach a rider.
- **Earnings are derived, not fetched:** the demo API has no payouts route, so `lib/riderEarnings.ts` builds them from the rider's delivered orders. One number, and it is the rider's own: the delivery fee, banded by distance (`feeDistanceLabel` captions it, so a varying fee does not read as arbitrary).
- **Alerts show where the job actually is.** `components/AlertCard.tsx` carries an unread state, a swipe that marks read, an absolute date and time, and a four-step stage bar (`lib/orderStage.ts` + `components/OrderStageBar.tsx`: Assigned · Checked · On the way · Delivered). The stage is derived from the **order**, never the message — a message was true when it was sent. The bar is monochrome on purpose: an active stepper step may take `actionYellow`, but several cards to a list would put four yellow discs on one screen. The demo API has no route to mark an alert read, so the marks live in `store/notifications.ts` (AsyncStorage) and the list says so; a mark only ever adds, so the server's own `read` still wins.

- **Package versions:** install only versions from `node_modules/expo/bundledNativeModules.json` (`npx expo install …`); confirm with `npx expo install --check` before shipping.

- **A dropped dependency must also leave `expo.plugins`.** Config plugins resolve by name from `node_modules` during config evaluation — `expo start` and native builds — never during bundling, so a plugin naming an uninstalled package kills launch with `PluginError` while tests pass and both bundles export. That is how a stale `@react-native-community/datetimepicker` entry outlived the v2 rebuild that removed the dependency. `__tests__/configPlugins.test.ts` is the cheap hermetic guard (every plugin module has a dependency); the real check is `npx expo config --type public`, which is worth running after any dependency removal.

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
