# GRIDGO Rider — PRD (MVP)

**Rider mobile** for GRIDGO logistics between suppliers and clients.

## Sources

- Tinker PRD (rider role, delivery states, COD collection)
- Supplier presentation ecosystem (rider system both ways)
- Captain MVP: custom auth + local API

## Job to be done

Accept dispatch offers, pick up from supplier, deliver to client, submit proof, collect COD when required, share active-trip location (demo pings).

## MVP features

| Feature | Status target |
|---|---|
| Custom login; role `rider` | required |
| Offers list (ready_for_dispatch) | required |
| Accept job | required |
| Active trip: pickup → delivery proof | required |
| COD collection proof when paymentMethod=cod | partial |
| Location pings while trip active | API ready; UI later |
| Alerts + account | required |

## Design system

Identical tokens/logo/typography rules as client and supplier.

## Out of scope

Client ordering, supplier production UI, Ops map dispatch console.
