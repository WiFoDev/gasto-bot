# Bank email setup (Phase 6)

BCP card-purchase notifications → Gmail filter → Cloudflare Email Routing →
Email Worker → `POST /inbound/bank-email` → expense + WhatsApp confirmation.

```
BCP ──email──▶ Gmail ──auto-forward──▶ gastos-<random>@<sub>.<domain>
                                            │ (Email Routing rule)
                                            ▼
                                   gastobot-email-worker
                                            │ POST raw MIME + Bearer
                                            ▼
                               Railway: /inbound/bank-email
```

## 1. Railway env

| Variable | Value |
|---|---|
| `INBOUND_EMAIL_SECRET` | `openssl rand -hex 32` (same value goes to the Worker) |
| `KAPSO_PHONE_NUMBER_ID` | Kapso dashboard → the bot's number → Phone Number ID |
| `BANK_EMAIL_USER_PHONE` | Your number as stored in `users.phone` (`+51…`) |

The route rejects every request (401) while `INBOUND_EMAIL_SECRET` is unset.

## 2. Cloudflare Email Routing (on a subdomain)

Email Routing replaces the zone's MX records. If the apex domain already
receives mail (e.g. Google Workspace), **enable it on a subdomain only**.

1. Dashboard → the zone → Email → Email Routing → Settings → add subdomain
   `<sub>.<domain>`; accept the MX/SPF records it creates for that subdomain.
2. Add your Gmail as a **destination address** and verify it (needed for
   the confirmation step below).

## 3. Deploy the Worker

```sh
cd infra/email-worker
npx wrangler deploy
npx wrangler secret put INBOUND_URL           # https://<railway-host>/inbound/bank-email
npx wrangler secret put INBOUND_EMAIL_SECRET  # same as Railway
npx wrangler secret put ALLOWED_FORWARDER     # your Gmail address
```

The Worker only accepts mail whose envelope sender is `ALLOWED_FORWARDER`
(or Gmail's auto-forward form `local+caf_…@gmail.com`), caps size at 1 MB,
and logs one line per message (`npx wrangler tail`).

## 4. Routing rule + Gmail forwarding

Use an unguessable address, literal rule only (no catch-all):
`gastos-<random>@<sub>.<domain>`.

1. Create the rule with action **Send to an email → your Gmail** (temporary).
2. Gmail → Settings → Forwarding and POP/IMAP → Add a forwarding address →
   the routing address. Google's confirmation code arrives in your inbox
   via step 1; confirm it.
3. Edit the rule: action **Send to a Worker → gastobot-email-worker**.
4. Gmail → create filter:
   `from:notificaciones@notificacionesbcp.com.pe subject:"Realizaste un consumo"`
   → Forward to the routing address (keep "never send to spam").
   Do **not** enable account-wide forwarding.

## 5. Verify (GATE #6)

- Make a real credit-card purchase. Within 60 s you get
  `🏦 BCP · S/… en … → …` on WhatsApp.
- `mis gastos hoy` lists it.
- Logs: Worker `forwarded status 200 {"status":"processed"}`, Railway
  `bank_email_processed`.

## Troubleshooting

| Symptom | Where to look |
|---|---|
| Nothing arrives | `wrangler tail`: `rejected sender` → `ALLOWED_FORWARDER` mismatch |
| `status 401` in Worker log | Secret differs between Worker and Railway |
| `{"status":"rejected"}` | Railway `bank_email_rejected` reason (`wrong_sender`, `invalid_mime`) |
| `{"status":"skipped"}` | Not a credit-card consumo (debit, Yapeo, statements are out of scope) |
| `{"status":"ignored"}` | Duplicate operation number, or `BANK_EMAIL_USER_PHONE` unset/unknown |
| Expense logged, no WhatsApp | Railway `bank_notify_error`; outside the 24h window → see TASK-74 |
