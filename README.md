# GRIDGO Rider

The **rider** mobile app for GRIDGO (Davao City managed-printing marketplace).

Scaffolded from `gridgo-client` with the same design system, starter template, logo assets, Expo SDK 54, Expo Router, and NativeWind tokens.

## Role scope

- Accept dispatch offers
- Navigate to supplier / client
- Pickup and delivery proof (OTP / photo / signature)
- Active-trip location sharing
- COD collection proof when required

## Shared demo backend

All GRIDGO mobile apps talk to the local **gridgo-api** demo server (not Clerk / Supabase / PayMongo).

```bash
# terminal 1
cd ../gridgo-api && npm install && npm run dev

# terminal 2
npm install
EXPO_PUBLIC_API_URL=http://127.0.0.1:8787 npm start
```

On a physical device, use your machine's LAN IP instead of `127.0.0.1`.

## Scripts

| Command | Does |
|---|---|
| `npm start` | Metro for the USB development build (`expo start --dev-client`, port 8083) |
| `npm run android` | Prebuild and install the development client (`expo run:android`) |
| `npm run ios` | iOS (not in current use) |
| `npm run lint` | ESLint |
| `npm test` | Jest |

Typecheck: `npx tsc --noEmit`.

Local Android work is a USB development build, not Expo Go. Set `GOOGLE_SERVICES_JSON` to the captain's Firebase file for every prebuild / `expo run:android`. Do not commit `/android` or `google-services.json`.

## Android emulator API URL

From the **Android emulator**, `127.0.0.1` is the emulator itself. Use:

```bash
EXPO_PUBLIC_API_URL=http://10.0.2.2:8787 npm start
```

Physical device: use the host LAN IP (e.g. `http://192.168.1.55:8787`).
