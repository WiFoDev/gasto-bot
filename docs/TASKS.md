# TASKS

## Completed

- [x] TASK-31: Translate `formatter.ts` to LATAM Spanish + update tests
- [x] TASK-32: Translate `handler.ts` + `webhook.ts` strings + update tests
- [x] TASK-33: Final Spanish translation verification pass
- [x] TASK-34: Pass conversation context to parser during confirmation flow
- [x] TASK-35: Handler fallback for bare-text corrections in confirmation state
- [x] TASK-36: Unit tests for bare-text corrections during confirmation flow

---

## Next Tasks

### Phase 1: Dynamic Categories + Payment Methods (Foundation)

> **Philosophy**: Categories emerge from user interactions. The AI suggests new categories when expenses don't fit, and users confirm to create them. Payment methods are tracked per expense.

- [x] TASK-37: Migration + types for dynamic categories and payment methods
  - Create `migrations/002_dynamic_categories_payment.sql`: add `payment_type` (enum) + `payment_method_name` (text) to expenses, add `created_at` to categories
  - Update `src/types.ts`: add payment fields to `Expense`, `ParseResult`, `PendingExpense`. Add `suggested_category_name` to `ParseResult`/`PendingExpense`. Add `list_categories` intent. Add `awaiting_category_confirmation` to `LastAction`
  - Type-check with `npx tsc --noEmit`

- [x] TASK-38: DB functions for category management + payment fields
  - Add `insertCategory(userId, name, slug, icon)` and `deleteCategory(userId, categoryId)` to `src/db.ts`
  - Update `insertExpense` to accept `payment_type` and `payment_method_name`
  - Unit tests for new mock patterns
  - Integration tests for `insertCategory`, `deleteCategory`
  - Depends on: TASK-37

- [x] TASK-39: Slug generation utility
  - Create `src/utils.ts` with `slugify(name: string): string`
  - Rules: lowercase, spaces/special chars → underscore, remove accents, max 40 chars
  - Unit tests: "Gym & Fitness" → "gym_fitness", "Mascotas" → "mascotas", "Café/Snack" → "cafe_snack"

- [x] TASK-40: Update expense-parser prompt for open-ended categories + payment extraction
  - Modify `src/prompts/expense-parser.ts`: instruct AI to suggest new categories when no fit (set `category_slug: null` + `suggested_category_name: "Name"`)
  - Add payment method extraction rules ("con yape" → digital_wallet/Yape, "tarjeta" → credit_card, "efectivo" → cash)
  - Add new fields to JSON output schema: `suggested_category_name`, `payment_type`, `payment_method_name`
  - Depends on: TASK-37

- [x] TASK-41: Update parse.ts to map new fields + unit tests
  - Map `suggested_category_name`, `payment_type`, `payment_method_name` from AI response
  - Update `tests/unit/parse.test.ts` with new JSON shape tests
  - Depends on: TASK-37, TASK-40

- [x] TASK-42: Formatter — new category confirmation + payment display
  - Add `formatNewCategoryConfirmation(pending, suggestedName)`: "S/120.00 — No tengo 'Mascotas'. Creo la categoria?"
  - Add `formatCategoryCreated(category)`: "Categoria creada: 🐾 Mascotas"
  - Add `formatCategoryList(categories)`: list all user categories with icons
  - Update `formatExpenseConfirmation()` to show payment method when present
  - Inline snapshot tests for all new formatters
  - Depends on: TASK-37

- [x] TASK-43: Handler — category confirmation flow + list_categories + payment passthrough
  - Add `awaiting_category_confirmation` state handling: confirm → create category + log expense, deny → fallback to "other"
  - Route `list_categories` intent to `formatCategoryList()`
  - Pass `payment_type`/`payment_method_name` through pending expense to insert
  - Unit tests: ~10 new tests for state transitions, category creation, payment flow
  - Depends on: TASK-38, TASK-39, TASK-41, TASK-42

- [x] TASK-44: Integration parse accuracy gate with new fixtures — 🚧 GATE #3
  - Add ~15 fixtures to `tests/fixtures/messages.ts`: payment methods ("almuerzo 35 con yape"), new category suggestions ("veterinario 120"), list_categories ("mis categorias")
  - Run `npm run test:integration` — parse accuracy must be >= 85%
  - **Gate blocks Phase 2**
  - Depends on: TASK-40, TASK-41

- [x] TASK-45: Update CLAUDE.md for Phase 1
  - Add `src/utils.ts` to architecture section
  - Update intent list to include `list_categories`
  - Add note about dynamic user-driven categories
  - Update db.ts function count
  - Depends on: TASK-44

---

### Phase 2: Budget Alerts + Monthly Closing

> **Budget alerts**: Reactive warnings appended to expense confirmation when budget is approaching/exceeded.
> **Monthly closing**: New intent "cierra febrero" produces a comprehensive month summary.

- [x] TASK-46: Reactive budget alerts after expense logging
  - After `resolveAndInsertExpense`, check applicable budgets (category + overall)
  - >= 80% → `⚠️ Llevas S/640 de S/800 en Comida (80%)`
  - Exceeded → `🚨 Presupuesto excedido: S/850 / S/800`
  - New: `checkBudgetAlerts()` in handler, `formatBudgetAlert()` in formatter
  - Unit tests: expense at 79% (no alert), 85% (warning), 105% (exceeded)
  - Depends on: Phase 1 (TASK-45)

- [x] TASK-47: Types + prompt for monthly_closing intent
  - Add `monthly_closing` to Intent type
  - Add `target_month`/`target_year` to ParseResult
  - Update expense-parser prompt with monthly_closing intent + examples ("cierra febrero", "cierre del mes")
  - Depends on: Phase 1

- [x] TASK-48: DB query for monthly closing data
  - New `getMonthlyClosingData(userId, year, month)` in db.ts: expenses grouped by category + previous month total + budgets
  - Integration test
  - Depends on: TASK-47

- [x] TASK-49: Handler + formatter for monthly closing
  - `handleMonthlyClosing()` — fetches data, formats response
  - `formatMonthlyClosing()` — "📊 Cierre Febrero 2026", total with prev month comparison, per-category breakdown with % and budget status
  - Unit tests for handler routing and formatter output (inline snapshots)
  - Depends on: TASK-47, TASK-48

- [x] TASK-50: Integration parse fixtures for monthly closing
  - Add ~5 fixtures: "cierra febrero", "cierre del mes", "resumen mensual"
  - Verify correct month/year extraction
  - Depends on: TASK-47

---

### Phase 3: Receipt Item Breakdown

> Extract individual line items from receipt photos. One expense = one total. Items stored as detail records with AI-assigned subcategories (free text: "lacteos", "limpieza", "proteina"). Graceful degradation: empty items array if receipt is blurry.

- [x] TASK-51: Migration + types for receipt items
  - Create `migrations/003_receipt_items.sql`: `receipt_items` table (expense_id FK, description, quantity, unit_price, total, subcategory TEXT)
  - Add `ReceiptItem`, `ReceiptItemParsed` interfaces to types.ts
  - Add `items: ReceiptItemParsed[]` to `ReceiptResult`
  - Depends on: Phase 2

- [x] TASK-52: Update receipt-parser prompt for item extraction
  - Update `src/prompts/receipt-parser.ts` with line item extraction rules
  - AI assigns subcategory per item (free text: "proteina", "verdura", "limpieza", etc.)
  - Add `items` array to JSON output
  - Backward compatible: items can be empty array
  - Depends on: TASK-51

- [x] TASK-53: DB functions for receipt items
  - `insertReceiptItems(expenseId, items[])` and `getReceiptItems(expenseId)` in db.ts
  - Integration test
  - Depends on: TASK-51

- [x] TASK-54: Handler update for receipt item flow
  - Include `items` in PendingExpense during receipt confirmation
  - After expense insert, insert receipt items
  - Unit tests
  - Depends on: TASK-52, TASK-53

- [x] TASK-55: Formatter — receipt confirmation with item summary
  - Update `formatReceiptConfirmation()` to show items grouped by subcategory (top 5 groups)
  - If no items → existing format (backward compatible)
  - Inline snapshot tests
  - Depends on: TASK-54

- [x] TASK-56: Update CLAUDE.md for Phase 3
  - Remove "Parse receipt line items — totals only" from Do NOT list
  - Add: "Receipt items are sub-items of ONE expense, not multiple expenses"
  - Depends on: TASK-55

---

### Bug Fixes: Category Handling

> Two bugs discovered 2026-03-11 in production. Both relate to category handling edge cases not covered during Phase 1.

- [x] BUG-01: Fix `correct_expense` crash when changing to non-existent category
  - **Symptom**: User logs expense, asks "cambiar categoría a familia" → "Algo salió mal, intenta de nuevo"
  - **Root cause**: `handleCorrectExpense` in `handler.ts` only handles `category_slug` (existing categories). When parser returns `category_slug: null` + `suggested_category_name`, the update payload is empty → `formatError()`
  - **Fix**: Add new-category confirmation flow inside `handleCorrectExpense`, mirroring the `log_expense` flow. When `suggested_category_name` is set and `category_slug` is null, enter `awaiting_category_confirmation` state with correction context
  - Write failing tests first, then fix handler
  - Files: `tests/unit/handler.test.ts`, `src/handler.ts`

- [x] BUG-02: Allow alternative category selection during `awaiting_category_confirmation`
  - **Symptom**: Bot asks "¿La creo?" for unknown category, user replies "mejor usa Housing" → "No entendí eso"
  - **Root cause**: Confirmation handler only accepts yes/no regex. Any other reply clears state and re-parses as fresh message → `intent: 'unknown'`
  - **Fix**: Before falling through to fresh parsing, attempt to match the reply against existing user categories. If a match is found, use that category for the pending expense instead of creating a new one
  - Write failing tests first, then fix handler
  - Files: `tests/unit/handler.test.ts`, `src/handler.ts`
  - Depends on: BUG-01 (shares state/confirmation flow patterns)

---

### Phase 4: Financial Rules Engine

> User-defined rules checked on every expense log. Types: spending limits, payment defaults, prohibitions, habits. Violation alerts appended to expense confirmation.

- [x] TASK-57: Migration + types for financial rules
  - Create `migrations/005_financial_rules.sql`: `financial_rules` table (user_id, name, rule_type, category_id, threshold, period, action_value, is_active)
  - Add `FinancialRule` interface. Add `set_rule`, `list_rules`, `delete_rule` intents
  - Depends on: Phase 3

- [x] TASK-58: DB functions for rules CRUD
  - `insertRule`, `getActiveRules`, `deleteRule` in db.ts
  - Integration tests
  - Depends on: TASK-57

- [x] TASK-59: Rules engine — checking logic
  - New `src/rules.ts`: `checkRules(userId, expense, rules): RuleViolation[]`
  - Pure function, no side effects
  - Unit tests with various rule combinations
  - Depends on: TASK-57

- [x] TASK-60: Prompt update for rule intents
  - Add `set_rule`, `list_rules`, `delete_rule` to expense-parser prompt with examples
  - Add ~10 fixtures: "avisa si gasto mas de 100 en comida", "mis reglas", "borra la regla de comida"
  - Depends on: TASK-57

- [x] TASK-61: Handler for rule CRUD + violation checks
  - `handleSetRule()`, `handleListRules()`, `handleDeleteRule()`
  - After expense logging, call `checkRules()` and append alerts
  - Unit tests
  - Depends on: TASK-58, TASK-59, TASK-60

- [x] TASK-62: Formatter for rules
  - `formatRuleCreated()`, `formatRuleList()`, `formatRuleDeleted()`, `formatRuleViolation()`
  - Inline snapshot tests
  - Depends on: TASK-61

- [x] TASK-63: Integration parse accuracy test for rule intents
  - Verify rule intent fixtures parse correctly
  - Depends on: TASK-60

---

### Phase 5: Infrastructure

- [x] TASK-64: Keep-alive cron to stop free-tier shutdown
  - Supabase pauses a free project after 7 days idle; a cold Railway container
    is slow on the first webhook. Railway has no scheduler, so the trigger is
    GitHub Actions
  - `pingDatabase()` in `db.ts` (cheapest possible round-trip)
  - `src/keep-alive.ts`: `runKeepAlive()` (never throws, reports per-probe
    status) + `isCronAuthorized()` (constant-time bearer check)
  - `GET`/`POST /cron/keep-alive` in `webhook.ts`, gated on `CRON_SECRET`.
    Returns 200 even on probe failure so the cron doesn't retry-storm
  - `.github/workflows/keep-alive.yml` — hourly at :27, 3 retries, fails the
    job when the ping doesn't come back `ok:true`
  - Unit tests: `tests/unit/keep-alive.test.ts` + keep-alive cases in
    `tests/unit/webhook.test.ts`
  - Manual step: set `CRON_SECRET` on Railway and add `CRON_SECRET` +
    `KEEP_ALIVE_URL` repo secrets

- [x] TASK-77: Interactive confirm buttons (WhatsApp reply buttons)
  - Confirmation prompts ship with tappable reply buttons; typed replies
    ("sí", "no", corrections) keep working exactly as before
  - `src/types.ts`: `ReplyButton`, `BotReply { text, buttons? }`;
    `MessageHandler` returns `BotReply` and accepts `type: 'button'` (content =
    button id); webhook payload gains `interactive.button_reply`
  - `src/formatter.ts`: `BUTTON_IDS`, `expenseConfirmButtons()`
    (✅ Guardar / ❌ Cancelar), `newCategoryButtons()` (✅ Crear / 📁 Usar Otros),
    `formatButtonExpired()`
  - `src/handler.ts`: receipt confirmation, mid-confidence text confirmation
    (incl. re-shown after a correction) and new-category confirmation return
    buttons. A button tap maps onto the existing confirm/deny branch for the
    matching state — no new state, no extra LLM call. A tap with no matching
    state (TTL expired / older prompt) → `formatButtonExpired()`, state untouched
  - `src/webhook.ts`: accept `interactive` + `button_reply`; send via
    `sendInteractiveButtons` when the reply has buttons, falling back to
    `sendText` if that call fails
  - Unit tests: button cases in `handler.test.ts`, `webhook.test.ts`,
    `formatter.test.ts`

- [x] TASK-78: Receipt category from Vision
  - Receipts were always saved under `other`; the Vision parse now picks the
    category in the same single call — no extra LLM call
  - `src/types.ts`: `ReceiptResult` gains `category_slug: string | null`
  - `src/prompts/receipt-parser.ts`: `receiptParserPrompt(categories, today)`
    lists the user's categories and asks for the one slug that fits the whole
    purchase (supermarket → groceries, restaurant → food_dining, pharmacy →
    health), or null when unsure
  - `src/parse-image.ts`: `parseReceipt(imageBuffer, categories)`; missing /
    error → `category_slug: null`
  - `src/handler.ts`: `handleImageMessage` accepts the slug only if it matches a
    user category, else falls back to `other`; sets `pending.category_slug` and
    shows that category in the receipt confirmation (buttons unchanged)
  - No new-category suggestion for receipts (out of scope)
  - Unit tests: `parse-image.test.ts`, `handler.test.ts` (valid slug, unknown
    slug → other, null → other, categories passed to prompt). Integration:
    optional `category_slug` on receipt fixtures feeds a category-accuracy
    check (≥ 70%) next to GATE #2

---

### Phase 6: BCP Email Ingestion (Auto-Logging)

> **Philosophy**: Card spend should log itself. BCP already emails a
> "Realizaste un consumo" notification per credit-card purchase; the user
> forwards those to GastoBot, which registers the expense and confirms on
> WhatsApp. Manual WhatsApp entry stays as-is for cash, Yape/Plin and
> anything else the bank doesn't email. Single user, single bank (BCP)
> for this phase.
>
> **What a BCP notification contains** (verified on real emails, sender
> `notificaciones@notificacionesbcp.com.pe`, subject
> `Realizaste un consumo con tu Tarjeta de Crédito BCP - Servicio de Notificaciones BCP`):
> amount + currency (`S/ 34.00` or `$ 14.99`), `Empresa` (merchant, often
> prefixed `DLC*` / `IZI*`), `Fecha y hora` (`07 de setiembre de 2026 - 05:55 PM`,
> Lima local, note "setiembre"), card last 4 (`************1234`),
> `Número de operación` (10 digits — natural idempotency key). Other BCP
> emails on the same sender (Yapeo received, estado de cuenta) must be ignored.
>
> **Pipeline**: Gmail filter auto-forwards BCP notifications → Cloudflare
> Email Routing → tiny Email Worker POSTs the raw MIME to
> `POST /inbound/bank-email` (bearer secret) → parse (regex, no LLM) →
> merchant memory or ONE Claude categorization call → `insertExpense`
> (source `email`) → WhatsApp confirmation. Registration must succeed even
> if the WhatsApp send fails.
>
> **Architecture exception**: this is an event-driven trigger and a
> bot-initiated message, both currently banned in CLAUDE.md. TASK-65
> carves out the exception explicitly before any code. Scheduled/product
> alerts remain banned.
>
> **Decision needed before TASK-73**: Cloudflare Email Routing needs a
> domain on Cloudflare (free routing; domain ~$10/yr if none). Fallback is
> a paid inbound-parse provider (Postmark/Resend) posting to the same route.

- [x] TASK-65: Amend architecture constraints for the bank-email channel ⚡ CRITICAL PATH
  - `CLAUDE.md` Do-NOT list: add the inbound bank-email trigger and its
    single confirmation message as the second deliberate exception (next to
    keep-alive). Wording: "sends exactly one message per bank email, never
    on a schedule"
  - `docs/PRD.md`: add F7 "Bank email auto-logging (BCP)" under Core
    Features; adjust Non-Goals if they exclude bank integrations
  - `docs/TASKS.md` Future Ideas: note that proactive *scheduled* alerts stay
    blocked; Phase 6 is not a scheduler
  - No code. Commit: `docs(TASK-65): carve out bank-email exception`

- [x] TASK-66: Migration + types for email-sourced expenses
  - Depends on: TASK-65
  - `migrations/006_bank_email.sql`: relax `expenses.source` CHECK to
    `('text','image','email')`; add `bank_reference TEXT` + partial unique
    index `(user_id, bank_reference) WHERE bank_reference IS NOT NULL`
  - `src/types.ts`: `Expense.source` / `PendingExpense.source` gain
    `'email'`; add `bank_reference: string | null` to `Expense`; new
    `BankTransaction { bank: 'bcp'; amount; currency; merchant; date; time;
    card_last4; operation_number; raw_text }`; new `InboundEmail { from; to;
    subject; text; receivedAt }`
  - `src/config.ts` + `.env.example`: `INBOUND_EMAIL_SECRET` (optional,
    endpoint closed when empty — same pattern as `CRON_SECRET`),
    `KAPSO_PHONE_NUMBER_ID`, `BANK_EMAIL_USER_PHONE` (which user receives
    the auto-logged expenses)
  - `db.ts`: `insertExpense` accepts `bank_reference`; new
    `getExpenseByBankReference(userId, ref)`
  - Unit tests: `config.test.ts` for the new env handling
  - Manual step: run migration on Supabase; set env vars on Railway

- [x] TASK-67: BCP email parser (pure, no LLM) 🚧 GATE #4
  - Depends on: TASK-66
  - `src/parse-bank-email.ts`: `parseBcpEmail(email: InboundEmail): BankTransaction | null`
    - Returns `null` unless subject matches the "Realizaste un consumo"
      notification (Yapeo received, estado de cuenta → null)
    - Regex over the plain-text body: `Total del consumo`, `Empresa`,
      `Fecha y hora`, card last 4, `Número de operación`
    - `S/` → `PEN`, `$` → `USD`; Spanish month map incl. `setiembre` and
      `septiembre`; 12h → 24h; date is taken from the email body (already
      Lima local), NOT from the arrival timestamp
    - `bank_reference` = `bcp:<operation_number>`
  - `tests/fixtures/bcp-emails.ts`: ~10 anonymized samples built from real
    emails (PEN, USD, `DLC*`/`IZI*` prefixes, multi-word merchants, a Yapeo
    receipt, a statement email, a truncated body)
  - `tests/unit/parse-bank-email.test.ts`
  - **GATE #4: 100% field accuracy on fixtures** (deterministic parser — no
    tolerance). Gate blocks TASK-71
  - **Result**: GATE #4 PASSED — 15/15 fixtures (10 parsed, 5 ignored).
    Findings from real emails: BCP sends HTML only (no text/plain part) so
    the parser strips HTML itself (`InboundEmail.html` added); debit-card
    operation numbers are 6 digits; amounts can carry thousands commas.
    Scope decision: credit card only — debit-card "consumo" and credit-card
    "operación" emails return null

- [x] TASK-68: Merchant memory (skip Claude for known merchants)
  - Depends on: TASK-66
  - `src/utils.ts`: `normalizeMerchant()` — strip `DLC*`, `IZI*`, `*` payment
    processor prefixes, collapse whitespace, uppercase
  - `db.ts`: `getLastExpenseByMerchant(userId, normalizedMerchant)` — most
    recent non-deleted expense whose normalized merchant matches
  - Rationale: the same merchants repeat daily (Uber, Wong, padel clubs).
    Once the user corrects a category via WhatsApp, every later email from
    that merchant follows the correction with zero LLM cost
  - Unit tests: `utils.test.ts` (normalization cases), db mock test
  - **Note for TASK-71**: store the RAW bank merchant (`DLC*UBER RIDES`) in
    `expenses.merchant` (clean name goes in `description`) — memory matches
    on `normalizeMerchant(expenses.merchant)`. A star followed by a space
    (`ANTHROPIC* CLAUDE SUB`) is the merchant's own descriptor, not stripped

- [x] TASK-69: Merchant categorizer prompt + accuracy test 🚧 GATE #5
  - Depends on: TASK-67
  - `src/prompts/merchant-categorizer.ts` + `src/categorize-merchant.ts`:
    ONE Claude call (same model/settings as `parse.ts`) with merchant,
    amount, currency and the user's categories → `{ category_slug | null,
    suggested_category_name, description, confidence }`. `description` is
    a clean human name ("Uber", "Wong Benavides", "Amazon Prime")
  - Reuses the dynamic-category contract from Phase 1 (null slug + suggested
    name when nothing fits)
  - `tests/fixtures/merchants.ts`: ~20 real BCP merchant strings with
    hand-labeled categories
  - `tests/integration/categorize-merchant.test.ts`
  - **GATE #5: ≥ 80% category accuracy on the merchant fixtures**. Gate
    blocks TASK-71
  - **Result**: GATE #5 PASSED — 20/22 (90.9%) on the user's real 14
    categories. Misses: `WL *STEAM PURCHASE` → suscripciones (expected
    entertainment), `MDOPAGO*FREEPASS` → suscripciones (expected shopping —
    a Mercado Libre printer). Labels by the user 2026-11-19; unknowable
    merchants (store codes, LIMABLUE podologist) excluded from fixtures

- [x] TASK-70: Outbound WhatsApp module
  - Depends on: TASK-66
  - `src/whatsapp.ts`: `sendWhatsAppText(to, body)` built on the existing
    `WhatsAppClient`, using `KAPSO_PHONE_NUMBER_ID` from config (the inbound
    webhook currently takes the id from the payload; outbound needs it
    statically)
  - Refactor `webhook.ts` to call `sendWhatsAppText` (behavior unchanged)
  - Unit tests: `tests/unit/whatsapp.test.ts`; existing `webhook.test.ts`
    keeps passing

- [x] TASK-71: `handleBankEmail()` — register + confirm ⚡ CRITICAL PATH
  - Depends on: TASK-67 (GATE #4), TASK-68, TASK-69 (GATE #5), TASK-70
  - `src/handler.ts`: `handleBankEmail(tx: BankTransaction): Promise<string | null>`
    1. Resolve user via `BANK_EMAIL_USER_PHONE`
    2. Idempotency: if `getExpenseByBankReference` hits → log
       `bank_email_duplicate`, return null (no message)
    3. Category: merchant memory first; else categorizer. Below
       `CONFIDENCE_CONFIRM` → fall back to `other` (never block on a
       question the user didn't ask)
    4. `resolveAndInsertExpense` with `source: 'email'`,
       `payment_type: 'credit_card'`, `payment_method_name: 'BCP ***<card_last4>'`,
       `raw_input` = email text, `bank_reference`, currency as-is (USD stays
       USD, same as manual USD entries today)
    5. Reuse the existing budget-alert and rule-violation checks
    6. `setState(phone, { lastAction: 'expense_logged', lastExpenseId })` so
       "eso fue transporte" / "borra eso" work through the existing
       correct/delete intents
  - `src/formatter.ts`: `formatBankExpenseLogged(expense, category, tx)` —
    WhatsApp-friendly, e.g. `🏦 BCP · S/ 34.00 en Sienna Bakery → Comida`
    plus a one-line hint on how to correct
  - Unit tests: `handler.test.ts` (duplicate, memory hit, categorizer path,
    low confidence → other, USD, alerts appended, state set) +
    `formatter.test.ts` inline snapshots

- [x] TASK-72: `POST /inbound/bank-email` route ⚡ CRITICAL PATH
  - Depends on: TASK-71
  - `webhook.ts` (HTTP only): accepts raw MIME (`message/rfc822` or
    `text/plain`); bearer check with the constant-time compare from
    `keep-alive.ts` (generalize `isCronAuthorized` → `isBearerAuthorized`);
    401 when secret missing/mismatch; 200 for everything after auth so the
    forwarder never retry-storms
  - Parse MIME with `postal-mime` (works in Node and Workers — verify API
    via Context7 at implementation time); require `from` ==
    `notificaciones@notificacionesbcp.com.pe` else `bank_email_rejected`
  - Flow: parse → `parseBcpEmail` → null ⇒ `bank_email_skipped` → else
    `handleBankEmail` → `sendWhatsAppText` (best-effort; failure logs
    `bank_notify_error`, expense stays registered)
  - Structured logs only carry amount, currency, merchant, operation number
    — never the email body
  - `handleBankEmail` injected through plugin options like `handleMessage`
  - Unit tests: `webhook.test.ts` (auth, wrong sender, non-consumo email,
    happy path, notify failure still 200, duplicate)

- [ ] TASK-73: Cloudflare Email Worker + Gmail forwarding 🚧 GATE #6 (manual E2E)
  - Depends on: TASK-72
  - `infra/email-worker/worker.js` (~30 lines, no deps): reads
    `message.raw`, POSTs it to `INBOUND_URL` with `Authorization: Bearer`;
    `wrangler.toml` alongside. Not part of the TS build
  - `docs/BANK_EMAIL_SETUP.md`: Email Routing address
    `gastos-<random>@<domain>` → Worker; Gmail filter
    `from:notificaciones@notificacionesbcp.com.pe subject:"Realizaste un consumo"`
    → forward (Gmail's forwarding-address confirmation code arrives at the
    Worker: temporarily route the address to a mailbox, confirm, switch back)
  - Manual step: deploy Worker, set `INBOUND_EMAIL_SECRET` on both sides
  - **GATE #6: a real BCP purchase produces a WhatsApp confirmation within
    60s, and the expense appears in `mis gastos hoy`.** Gate blocks TASK-74

- [ ] TASK-74: Template fallback for the WhatsApp 24h window
  - Depends on: TASK-73
  - Meta only allows free-form bot-initiated messages within 24h of the
    user's last message; otherwise the send fails with re-engagement error
    `131047`. Create a utility template `gasto_bcp_registrado` (es) with
    body params amount, merchant, category (manual step in Kapso/Meta)
  - `whatsapp.ts`: on `131047`, retry via `kapsoClient.messages.sendTemplate`
    (`buildTemplatePayload` from the SDK). Config: `KAPSO_TEMPLATE_BANK_LOGGED`
  - Unit tests: fallback triggered only on 131047; other errors propagate
  - Note: utility templates cost a few cents each outside an open window —
    acceptable at ~5 purchases/day

- [ ] TASK-75: Cross-channel dedup (manual vs. email)
  - Depends on: TASK-73
  - When a bank email arrives and a non-email expense with the same amount,
    currency and date exists within ±6h with no `bank_reference`, attach
    the reference to that expense instead of inserting, and confirm with
    "ya lo tenías registrado" wording
  - Also the reverse: manual `log_expense` while a matching email expense
    exists today → handler warns instead of duplicating
  - Unit tests in `handler.test.ts`

- [ ] TASK-76: Update CLAUDE.md + README for Phase 6
  - Depends on: TASK-75
  - Architecture list gains `parse-bank-email.ts`, `categorize-merchant.ts`,
    `whatsapp.ts`, `infra/email-worker/`; Testing section gains GATES #4–#6
    and new file/test counts; README gets a "BCP auto-logging" section
    pointing to `docs/BANK_EMAIL_SETUP.md`

---

### Future Ideas (Not Scoped)

> These are deferred ideas that don't fit the current WhatsApp architecture or aren't prioritized yet.

- **Bank statement analysis**: PDF upload → extract transactions → categorize → summary. Requires multi-call architecture or external processing. Better suited for a web companion app.
- **User financial profile**: Income, accounts, portfolio tracking. Too complex for chat interface.
- **Proactive alerts**: Scheduled budget warnings (needs cron/scheduler — currently blocked by architecture constraint). Phase 6 bank-email confirmations are event-driven replies to a forwarded email, not a scheduler; scheduled alerts stay out.
- **Multi-currency dashboard**: Exchange rate tracking, cross-currency summaries.
- **Shared expenses**: Split tracking between users.
