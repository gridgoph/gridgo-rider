# Android release timeline crash

## Cause

A rider order's public timeline intentionally has no actor field. The app typed
`by` as required and called `by.startsWith(...)` while rendering `TripTimeline`.
A nonempty projected timeline therefore throws during render and terminates
release React Native JavaScript on Android.

The phone crash buffer contains three matching failures on 2026-10-06. A
sanitized excerpt from the first:

```text
10-06 12:33:45.156 E AndroidRuntime: FATAL EXCEPTION: mqt_v_native
E AndroidRuntime: com.facebook.react.common.JavascriptException:
  TypeError: Cannot read property 'startsWith' of undefined
E AndroidRuntime: timelineActorLabel@1:2947379
E AndroidRuntime: TripTimeline@1:3018909
```

The trigger is rendering a progress row without `by`. Signed-out screens,
empty timelines, and legacy fixtures containing actors mask it. The visible
symptom is Android closing the app and reporting that it keeps stopping.

## API trace

The API contract, `docs/OPERATIONAL_MODEL_V2_API.md` → production progress,
explicitly defines client/rider timeline entries as `{ at, state, note }`.

- `src/server.js`: `GET /orders`, `GET /orders/:id`, `GET /dispatch/offers`, and
  dispatch mutation responses pass through `publicOrder`.
- `publicOrder` calls `publicOrderFor` in `src/operational-model.js`.
- For readers other than Operations or the assigned supplier, `publicOrderFor`
  replaces history with `publicProgressTimeline(order.timeline)`.
- `src/production-progress.js` constructs only `at`, `state`, and a public
  progress note. Actors, private notes, and internal metadata are deliberately
  excluded. This source change originated in API commit `deb16f5`.
- Existing API tests in `tests/operational-model.test.js` explicitly assert the
  actor-free client/rider projection and preserved supplier/Operations history.

The rider's active-trip refresh consumes `GET /orders`; past-job details consume
`GET /orders/:id`. Both render the same `TripTimeline`. There is no API defect to
fix and no reason to restore private actor fields.

## Fix and regression evidence

`timelineActorLabel` accepts unknown input and labels missing, null, non-string,
or blank actors `GRIDGO`. Legacy actor strings retain their existing labels;
raw IDs remain hidden. The order type makes the legacy actor optional.

Before the fix, the new helper cases and the real `TripTimeline` render using
actor-free API-shaped rows failed: nine failures, including the same
`startsWith` exception. After the fix, all 48 tests in those two suites passed.
The render test checks that both progress notes, the current status, and the
fallback actor labels remain visible.

## Earlier emulator checks and limits

Official signed v1.0.102 and v1.0.107 opened on API 35/x86_64, and v1.0.107
installed over v1.0.102. Signed-out idle, background/foreground, notification
permission grant, and cold-launch checks did not crash. Production rejected the
documented development credentials, so these checks never reached a timeline.
The vulnerable helper is unchanged between the two release tags.

A local Hermes release variant built successfully using development services,
debug signing, x86_64, and unchanged release shrinking settings. Testing required
local-only HTTP permission and a bundle-only bypass of the production Clerk-key
guard; tracked source was restored. Its documented development password was
also rejected. The phone log then established the cause, and emulator work was
stopped. These builds are diagnostic artifacts, not fixed release validation.
No APK was installed on the connected physical phone.

## Sibling audit

- Client: `lib/copy.ts:actorLabel` guards missing/null actors; the caller in
  `lib/orderHistory.ts` also skips absent actors. Truthy non-string actors can
  still throw from string methods.
- Supplier: `lib/jobState.ts:presentTimelineActor` calls `by.startsWith` without
  a type guard; `components/JobTimeline.tsx` passes `entry.by` directly. It has
  the same latent missing-actor risk, although the assigned-supplier API
  projection normally preserves raw actors.

Those applications were inspected only. This change fixes the rider consumer.

## Validation

- Full Jest suite: 136 suites / 1,031 tests passed (`--ci --maxWorkers=2`).
- TypeScript: `npx tsc --noEmit` passed.
- Expo public configuration resolves successfully.
- ESLint on all changed TypeScript files passed. Full `npm run lint` reports
  one pre-existing `react-hooks/set-state-in-effect` error in unchanged
  `components/SupportChatConversation.tsx:95`, plus 13 existing warnings.
- Browser counterfactual: the real `TripTimeline` in a temporary fixture route
  fails with the old helper and renders with the guarded helper at 390×844 and
  1280×900. The fixture route was removed after capture. Screenshots are in
  `docs/screenshots/timeline-crash/`; these are component checks, not a claim
  that a complete delivery was tested on the fixed Android binary.
- Fixed signed release validation remains part of promotion/release follow-up.
