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
| `npm start` | Expo dev server |
| `npm run android` / `npm run ios` | Platform-targeted |
| `npm run lint` | ESLint |
| `npm test` | Jest |

Typecheck: `npx tsc --noEmit`.
