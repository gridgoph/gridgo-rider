# Acknowledgement receipt at the door (gridgo-rider#152)

Expo web at 390 × 844, against a scratch gridgo-api `dev` (82d6bbf) with its own
PostgreSQL and MinIO, migrated and seeded with `seed:dev` (Clerk lookups stubbed,
rig-minted tokens). The order is a real client checkout at Lovis Printshop (two
lines, ₱2,052.30 paid up front by manual QR), dispatched, checked, signed and
carried by the seeded rider over HTTP. Arrival was tapped in the app.

1. `01`, `02`: on the way, before arrival. No amounts, and no receipt request.
2. `03`, `04`, `05`: after "I'm at the client's door", in light, dark and 1.3× text.
   The app recorded arrival (`200`), found no receipt (`404`) and issued one
   (`201`, AR-0000000001). Reopening read it with `GET` (`200`) and never asked
   for another number.
3. `06`: the same screen, still open, after the delivery was recorded. The live
   refresh dropped the receipt. The rider's `GET` and `POST` now answer `403`;
   the client still reads AR-0000000001.
4. `07`: the past job shows only the fee and the rider's own pay.

"Issued to" reads `markdavidprado` because the rig's stubbed Clerk lookup gave
the seeded client that name. The receipt freezes the account name at issue.
