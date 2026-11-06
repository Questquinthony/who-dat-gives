# Who Dat Gives

New Orleans Saints vs. Carolina Panthers — November 15, 2026, Caesars Superdome.

This repository contains a mobile-first **preview** of the Who Dat Gives raffle website: sample $15 entry calculator, example numbered ticket starting at 01, and sample celebration/confirmation. **It does not accept payments or issue valid raffle entries.**

## Development status

The public sale/payment flow, official eligibility and rules, raffle authorization, inventory of prizes, secure receipt ledger, unique ticket numbering, and payment verification must be completed before launch.

## Deployment

Use the existing Vercel project `who-dat-gives` under `questquinthonys-projects`. Do not create a duplicate Vercel project.

The supplied original raffle artwork belongs at `assets/saints-raffle-artwork.webp`. If that file is unavailable, a styled text fallback remains visible.

This is an independent community initiative; not affiliated with or endorsed by the NFL or the New Orleans Saints.

## Private family entry

Set the server-only `FAMILY_INVITE_KEY` to a randomly generated 32-byte
hex key (`openssl rand -hex 32`). The organizer shares the site link with
`#invite=YOUR_KEY` appended, privately with family. The browser clears the
fragment from the address bar and sends the key only to the same-origin
checkout endpoints. Anyone with a forwarded copy can use the link, so rotate
the key if needed. Rotation does not invalidate existing private receipts.

The public homepage remains a sample preview. Paid reservations require both
the private invitation and the existing checkout configuration. Keep the key
separate from the organizer access key.
