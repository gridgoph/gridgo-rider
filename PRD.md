# GRIDGO Rider — PRD (MVP)

**Rider mobile** for GRIDGO logistics between suppliers and clients.

## Sources

- `gridgo-api` `docs/OPERATIONAL_MODEL_V2_API.md` owns API routes, states, transitions, and role projections; `docs/STORAGE_API.md` owns file storage.
- `gridgo-tinker` owns the fleet blueprint.
- [Authentication](AGENTS.md#authentication) owns this app’s identity and membership guidance.

## Job to be done

Apply as a rider, accept dispatch offers after Operations approval, complete the six-point pickup check and spoken sign-off, deliver to the client or designated office, submit evidence, and share live trip location.

## MVP features

| Feature | Status target |
|---|---|
| Rider application, sign-in, and an explicit wait for Operations approval | required |
| Offers list with map, distance, ETA | required |
| Accept job | required |
| Active trip map-first: pickup → delivery proof | required |
| Delivery photo; signature fallback when the camera fails | required |
| Foreground trip location sharing across tabs while carrying the package | required |
| Failed delivery recovery path | required |
| Alerts with server-saved read marks and inbox clearing; account | required |
| Jobs, approvals, and alerts refresh while the app is open | required |
| Order IDs on offers, trip headers, and past-job details for dispatch matching | required |

## Design system

Identical tokens/logo/typography rules as client and supplier.

## Out of scope

Client ordering, supplier production UI, Ops map dispatch console, and cash collection. Operational model v2 has no COD path. The only money shown is the rider’s own delivery fee.
