# Android release crash investigation

Checkpoint: 2026-10-06. The reported crash is not yet reproduced. No fix is proposed.

## Released APK checks

Tested the official signed GitHub release APKs on Pixel_API_35 (Android 15,
x86_64). No physical device was available.

- v1.0.102 opened and displayed the welcome, update, and sign-in screens.
- v1.0.107 installed over v1.0.102 successfully. Android reported versionCode
  107 and versionName 1.0.107.
- v1.0.107 stayed running through signed-out idle, background/foreground
  transitions, notification permission being granted while backgrounded,
  and a cold launch followed by backgrounding after one second and reopening.
- The documented development credentials were rejected by production on both
  releases. Authenticated job and delivery paths have **not** been tested.
- The Android crash buffer was empty. Collected logs contained no fatal
  exception. Historical process exits showed only the package update and the
  intentional force-stop used for the cold-launch check.

This does not rule out a crash during authenticated work or on a physical
Android device. There is no established trigger, masking condition, or cause.

APK SHA-256:

| Release | SHA-256 |
| --- | --- |
| v1.0.102 | `4d335dd608cf5cdb1e758ad3f2d0ff09a2eb5b5e32f49690788358317bf08ef5` |
| v1.0.107 | `062d38dd0bda7f0202370315456582872341c308f5e85aaefbc8d2e8da051b26` |

## Static review so far

The diff from v1.0.102 to v1.0.107 adds Clerk token retry, the delivery handover
code, and escalation copy. It contains no dependency or native configuration
changes. This comparison has not established a causal divergence.

- `hooks/useTripTracking.ts` disables tracking outside the foreground.
- `hooks/useRiderLocation.ts` uses foreground permission and
  `Location.watchPositionAsync`, with cleanup and caught setup errors.
- Application call sites contain no `startLocationUpdatesAsync`, background
  task definition, or explicit foreground-service start.
- `lib/arrivalNotify.ts` schedules an immediate notification and catches
  failures. It does not request an exact timed alarm.
- `store/push.ts` creates the notification channel before reading permission.

These are observations, not proof that every native path is safe. The service
implementations, merged manifest, and authenticated runtime still need review.

## Resume plan

1. Build a debug-signed **release variant** pointing to the development API and
   development Clerk application, retaining the release native settings and
   Firebase configuration. Use the existing generated Android project and
   ignored local configuration. No Gradle build had started at this checkpoint.
2. Confirm the generated release settings against CI, including Hermes and
   shrinking flags; do not enable additional optimizations just for this test.
3. Install on the supervisor-managed emulator, authenticate as a development
   rider, go online, and exercise a safe test job.
4. Capture logcat through at least 15 minutes with the screen off, then
   background/foreground and continue job screens.
5. Continue native service/configuration review and obtain the failing phone's
   crash log in parallel. Fix only a concrete, evidenced crash path, add a
   regression test, and validate the release variant before opening a PR.

Raw logs, APKs, screenshots, generated native files, and environment files are
local ignored artifacts. They are intentionally absent from this checkpoint
because logs and configuration require privacy review before publication.
