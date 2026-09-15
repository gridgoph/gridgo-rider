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
