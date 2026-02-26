# GastoBot — Task Checklist

**Reference:** [TECHNICAL_PLAN.md](./TECHNICAL_PLAN.md) | [PRD.md](./PRD.md)
**Updated:** 2026-02-26

> Tasks are ordered top-to-bottom by dependency. Implement in this order.
> `⚡ CRITICAL PATH` = any delay here delays the entire MVP.
> `🚧 GATE` = must pass before subsequent tasks proceed. If it fails, iterate until it passes.

---

## Phase 0 — Foundation

- [x] TASK-01: Project scaffolding `⚡ CRITICAL PATH`
  - Scope: `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`
  - Details: `npm init`. Install deps: `fastify`, `@supabase/supabase-js`, `@anthropic-ai/sdk`. Dev deps: `typescript`, `vitest`, `tsx`, `@types/node`. Configure `tsconfig.json` (ESM, strict, NodeNext). Add `.env.example` with all var names (no values). Set up `scripts`: `dev`, `build`, `start`, `test`.
  - Tests: none — verify with `npx tsc --noEmit`
  - Depends on: none

- [ ] TASK-02: TypeScript interfaces `⚡ CRITICAL PATH`
  - Scope: create `src/types.ts`
  - Details: Define all shared types: `User`, `Category`, `Expense`, `Budget`, `ParseResult` (with intent union: `log_expense | query_summary | set_budget | query_budget | correct_expense | delete_expense | help | unknown | error`), `ReceiptResult`, `ConversationState`, `SummaryQuery`, `SummaryResult`. Every data shape that crosses module boundaries lives here.
  - Tests: none — TS compiler validates
  - Depends on: TASK-01

- [ ] TASK-03: Config & env validation
  - Scope: create `src/config.ts`
  - Details: Load and validate env vars at import time: `SUPABASE_URL`, `SUPABASE_KEY`, `ANTHROPIC_API_KEY`, `KAPSO_API_KEY`, `KAPSO_WEBHOOK_SECRET`, `PORT` (default 3000). Export constants: `CONFIDENCE_AUTO_LOG = 0.85`, `CONFIDENCE_CONFIRM = 0.6`, `STATE_TTL_MS = 300_000` (5 min), `DEFAULT_TIMEZONE = 'America/Lima'`, `DEFAULT_CURRENCY = 'PEN'`. Throw on missing required vars.
  - Tests: `tests/unit/config.test.ts` — missing var throws, defaults applied correctly
  - Depends on: TASK-01

- [ ] TASK-04: Database schema `⚡ CRITICAL PATH`
  - Scope: create `migrations/001_initial.sql`
  - Details: Create tables `users`, `categories`, `expenses` (with `deleted_at` for soft delete), `budgets`. Add indexes: `idx_expenses_user_date(user_id, date DESC)`, `idx_expenses_user_category(user_id, category_id)`, `idx_budgets_user_active(user_id, category_id, period)`. Run against Supabase project.
  - Tests: verify tables exist via Supabase dashboard or `\dt` in SQL editor
  - Depends on: TASK-01

- [ ] TASK-05: Seed default categories `⚡ CRITICAL PATH`
  - Scope: create `seed.sql`
  - Details: Insert your user row (phone number, `PEN`, `America/Lima`). Insert 9 default categories linked to that user: `food_dining`, `transport`, `groceries`, `entertainment`, `health`, `shopping`, `bills_utilities`, `education`, `other` — each with display name and emoji icon. Run against Supabase.
  - Tests: query `SELECT * FROM categories` — verify 9 rows with correct slugs
  - Depends on: TASK-04

---

## Phase 1 — AI Parsing & Validation

- [ ] TASK-06: Expense parser system prompt `⚡ CRITICAL PATH`
  - Scope: create `src/prompts/expense-parser.ts`
  - Details: Single system prompt that instructs Claude to: (1) classify intent from the 8-type union, (2) extract structured fields (amount, currency, category slug, description, merchant, date) for `log_expense`, (3) extract query params (period, category) for summary/budget intents, (4) return confidence score. Include: list of valid category slugs, bilingual examples (Spanish/English/mixed), date inference rules ("today" if not specified), currency rules (default PEN, detect "dollars"/"$" for USD). Export as template string function that accepts category list.
  - Tests: manual — paste prompt + sample message into Claude API console, verify JSON output
  - Depends on: TASK-02

- [ ] TASK-07: Text parsing module `⚡ CRITICAL PATH`
  - Scope: create `src/parse.ts`
  - Details: `parseMessage(text: string, categories: Category[]): Promise<ParseResult>`. Initialize Anthropic client. Build messages array with system prompt from TASK-06. Call `claude-sonnet` with `max_tokens: 1024`, `temperature: 0`. Parse JSON from response. Handle: malformed JSON (return `intent: 'error'`), API timeout, API error. Do NOT retry — return error intent and let handler deal with it.
  - Tests: mock Anthropic client, verify JSON parsing, verify error handling
  - Depends on: TASK-02, TASK-03, TASK-06

- [ ] TASK-08: Parse accuracy validation `🚧 GATE #1` `⚡ CRITICAL PATH`
  - Scope: create `tests/fixtures/messages.ts`, `tests/integration/parse.test.ts`
  - Details: Build corpus of 30+ real messages in your actual texting style. Mix of: simple amounts ("almuerzo 35 soles"), amounts with merchants ("uber 23.5"), English ("lunch 80"), mixed ("groceries en wong 127.50"), summary queries ("how much this week?"), budget commands ("set food budget 800"), corrections ("wrong, it's transport"), deletions ("delete that"), ambiguous ("spent 50"). Run each through `parseMessage()` with real Claude API. Measure: intent accuracy, amount accuracy, category accuracy.
  - Tests: this IS the test — `vitest` test file that calls real API
  - Pass criteria: **≥ 85% overall accuracy**. If below, iterate on TASK-06 prompt until it passes.
  - Depends on: TASK-07
  - **Blocks: TASK-12** (do not build handler until parsing is reliable)

---

## Phase 2 — Data Layer

- [ ] TASK-09: Database client & core queries `⚡ CRITICAL PATH`
  - Scope: create `src/db.ts`
  - Details: Init Supabase client from config. Implement functions: `getUserByPhone(phone)`, `getCategories(userId)`, `getCategoryBySlug(userId, slug)`, `insertExpense(data)` → returns inserted row, `getExpenseById(id)`, `getLastExpense(userId)` (excluding soft-deleted), `updateExpense(id, fields)`, `softDeleteExpense(id)`. All queries filter `deleted_at IS NULL` by default. All functions return typed results using interfaces from `types.ts`.
  - Tests: `tests/integration/db.test.ts` — insert → read → update → soft-delete → verify filtered out. Use real Supabase (test data, clean up after).
  - Depends on: TASK-02, TASK-03, TASK-05

---

## Phase 3 — Core Loop Assembly

- [ ] TASK-10: Response formatter
  - Scope: create `src/formatter.ts`
  - Details: Pure functions, no side effects. `formatExpenseConfirmation(expense, category)` → "✅ S/35.00 — Food & Dining\n\"almuerzo\" · Feb 25". `formatClarification(pendingExpense)` → "Got it — S/50.00. What was it for?". `formatError()` → "Something went wrong, try again." `formatHelp()` → list of commands. All strings optimized for WhatsApp rendering (emoji, newlines, no markdown).
  - Tests: `tests/unit/formatter.test.ts` — snapshot each format function output. Test edge cases: zero amount, long description, missing merchant, multi-currency.
  - Depends on: TASK-02

- [ ] TASK-11: Conversation state manager
  - Scope: create `src/state.ts`
  - Details: `Map<string, ConversationState>` keyed by phone number. Functions: `getState(phone)` → returns state or null if expired, `setState(phone, state)` → sets with current timestamp, `clearState(phone)`, `isExpired(state)` → checks against `STATE_TTL_MS`. State shape: `{ lastAction, pendingExpense, lastExpenseId, updatedAt }`. No periodic cleanup — check expiry on read.
  - Tests: `tests/unit/state.test.ts` — set → get returns it, get after TTL returns null, clear works, state transitions (null → awaiting_description → null).
  - Depends on: TASK-02, TASK-03

- [ ] TASK-12: Core message handler `⚡ CRITICAL PATH`
  - Scope: create `src/handler.ts`
  - Details: `handleMessage(phone: string, type: 'text' | 'image', content: string): Promise<string>`. This is the brain. Logic: (1) Get user by phone. (2) Check conversation state — if `awaiting_description`, treat content as the missing description and complete the pending expense. If `awaiting_confirmation`, treat "yes"/"si" as confirm, anything else as correction. (3) If no active state: call `parseMessage()`. (4) Route by intent: `log_expense` → check confidence → auto-log / confirm / clarify. `query_summary` → delegate to summary logic. `set_budget` / `query_budget` → delegate to budget logic. `correct_expense` / `delete_expense` → delegate to correction/deletion. `help` → return help text. `unknown` / `error` → return error message. (5) Update conversation state as needed. (6) Return formatted response string. Start with `log_expense` + `help` + `unknown` intents only. Other intents added in Phase 4-5.
  - Tests: `tests/integration/handler.test.ts` — mock parse.ts to return known `ParseResult`s. Test: high-confidence auto-logs, mid-confidence asks confirmation, low-confidence asks clarification, state transitions on follow-ups.
  - Depends on: TASK-07, TASK-09, TASK-10, TASK-11 | **Gate: TASK-08 must pass**

- [ ] TASK-13: Webhook route handler `⚡ CRITICAL PATH`
  - Scope: create `src/webhook.ts`
  - Details: Fastify route plugin. `POST /webhook`: parse Kapso payload → extract sender phone, message type (text/image/other), content or media URL. Validate webhook signature against `KAPSO_WEBHOOK_SECRET` (reject if invalid). Call `handler.handleMessage()`. Send reply via Kapso SDK. `GET /health`: return `{ status: 'ok' }` for Railway health checks. Handle: missing fields in payload (400), handler errors (500 with friendly reply to user).
  - Tests: manual — `curl` the webhook endpoint with sample Kapso payload shape
  - Depends on: TASK-02, TASK-03

- [ ] TASK-14: Fastify server & wiring `⚡ CRITICAL PATH`
  - Scope: create `src/index.ts`
  - Details: Create Fastify instance. Register webhook plugin from TASK-13. Listen on `PORT` from config. Add graceful shutdown (SIGTERM/SIGINT → `server.close()`). Log startup message with port.
  - Tests: manual — `npm run dev`, hit `/health`, verify 200
  - Depends on: TASK-12, TASK-13

- [ ] TASK-15: Deploy to Railway & smoke test `⚡ CRITICAL PATH`
  - Scope: Railway project config, environment variables
  - Details: Create Railway project. Set all env vars. Deploy. Verify `/health` returns 200. Configure Kapso webhook URL to point to Railway. Send "almuerzo 35 soles" on WhatsApp → verify "✅ S/35.00 — Food & Dining" reply. Send "help" → verify help text. This is the **Week 1 deliverable**.
  - Tests: manual WhatsApp E2E — the list:
    - "almuerzo 35 soles" → confirms with correct amount + category
    - "uber 23.5" → confirms transport
    - "spent 50" → asks "What was it for?"
    - Reply "groceries" → confirms S/50.00 Groceries
    - "help" → lists commands
    - "asdfghjk" → handles gracefully
  - Depends on: TASK-14

---

### MILESTONE: Core loop working ✅
> Send a WhatsApp text → get a confirmed, correctly parsed expense logged.
> This is the foundation everything else builds on.

---

## Phase 4 — Summaries & Budgets

- [ ] TASK-16: Summary query logic
  - Scope: extend `src/db.ts`, extend `src/handler.ts`
  - Details: Add to db.ts: `getExpensesSummary(userId, startDate, endDate)` → returns `{ total, byCategory: [{ slug, name, icon, total }] }`. Add timezone-aware date range computation: `getDateRange(period: 'today' | 'week' | 'month', timezone: string)` → `{ start: Date, end: Date }`. Use `Intl.DateTimeFormat` or `date-fns-tz` for timezone conversion. Add `query_summary` intent handling in handler.ts.
  - Tests: `tests/integration/db.test.ts` (extend) — insert expenses across date boundaries, verify summary aggregation. Test timezone edge: expense at 11pm Lima time (4am UTC next day) appears in correct "today".
  - Depends on: TASK-15

- [ ] TASK-17: Summary response formatting
  - Scope: extend `src/formatter.ts`
  - Details: `formatSummary(summary, period, budget?)` → multi-line WhatsApp message: "📊 This Week (Feb 19–25)\nTotal: S/342.50\n\n🍽 Food & Dining  S/185.00\n🚗 Transport  S/87.50\n...". If budget exists for period, append: "Budget: S/342.50 / S/500.00 (68%)". Format period header with actual date range. Sort categories by total descending. Skip categories with zero spend.
  - Tests: extend `tests/unit/formatter.test.ts` — snapshot summary output, test with/without budget, test empty period.
  - Depends on: TASK-16

- [ ] TASK-18: Budget CRUD
  - Scope: extend `src/db.ts`, extend `src/handler.ts`
  - Details: Add to db.ts: `upsertBudget(userId, categoryId, amount, currency, period)` — upsert by (user, category, period). `getBudget(userId, categoryId, period)`. `getBudgets(userId)`. Add `set_budget` intent handling in handler.ts: extract category slug + amount + period from ParseResult → resolve category → upsert budget. Budget `start_date` = first of current month (if setting mid-month) or first of next month.
  - Tests: extend `tests/integration/db.test.ts` — upsert creates, upsert updates, query returns correct budget.
  - Depends on: TASK-15

- [ ] TASK-19: Budget query & status formatting
  - Scope: extend `src/db.ts`, extend `src/handler.ts`, extend `src/formatter.ts`
  - Details: `query_budget` intent: get budget → get expenses for that category in current period → compute spent, remaining, percentage. `formatBudgetStatus(budget, spent, daysRemaining)` → "🍽 Food & Dining\nSpent: S/520 / S/800 (65%)\nRemaining: S/280\n⚠️ 5 days left in month". Add warning emoji at ≥80%. Compute days remaining in period.
  - Tests: extend `tests/unit/formatter.test.ts` — test at 50%, 80%, 100%, over budget. Extend `tests/integration/handler.test.ts` — mock budget query flow.
  - Depends on: TASK-18

---

## Phase 5 — Corrections & Deletions

- [ ] TASK-20: Correction flow
  - Scope: extend `src/handler.ts`, extend `src/db.ts`, extend `src/formatter.ts`
  - Details: `correct_expense` intent: get `lastExpenseId` from state (or query `getLastExpense`). Extract what's being corrected from ParseResult (new category slug, or new amount). Call `updateExpense()`. `formatCorrection(expense, oldCategory, newCategory)` → "✅ Updated: S/12.50 — Transport (was: Food & Dining)". After any successful expense log, store `lastExpenseId` in state so corrections work.
  - Tests: extend handler tests — log expense → send correction → verify update. Test: correct category, correct amount, correct when no prior expense (error message).
  - Depends on: TASK-15

- [ ] TASK-21: Deletion flow
  - Scope: extend `src/handler.ts`, extend `src/formatter.ts`
  - Details: `delete_expense` intent: get last expense → `softDeleteExpense(id)` → `formatDeletion(expense)` → "🗑️ Deleted: S/12.50 — Transport · Feb 25". Handle: no prior expense to delete (error message). After deletion, clear `lastExpenseId` from state.
  - Tests: extend handler tests — log expense → send "delete that" → verify soft deleted → send "delete that" again → error message.
  - Depends on: TASK-15

---

### MILESTONE: All text features complete ✅
> Text logging, summaries, budgets, corrections, deletions — all working via WhatsApp.

---

## Phase 6 — Receipt Scanning (Conditional)

> **Skip this entire phase if Gate #2 fails.** Move directly to Phase 7.

- [ ] TASK-22: Receipt parser system prompt
  - Scope: create `src/prompts/receipt-parser.ts`
  - Details: System prompt for Claude Vision: extract total amount (look for "TOTAL", "TOTAL A PAGAR", largest amount), merchant name (header/logo area), date, currency. Handle Lima receipt formats: Plaza Vea, Wong, Metro, bodegas, restaurants. Return structured JSON with confidence score. Include examples of expected output format.
  - Tests: manual — test prompt with sample receipt images in Claude console
  - Depends on: TASK-02

- [ ] TASK-23: Receipt accuracy validation `🚧 GATE #2`
  - Scope: create `tests/fixtures/receipts/` (10+ photos), `tests/integration/parse-image.test.ts`
  - Details: Collect 10+ real receipt photos from Lima stores (Plaza Vea, Wong, Metro, bodegas, restaurants). Test each with the receipt parser prompt via Claude Vision API. Measure: correct total extraction, correct merchant extraction.
  - Tests: this IS the test
  - Pass criteria: **≥ 70% accuracy on total + merchant**. If below, skip TASK-24 through TASK-26. Receipt scanning becomes Phase 2.
  - Depends on: TASK-22

- [ ] TASK-24: Image download & Supabase storage
  - Scope: create `src/storage.ts`
  - Details: `downloadAndStore(mediaUrl: string, expenseId: string): Promise<string>`. Download image from Kapso media URL (these expire quickly — must download **immediately** on webhook receipt). Upload to Supabase Storage bucket `receipts/`. Return permanent public URL. Handle: download failure (URL expired), upload failure, oversized images (compress before upload if >5MB).
  - Tests: integration test — upload a test image to Supabase Storage, verify URL works
  - Depends on: TASK-03, TASK-23 (gate must pass)

- [ ] TASK-25: Vision parsing module
  - Scope: create `src/parse-image.ts`
  - Details: `parseReceipt(imageBuffer: Buffer): Promise<ReceiptResult>`. Send image to Claude Vision with receipt parser prompt. Parse JSON response. Return structured result: `{ merchant, amount, currency, date, confidence }`. Handle: API errors, malformed JSON, low confidence (return result anyway — handler decides what to do).
  - Tests: mock Anthropic client, verify JSON parsing. Real API tested via TASK-23 fixtures.
  - Depends on: TASK-22, TASK-24

- [ ] TASK-26: Receipt confirmation flow
  - Scope: extend `src/handler.ts`, extend `src/webhook.ts`, extend `src/state.ts`
  - Details: When webhook receives image message: (1) immediately download image via `storage.ts`, (2) call `parseReceipt()`, (3) if confidence ≥ 0.7: show "🧾 Plaza Vea — S/127.50\nCategory: Groceries · Feb 25\nLook right?". Set state to `awaiting_confirmation` with pending expense data. (4) if confidence < 0.7: "Couldn't read that clearly. What was the total and where was it from?". Set state to `awaiting_description`. (5) on "yes"/"si" confirmation: insert expense with `source: 'image'` and `image_url`. On correction: update fields and insert.
  - Tests: extend handler tests — mock image parse returning high/low confidence, verify correct state transitions and confirmation flow.
  - Depends on: TASK-12, TASK-24, TASK-25

---

### MILESTONE: Receipt scanning working ✅ (or explicitly skipped)

---

## Phase 7 — Polish & Hardening

- [ ] TASK-27: Help command
  - Scope: extend `src/handler.ts`, extend `src/formatter.ts`
  - Details: `help` intent → return formatted help text. Include: how to log ("just type: almuerzo 35 soles"), how to query ("how much this week?"), how to set budget ("set food budget 800 monthly"), how to correct ("wrong, it's transport"), how to delete ("delete that"). Bilingual: respond in the language the user used (or default Spanish). Keep it short — max 10 lines.
  - Tests: extend formatter tests — verify help output
  - Depends on: TASK-15

- [ ] TASK-28: Edge case handling
  - Scope: extend `src/webhook.ts`, extend `src/handler.ts`
  - Details: (1) Duplicate webhooks: track last N message IDs in memory Set, skip duplicates. (2) Unknown phone numbers: ignore or reply "This is a personal bot." (3) Unsupported media (voice notes, video, documents): reply "I can only process text and photos right now." (4) Empty or whitespace-only messages: ignore. (5) Very long messages (>500 chars): truncate before sending to Claude.
  - Tests: extend handler tests — verify each edge case returns expected response (or no response)
  - Depends on: TASK-15

- [ ] TASK-29: Error handling hardening
  - Scope: all `src/` files
  - Details: Review every external call (Claude API, Supabase, Kapso) and ensure errors are caught and produce user-friendly responses. Claude timeout → "I'm thinking too hard, try again." Supabase error → "Couldn't save that, try again." Kapso send failure → log error (can't reply, so just log). Never expose stack traces, raw error messages, or internal state to the user. Add Fastify error handler for uncaught route errors.
  - Tests: extend handler tests — inject errors from mocked dependencies, verify user-friendly messages returned
  - Depends on: TASK-15

- [ ] TASK-30: Structured JSON logging
  - Scope: extend `src/handler.ts`, extend `src/parse.ts`
  - Details: Add structured JSON logs at key points: (1) Webhook received: `{ event: 'webhook', phone, messageType, timestamp }`. (2) Parse complete: `{ event: 'parse', intent, confidence, latency_ms }`. (3) Expense logged: `{ event: 'expense_logged', expenseId, amount, category }`. (4) Error: `{ event: 'error', error, context }`. Use `console.log(JSON.stringify(...))` — Railway captures stdout. Do not add a logging library.
  - Tests: none — verify in Railway log drain after deploy
  - Depends on: TASK-15

---

### MILESTONE: Production-ready MVP ✅
> All features working, errors handled, logging in place.
> Start daily use. Log every expense for 30 days.

---

## Dependency Quick Reference

```
TASK-01 ─┬─→ TASK-02 ─┬─→ TASK-06 → TASK-07 → TASK-08 [GATE] ──┐
         │             ├─→ TASK-09 ──────────────────────────────┤
         │             ├─→ TASK-10 ──────────────────────────────┤
         │             ├─→ TASK-11 ──────────────────────────────┤
         │             └─→ TASK-22 → TASK-23 [GATE] → TASK-24 ──│──→ TASK-25 → TASK-26
         ├─→ TASK-03 ──────→ (TASK-09, TASK-11, TASK-13, TASK-24)│
         └─→ TASK-04 → TASK-05 → TASK-09 ───────────────────────┤
                                                                  ▼
                                              TASK-12 ─→ TASK-14 ─→ TASK-15
                                                  ▲          ▲
                                              TASK-13 ───────┘
                                                  │
                                                  ▼
                                    ┌─── TASK-16 → TASK-17
                                    ├─── TASK-18 → TASK-19
                                    ├─── TASK-20
                                    ├─── TASK-21
                                    ├─── TASK-26
                                    ├─── TASK-27
                                    ├─── TASK-28
                                    ├─── TASK-29
                                    └─── TASK-30
```

## Critical Path (longest chain to core loop)

```
TASK-01 → TASK-02 → TASK-06 → TASK-07 → TASK-08 [GATE] → TASK-12 → TASK-14 → TASK-15
                                                              ▲
                              TASK-04 → TASK-05 → TASK-09 ────┘ (parallel, must also complete)
```

**Total: 8 tasks on critical path to first working E2E.**
Any delay on these delays the entire MVP. Everything else can be parallelized around them.
