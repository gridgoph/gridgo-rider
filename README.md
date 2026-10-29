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
bundle is an extra build that you start by hand. You upload it to Play Console yourself,
or let the run upload it to internal or closed testing (see below).

1. In GitHub, open **Actions → Android release APK or Play testing bundle → Run workflow**. Choose `main`,
   select **play_bundle**, and run it.
2. When the run is green, open its summary and download the `gridgo-rider-<version>-<sha>-play`
   artifact. The zip holds `gridgo-rider-<version>-<sha>.aab`. The summary also shows the versionCode.
3. In Play Console, open **GRIDGO Rider (`ph.gridgo.rider`) → Testing → Internal testing →
   Create new release**, upload the `.aab`, and roll it out to your testers.

That run builds `./gradlew bundleRelease` with the same upload key and public
configuration as the APK. `scripts/verify-release-apk.sh` checks it the same way: the
signer must match the keystore alias, and the API URL, Clerk and CARTO keys must be
inlined in `base/assets/index.android.bundle`. Unless **submit_to_play** is selected,
the run publishes nothing: no APK, no landing-site upload, no GitHub Release and no
release push. The artifact is kept for 30 days.

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

**Upload to a testing track automatically.** Select **submit_to_play** as well
as **play_bundle** when you run the workflow. The run builds and verifies the bundle as
above and keeps the artifact. Then [EAS Submit](https://docs.expo.dev/submit/android/)
uploads that same `.aab` to **internal testing** by default (`eas.json`, profile
`production`). Choose **play_track: closed** for **closed testing** (profile `closed`,
Play track `alpha`). Both use release status `completed`: Google still reviews closed
releases before testers can access them, while a draft would require a manual Play
Console step each time. The run summary names the selected track. **submit_to_play**
does nothing without **play_bundle**, and the APK path is unchanged.

- The build still runs in GitHub Actions with the upload key. EAS only uploads the file.
  No keystore goes to Expo.
- The run never uploads to production and never promotes a release. To move a build to
  another track, promote it by hand in Play Console.
- The step needs two repository secrets: `EXPO_TOKEN` (an Expo access token for the
  `felyciaaa` account) and `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` (the Play service account's
  JSON key, with release permission for testing tracks). The key is written to a mode-600
  file under `$RUNNER_TEMP`, outside the workspace, for that step only. It is never
  printed, and it is removed when the step ends.
- `eas-cli` is pinned in the workflow. The app is linked to its EAS project
  (`@felyciaaa/gridgo-rider`) through `owner` and `extra.eas.projectId` in `app.json`.
- `eas submit` carries no release notes, so the same step then sets them on that release
  with the Google Play Developer API, using the same service account
  (`scripts/play-release-notes.mjs`). This app keeps no What's new file, so the notes are
  the titles of the pull requests merged since the last release tag (`v*`, made by every
  push to `main`), newest first, without release promotions or back-merges, in whole lines
  within Play's 500-character limit for en-US. With nothing new since that tag the notes
  say "Fixes and improvements." The script reads the notes back from Play, and the run
  summary shows them.
- The versionCode is the run number, so every upload is newer than the last one and
  testers get it as an automatic update.
- If the submission fails, the run fails, but the artifact is still there to upload by hand.

## iPhone build and TestFlight

The iPhone app builds on a GitHub-hosted Mac (`macos-26`, Xcode 26.6; Expo SDK 57 needs
Xcode 26.4+), because the repository is public and those minutes are free and uncapped while
the Expo plan's iOS builds run out. **Actions → iOS TestFlight → Run workflow** runs
`eas build --local` with the `production` profile in `eas.json` (an App Store build; EAS
still holds the signing certificate and profile and raises the build number by one each
time) and then uploads the IPA to App Store Connect with `xcrun altool`. Untick
**submit_to_testflight** to build only. The run summary names the version and build number.
Nothing reaches the App Store listing or review from here.

What the iPhone build has that Android does not:

- **Sign in with Apple** on Sign in, above Google (`components/AppleButton.ios.tsx`,
  `lib/appleSignIn.ts`). The session it creates is adopted by the session bridge exactly
  like a Google one, so an Apple ID with no rider account goes to the application form.
  Android and the web draw nothing.
- **Push through Firebase.** The API sends through FCM, which cannot address the APNs token
  expo-notifications returns on iOS, so the iPhone registers Firebase's FCM token instead
  (`lib/firebaseMessaging.ios.ts`). `@react-native-firebase` is linked on iOS only
  (`react-native.config.js`); Android push is unchanged. A build without
  `GoogleService-Info.plist` leaves Firebase out.
- **App Store settings** in `app.json` and `plugins/withIosStoreBuild.js`: iPhone only (no
  iPad), a GRIDGO sentence for every permission (including the Always location strings
  that the trip's background location mode brings), no background audio mode while the
  call microphone stays, the export-compliance answer, and dynamic frameworks for
  Firebase.

The workflow needs, once:

| Where | Name | What |
|---|---|---|
| GitHub secret | `EXPO_TOKEN` | Already used by the Play upload. |
| GitHub secret | `ASC_API_KEY_P8` | App Store Connect API key (Users and Access → Integrations → Team Keys, role App Manager): the `.p8` file's text. |
| GitHub secret | `ASC_KEY_ID` | That key's Key ID. |
| GitHub secret | `ASC_ISSUER_ID` | The Issuer ID shown above the key list. |
| GitHub variable | `ASC_APP_ID` | The app's Apple ID (App Store Connect → the app → App Information). Not secret. |
| GitHub secret | `GOOGLE_SERVICE_INFO_PLIST_BASE64` | The Firebase `GoogleService-Info.plist` for `ph.gridgo.rider`, base64-encoded. Never commit it. |

`EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` and `EXPO_PUBLIC_CARTO_API_KEY`
come from the repository secrets the Android release already uses; the workflow copies them
to the EAS `production` environment as Sensitive variables before each build, and the local
build reads them back from there. The Firebase file is decoded into a private temp file on
the runner instead, because a local build cannot read an EAS Secret file variable.
`app.config.ts` refuses a store build that is missing any of them or the Firebase file
(`iosStoreBuildProblems`). The App Store Connect key lets EAS check the signing credentials
and lets altool upload.

To try the iPhone build locally, drop `GoogleService-Info.plist` in the repo root (it is
gitignored) or point `GOOGLE_SERVICE_INFO_PLIST` at it, then `npx expo prebuild -p ios` on
a Mac. Sign in with Apple and Firebase need a development build; Expo Go has neither.
