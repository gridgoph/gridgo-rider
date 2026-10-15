# GRIDGO Rider

The **rider** mobile app for GRIDGO (Davao City managed-printing marketplace).

Scaffolded from `gridgo-client` with the shared design system, logo assets, Expo Router, and NativeWind tokens. Installed SDK and dependency versions are defined in [package.json](package.json).

## Role scope

Riders apply, accept dispatch offers after Operations approval, complete pickup checks and delivery evidence, and share trip location. See [PRD.md](PRD.md) for the product scope and exclusions.

## Shared backend

The app uses Clerk identity and the local **gridgo-api** domain server. Authentication modes and rider membership are defined in [AGENTS.md — Authentication](AGENTS.md#authentication).

```bash
# terminal 1
cd ../gridgo-api && npm install && npm run dev

# terminal 2
npm ci
npm start
```

The API host normally follows the Metro host, including on a physical device. For an explicit backend, set `EXPO_PUBLIC_API_URL` when starting Metro or building the bundle. See [API base configuration](AGENTS.md#mvp-stack-current-phase) for precedence and build-time configuration.

On session restore or return from Google, the app checks the rider account. If that check times out, login shows a connection error and the API address. Check the phone's connection and, during development, that the API is running and reachable at that address before trying again.

## Scripts

| Command | Does |
|---|---|
| `npm start` | Metro for Expo Go (`expo start --go --port 8083`) |
| `npm run start:usb` | Set up USB forwarding and start Metro for the development client |
| `npm run android` | Prebuild and install the development client (`expo run:android`) |
| `npm run ios` | iOS (not in current use) |
| `npm run lint` | ESLint |
| `npm test` | Jest |

Typecheck: `npx tsc --noEmit`.

Day-to-day testing is Expo Go. `npm run android` still builds the USB development client when you need native push or custom-scheme work. Set `GOOGLE_SERVICES_JSON` to the captain's Firebase file for every prebuild / `expo run:android`. Do not commit `/android` or `google-services.json`.

## Job alert taps

An available-job push carries `type: dispatch_available` and `orderId`. Cold-start
and background taps wait for sign-in and navigation, verify the inbox ownership,
and open only that job on Offers. If it has left the pool, the screen explains
that and offers a way back to all jobs. Tapping never accepts automatically.
Notification permission, `gridgo_default`, and token claims use the existing
push store; token rotation registers the token supplied by the native event.


### Release notifications

After the Android workflow uploads the APK and publishes the latest GitHub Release
on a push to `main`, `scripts/announce-release.mjs` broadcasts the released version.
Firstmate configures the repository secret `RELEASE_ANNOUNCE_TOKEN` with the same
value as the API environment variable. Deploy the API release-announcement route
and migration first. Missing configuration skips with a notice; delivery failures
warn in the job summary without failing the published release. Manual dispatches
never broadcast. `lib/releasePush.ts` recognizes the fixed public release copy and
opens this app's existing download URL on a push tap, including while signed out.
A Google Play build ignores that tap's download and leaves the push in the inbox.

## Google Play bundle

The side-load APK is unchanged: every push to `main` still builds it, puts it on the
download page, publishes the GitHub Release and broadcasts the release push. The Play
bundle is an extra build that you start by hand. For now you upload it to Play Console
yourself.

1. In GitHub, open **Actions → Android release APK → Run workflow**. Choose `main`,
   select **play_bundle**, and run it.
2. When the run is green, open its summary and download the `gridgo-rider-<version>-<sha>-play`
   artifact. The zip holds `gridgo-rider-<version>-<sha>.aab`. The summary also shows the versionCode.
3. In Play Console, open **GRIDGO Rider (`ph.gridgo.rider`) → Testing → Internal testing →
   Create new release**, upload the `.aab`, and roll it out to your testers.

That run builds `./gradlew bundleRelease` with the same upload key and public
configuration as the APK. `scripts/verify-release-apk.sh` checks it the same way: the
signer must match the keystore alias, and the API URL, Clerk and CARTO keys must be
inlined in `base/assets/index.android.bundle`. The run publishes nothing: no APK, no
landing-site upload, no GitHub Release and no release push. The artifact is kept for
30 days.

The run sets `EXPO_PUBLIC_APP_DISTRIBUTION=play` when it builds. Google Play does not
allow an app installed from Play to offer an APK from somewhere else. With the flag set,
the app never reads GitHub for a newer release, and the update sheet, the "Update
completed" sheet and the release push's download link are all off
(`lib/buildDistribution.ts`, `offersSideloadUpdates` in `lib/appUpdate.ts`). Play
delivers the updates. When the flag is not set, the build is the side-load APK, and it
behaves as before.

**versionCode.** Play accepts only a versionCode higher than every one it has seen for
the app. The versionCode is the workflow's run number (`GRIDGO_BUILD_NUMBER`, see
`app.config.ts`). APK runs and Play runs share one counter, and each new run gets a
higher number, so a new Play run always has a higher versionCode than the last bundle
you uploaded. Upload bundles oldest first. Do not upload a bundle from an older run after
a newer one. A **Re-run** keeps the original run's number, so start a new run instead.
GitHub restarts the count if the workflow file is renamed or replaced, so keep the file
where it is.

**Later: `eas submit`.** [EAS Submit](https://docs.expo.dev/submit/android/) can upload
the same artifact to a Play track instead of you. It needs a Google Play service account
key, stored as a secret, with release permission in Play Console. Google also requires the
first upload of an app to be made by hand, and that is what the steps above do. When
that is set up, a later workflow step can run `eas submit --platform android --path <aab>
--non-interactive` with the track set in `eas.json` under `submit.production.android`.
That step needs the EAS project linked to this app, and it is not wired up yet.
