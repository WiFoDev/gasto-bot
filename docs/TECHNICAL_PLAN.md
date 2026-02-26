# GastoBot — Technical Plan

**Based on:** PRD v3.0
**Date:** 2026-02-26
**Scope:** Phase 1 MVP only

---

## 1. File & Folder Structure

```
gastobot/
├── src/
│   ├── index.ts                # Fastify server setup, route registration, start
│   ├── config.ts               # Env validation, constants (confidence thresholds, TTL, timezone)
│   ├── types.ts                # All TypeScript interfaces and type aliases
│   │
│   ├── webhook.ts              # POST /webhook route handler — dispatches by message type
│   ├── handler.ts              # Core orchestration: intent → action → response
│   │
│   ├── parse.ts                # Single Claude Sonnet call: intent + extract + categorize
│   ├── parse-image.ts          # Claude Vision call: receipt → total + merchant
│   │
│   ├── db.ts                   # Supabase client init + all query functions
│   ├── storage.ts              # Supabase Storage: upload receipt images
│   │
│   ├── state.ts                # In-memory conversation state (Map + TTL expiry)
│   ├── formatter.ts            # Format WhatsApp response strings (confirmations, summaries, errors)
│   │
│   └── prompts/
│       ├── expense-parser.ts   # System prompt: intent routing + expense extraction + categorization
│       └── receipt-parser.ts   # System prompt: receipt image → structured data
│
├── tests/
│   ├── unit/
│   │   ├── formatter.test.ts   # Pure output formatting
│   │   ├── state.test.ts       # TTL expiry, state transitions
│   │   └── config.test.ts      # Env validation edge cases
│   ├── integration/
│   │   ├── parse.test.ts       # Real Claude API with bilingual test corpus
│   │   ├── parse-image.test.ts # Real Claude Vision with Lima receipt photos
│   │   ├── db.test.ts          # Real Supabase queries against test data
│   │   └── handler.test.ts     # Webhook → parse → db → format pipeline (mocked WhatsApp)
│   └── fixtures/
│       ├── messages.ts         # 30+ test messages (Spanish, English, mixed)
│       └── receipts/           # 10+ receipt photos from Lima stores
│
├── migrations/
│   └── 001_initial.sql         # Full schema: users, categories, expenses, budgets + indexes
│
├── seed.sql                    # Default categories (9 categories with slugs + emoji)
│
├── package.json
├── tsconfig.json
├── .env.example                # Documented env vars (no secrets)
├── .env                        # Actual secrets (gitignored)
├── .gitignore
└── CLAUDE.md
```

### Where each feature lives

| Feature | Primary files | Supporting files |
|---------|--------------|-----------------|
| F1: Text expense logging | `webhook.ts`, `handler.ts`, `parse.ts`, `db.ts` | `prompts/expense-parser.ts`, `formatter.ts`, `types.ts` |
| F2: Receipt scanning | `webhook.ts`, `handler.ts`, `parse-image.ts`, `storage.ts`, `db.ts` | `prompts/receipt-parser.ts`, `formatter.ts`, `state.ts` |
| F3: Auto-categorization | `parse.ts` (same Claude call) | `prompts/expense-parser.ts`, `seed.sql` |
| F4: Spending summaries | `handler.ts`, `db.ts`, `formatter.ts` | `types.ts` |
| F5: Budget tracking | `handler.ts`, `db.ts`, `formatter.ts` | `types.ts` |
| F6: Corrections/deletions | `handler.ts`, `state.ts`, `db.ts` | `formatter.ts` |
| Conversation state | `state.ts` | `handler.ts` |
| Confidence handling | `handler.ts`, `state.ts` | `config.ts` |

### Why `handler.ts` exists

The PRD's folder structure routes everything through `webhook.ts`, but that file should only handle HTTP concerns (parsing the Kapso payload, sending the response). The *business logic* — deciding what to do based on intent, managing state transitions, orchestrating parse → db → format — belongs in a separate `handler.ts`. This keeps webhook.ts thin and handler.ts testable without HTTP.

### Why `storage.ts` is separate from `db.ts`

Receipt image upload (Supabase Storage) is a different API from database queries (Supabase Postgres). Mixing blob storage with SQL queries in one file creates confusion. `storage.ts` handles one thing: download image from WhatsApp URL → upload to Supabase Storage → return permanent URL.

---

## 2. Data Model

### Entity Relationship Diagram

```
┌──────────┐       ┌──────────────┐       ┌──────────────┐
│  users   │──1:N──│  categories  │──1:N──│   expenses   │
│          │       │              │       │              │
│ id (PK)  │       │ id (PK)      │       │ id (PK)      │
│ phone    │       │ user_id (FK) │       │ user_id (FK) │
│ name     │       │ name         │       │ category_id  │
│ currency │       │ slug         │       │ amount       │
│ timezone │       │ icon         │       │ currency     │
└──────┬───┘       │ is_default   │       │ description  │
       │           └──────────────┘       │ merchant     │
       │                                  │ date         │
       │                                  │ source       │
       │           ┌──────────────┐       │ raw_input    │
       └──────1:N──│   budgets   │       │ image_url    │
                   │              │       │ ai_confidence│
                   │ id (PK)      │       │ deleted_at   │
                   │ user_id (FK) │       └──────────────┘
                   │ category_id  │
                   │ amount       │
                   │ currency     │
                   │ period       │
                   │ start_date   │
                   └──────────────┘
```

### Relationships

- **users → categories**: 1:N. Each user has their own category set (seeded with defaults on user creation).
- **users → expenses**: 1:N. Every expense belongs to one user.
- **users → budgets**: 1:N. A user can have multiple budgets (one per category + one overall).
- **categories → expenses**: 1:N. Each expense has one category.
- **categories → budgets**: 0..1:N. A budget can target a specific category (`category_id`) or be overall (`category_id = NULL`).

### Schema (from PRD, with one addition)

The PRD schema is used as-is with one change:

**Addition: `deleted_at` on expenses**

```sql
deleted_at TIMESTAMPTZ DEFAULT NULL  -- soft delete for "delete that"
```

Why soft delete: The "delete that" command (F6) should be reversible. Hard delete loses the data permanently. Soft delete lets the user undo, and queries simply filter `WHERE deleted_at IS NULL`. This is one column, zero complexity cost.

### Seed Data — Default Categories

```
slug              | name              | icon
──────────────────┼───────────────────┼─────
food_dining       | Food & Dining     | 🍽
transport         | Transport         | 🚗
groceries         | Groceries         | 🛒
entertainment     | Entertainment     | 🎬
health            | Health            | 🏥
shopping          | Shopping          | 🛍
bills_utilities   | Bills & Utilities | 💡
education         | Education         | 📚
other             | Other             | 📦
```

### Key design decisions

1. **Categories are per-user, not global.** Even though Phase 1 is single-user, the schema supports future multi-user by having `user_id` on categories. Seed categories are inserted per user, not as shared rows.

2. **AI returns `slug`, not display `name`.** The system prompt lists valid slugs. Claude returns a slug. We match `slug` → `category_id` in code. This is more stable than matching free-text names.

3. **`raw_input` stored on every expense.** This is the debugging lifeline. When parsing goes wrong, you can replay the original message against an updated prompt.

4. **No `parsing_logs` table.** Use structured JSON logging (console) piped to Railway's log drain. Build a table only if needed after 30 days.

---

## 3. MVP Feature Breakdown — Ordered by Dependency

### Layer 0: Foundation (no feature depends on another here)

| Task | File(s) | Description |
|------|---------|-------------|
| **T0.1** Project scaffolding | `package.json`, `tsconfig.json`, `.gitignore`, `.env.example` | Init Node.js project. Install deps: `fastify`, `@supabase/supabase-js`, `@anthropic-ai/sdk`. Dev deps: `typescript`, `vitest`, `tsx`. |
| **T0.2** TypeScript types | `src/types.ts` | Define all interfaces: `ParseResult`, `Expense`, `Budget`, `ConversationState`, `ReceiptResult`, `SummaryQuery`, `FormattedResponse`. Covers every data shape that flows between modules. |
| **T0.3** Config & env validation | `src/config.ts` | Load and validate env vars at startup (`SUPABASE_URL`, `SUPABASE_KEY`, `ANTHROPIC_API_KEY`, `KAPSO_API_KEY`, `KAPSO_WEBHOOK_SECRET`). Export constants: confidence thresholds (0.85, 0.6), state TTL (5 min), default timezone. Fail fast if missing. |

### Layer 1: Data Layer

| Task | File(s) | Description |
|------|---------|-------------|
| **T1.1** Database schema | `migrations/001_initial.sql` | Create tables: `users`, `categories`, `expenses`, `budgets`. Add indexes on `(user_id, date)` and `(user_id, category_id)`. |
| **T1.2** Seed data | `seed.sql` | Insert single user row (your phone number) + 9 default categories linked to that user. |
| **T1.3** Database client & queries | `src/db.ts` | Init Supabase client. Implement query functions: `getUserByPhone`, `getCategories`, `getCategoryBySlug`, `insertExpense`, `getExpenseById`, `updateExpense`, `softDeleteExpense`, `getExpensesByDateRange`, `getExpensesSummary`, `getLastExpense`, `upsertBudget`, `getBudget`, `getBudgets`. |

### Layer 2: AI Parsing

| Task | File(s) | Description |
|------|---------|-------------|
| **T2.1** Expense parser prompt | `src/prompts/expense-parser.ts` | System prompt that handles all intents in one call: `log_expense`, `query_summary`, `set_budget`, `query_budget`, `correct_expense`, `delete_expense`, `help`, `unknown`. Includes category slugs, bilingual examples, confidence scoring rules, and structured JSON output format. |
| **T2.2** Text parsing module | `src/parse.ts` | `parseMessage(text: string, categories: Category[]): Promise<ParseResult>`. Calls Claude Sonnet with system prompt + user message. Parses JSON response. Handles API errors gracefully (returns `{ intent: 'error' }`). |
| **T2.3** Parse accuracy validation | `tests/integration/parse.test.ts`, `tests/fixtures/messages.ts` | **Validation gate.** Test corpus of 30+ real messages in your actual style. Measure: intent accuracy, amount accuracy, category accuracy. Must pass ≥ 85% before proceeding. This is not a unit test — it calls the real Claude API. |

### Layer 3: Webhook & Response

| Task | File(s) | Description |
|------|---------|-------------|
| **T3.1** Response formatter | `src/formatter.ts` | Pure functions: `formatExpenseConfirmation`, `formatSummary`, `formatBudgetStatus`, `formatCorrection`, `formatDeletion`, `formatClarification`, `formatHelp`, `formatError`. All return plain strings with emoji + whitespace, optimized for WhatsApp rendering. |
| **T3.2** Webhook handler | `src/webhook.ts` | Fastify route: `POST /webhook`. Parses Kapso payload → extracts sender phone, message type (text/image), content/media URL. Validates webhook signature. Calls `handler.handleMessage()`. Sends reply via Kapso SDK. Also: `GET /health` for Railway health checks. |
| **T3.3** Fastify server setup | `src/index.ts` | Create Fastify instance, register webhook route, start listening. Graceful shutdown handling. |

### Layer 4: Core Orchestration

| Task | File(s) | Description |
|------|---------|-------------|
| **T4.1** Conversation state | `src/state.ts` | `ConversationState` map keyed by phone number. Functions: `getState`, `setState`, `clearState`, `isExpired`. Auto-expire entries older than 5 minutes. Handles transitions: `null → awaiting_description → null`, `null → awaiting_confirmation → null`, `null → awaiting_correction → null`. |
| **T4.2** Core handler | `src/handler.ts` | `handleMessage(phone: string, messageType: 'text' \| 'image', content: string): Promise<string>`. This is the brain. Logic flow: (1) Check conversation state — if awaiting, treat as response to pending question. (2) If no state or expired, call `parseMessage()`. (3) Based on intent + confidence, either log directly, ask for confirmation, or request clarification. (4) Return formatted response string. Handles all 8 intents. |
| **T4.3** End-to-end wiring | All `src/` files | Wire webhook.ts → handler.ts → parse.ts → db.ts → formatter.ts. Deploy to Railway. Test manually: send "almuerzo 35 soles" on WhatsApp → get confirmation back. **This is the Week 1 deliverable.** |

### Layer 5: Query Features

| Task | File(s) | Description |
|------|---------|-------------|
| **T5.1** Summary query logic | `src/db.ts` (add queries), `src/handler.ts` (add intent handling) | Timezone-aware date range computation ("today", "this week", "this month"). Aggregate expenses by category within range. Return totals. Critical: all date boundaries computed in user's `America/Lima` timezone, not UTC. |
| **T5.2** Summary formatting | `src/formatter.ts` (extend) | Format summary response: period header, total, category breakdown with emoji, budget comparison if budget exists. |
| **T5.3** Budget CRUD | `src/db.ts` (add queries), `src/handler.ts` (add intent handling) | "set food budget 800 monthly" → parse period + amount + category → upsert into budgets table. Budget start_date defaults to first of current or next month. |
| **T5.4** Budget query | `src/db.ts`, `src/handler.ts`, `src/formatter.ts` | "how's my food budget?" → get budget → get expenses in current period for that category → compute spent / remaining / percentage → format response including days remaining in period. |

### Layer 6: Corrections & Deletions

| Task | File(s) | Description |
|------|---------|-------------|
| **T6.1** Correction flow | `src/handler.ts`, `src/db.ts`, `src/state.ts` | "wrong, it's transport" → get last expense for user → update category (or amount, if specified) → format confirmation with old → new. Uses `state.lastExpenseId` to know which expense to correct. |
| **T6.2** Deletion flow | `src/handler.ts`, `src/db.ts` | "delete that" / "cancel last one" → get last expense → soft delete (`deleted_at = NOW()`) → format deletion confirmation. |

### Layer 7: Receipt Scanning (Conditional on Gate #5)

| Task | File(s) | Description |
|------|---------|-------------|
| **T7.1** Receipt parser prompt | `src/prompts/receipt-parser.ts` | System prompt for Claude Vision: extract total amount, merchant name, date, currency from receipt image. Return structured JSON with confidence. |
| **T7.2** Receipt accuracy validation | `tests/integration/parse-image.test.ts`, `tests/fixtures/receipts/` | **Validation gate.** Test with 10+ real Lima receipts. Must achieve ≥ 70% accuracy on total + merchant. If fails, skip all of Layer 7. |
| **T7.3** Image download + storage | `src/storage.ts` | Download image from Kapso media URL **immediately** on webhook receipt (URLs expire). Upload to Supabase Storage. Return permanent storage URL. Handle download failures gracefully. |
| **T7.4** Vision parsing module | `src/parse-image.ts` | `parseReceipt(imageUrl: string): Promise<ReceiptResult>`. Download image buffer → Claude Vision call → parse JSON → return structured result. |
| **T7.5** Receipt confirmation flow | `src/handler.ts`, `src/state.ts` | Image received → parse → always show result and ask "Look right?" → set state to `awaiting_confirmation` → on "yes" log to DB, on correction update and log. Low confidence → ask for manual input. |

### Layer 8: Polish & Edge Cases

| Task | File(s) | Description |
|------|---------|-------------|
| **T8.1** Help command | `src/handler.ts`, `src/formatter.ts` | "help" / "ayuda" → return formatted list of what the bot can do, with examples. |
| **T8.2** Edge case handling | `src/webhook.ts`, `src/handler.ts` | Duplicate webhook messages (idempotency via message ID). Unknown phone numbers → ignore or reply "personal bot". Unsupported media (voice, video) → "I can only process text and photos". Empty messages → ignore. |
| **T8.3** Error handling | All files | Graceful failures throughout. Claude API timeout/error → "Something went wrong, try again". Supabase error → "Couldn't save that, try again". Never expose raw errors to user. |
| **T8.4** Structured logging | `src/handler.ts`, `src/parse.ts` | JSON-structured console logs: `{ timestamp, phone, intent, latency_ms, confidence, error? }`. These go to Railway's log drain. Used to measure parse accuracy and response latency post-deployment. |

---

## 4. Dependency Graph & Parallelism

### Sequential dependencies (critical path)

```
T0.1 (scaffolding)
  │
  ├──→ T0.2 (types)
  │      │
  │      ├──→ T1.3 (db queries) ──→ T4.2 (handler) ──→ T4.3 (e2e wiring)
  │      │                                │
  │      ├──→ T2.2 (parse module) ────────┘
  │      │
  │      └──→ T4.1 (state)  ──────────────┘
  │
  └──→ T0.3 (config)
```

After T4.3 (core loop working), features branch:

```
T4.3 (core loop working)
  │
  ├──→ T5.1–T5.2 (summaries)
  ├──→ T5.3–T5.4 (budgets)
  ├──→ T6.1–T6.2 (corrections/deletions)
  └──→ T7.1–T7.5 (receipts, if gate passes)
```

### What can run in parallel

| Parallel group | Tasks | Why independent |
|---------------|-------|-----------------|
| **Foundation** | T0.2 (types) + T0.3 (config) | No dependency on each other, both depend only on T0.1 |
| **Data + AI** | T1.1–T1.2 (schema/seed) + T2.1 (prompt writing) | Schema is SQL, prompt is text. Zero overlap. |
| **Modules** | T1.3 (db.ts) + T2.2 (parse.ts) + T3.1 (formatter.ts) + T4.1 (state.ts) | All depend on types.ts but not on each other. Can be built and unit-tested independently. |
| **Validation** | T2.3 (text parse validation) + T7.2 (receipt validation) | Both call Claude API but test different things. Run these early — they are gates. |
| **Query features** | T5.1–T5.2 (summaries) + T5.3–T5.4 (budgets) | Both read from DB but handle different intents. |
| **Corrections** | T6.1 (corrections) + T6.2 (deletions) | Similar patterns but different operations. |

### What MUST be sequential

| Dependency | Reason |
|-----------|--------|
| T0.1 → everything | Can't write TS without project setup |
| T0.2 → T1.3, T2.2, T3.1, T4.1 | All modules import from types.ts |
| T1.1 → T1.2 → T1.3 | Schema → seed → queries (can't query nonexistent tables) |
| T2.1 → T2.2 → T2.3 | Prompt → module → validation (can't validate without the parser) |
| T1.3 + T2.2 + T3.1 → T4.2 | Handler orchestrates all three — needs them to exist |
| T4.2 + T3.2 → T4.3 | End-to-end wiring needs handler + webhook |
| T4.3 → T5.x, T6.x, T7.x | All features build on the working core loop |
| T7.2 (receipt validation) → T7.3–T7.5 | If gate fails (< 70%), skip receipt implementation entirely |

### Recommended implementation timeline

```
         Week 0 (Validation)         Week 1 (Core Loop)
Day:  1    2    3    4    5    6    7    8    9   10   11
      ├─── T2.1 prompt ───┤
      ├── T2.3 validate ──┤
      ├── T7.2 receipt val─┤
                     ├ Gate decision ┤
                                     ├─ T0.1 scaffolding ─┤
                                     ├─ T1.1 schema ──┤
                                          ├─ T0.2 types ──┤
                                          ├─ T0.3 config ──┤
                                          ├─ T1.2 seed ┤
                                               ├── T1.3 db ────┤
                                               ├── T2.2 parse ─┤
                                               ├── T3.1 fmt ───┤
                                               ├── T4.1 state ─┤
                                                         ├─ T3.2 webhook ─┤
                                                         ├─ T4.2 handler ─┤
                                                              ├─ T3.3 server ┤
                                                              ├─ T4.3 e2e ───┤

              Week 2 (Features)            Week 3 (Receipts + Polish)
Day: 12   13   14   15   16   17   18   19   20   21   22   23   24   25
     ├── T5.1 summary logic ──┤
     ├── T5.3 budget CRUD ────┤
          ├── T5.2 summary fmt ┤
          ├── T5.4 budget query┤
               ├── T6.1 corrections ─┤
               ├── T6.2 deletions ───┤
                                      ├── T7.3 storage ─┤
                                      ├── T7.1 prompt ──┤
                                           ├── T7.4 vision parse ─┤
                                                ├── T7.5 confirm flow ─┤

                                 Week 4 (Polish + Daily Use)
Day: 26   27   28   29   30
     ├── T8.1 help ──┤
     ├── T8.2 edge cases ──┤
     ├── T8.3 error handling ──┤
     ├── T8.4 logging ─────────┤
          ├── prompt tuning ───────────┤
          ├── daily use starts ────────┤
```

---

## 5. Testing Strategy

### Guiding principle

This is a single-user MVP. Do not build a 200-test suite. Test the things that break: AI parsing accuracy, timezone math, state machine transitions. Don't test Fastify routing or Supabase SDK wrappers — those are library code.

### Test runner: Vitest

Why: Fast, TypeScript-native, ESM-first, no config ceremony. Same `expect` API as Jest.

### Layer-by-layer strategy

#### A. Unit Tests (fast, no external calls, run on every change)

| Module | What to test | What NOT to test |
|--------|-------------|-----------------|
| `formatter.ts` | Output strings match expected format. Emoji present. Numbers formatted correctly. Edge cases: zero amounts, long merchant names, empty categories. | WhatsApp rendering (manual visual test on phone) |
| `state.ts` | State creation, retrieval, expiry after TTL, clearing. State transition: null → awaiting → null. New expense abandons pending state. | Concurrent access (single-user, not a concern) |
| `config.ts` | Missing env vars throw at startup. Confidence thresholds are correct type/range. | Actual env loading (integration concern) |
| `handler.ts` | Intent routing logic with mocked parse + db + formatter. Confidence branching: ≥0.85 auto-logs, 0.6–0.84 confirms, <0.6 clarifies. State-aware responses. | Actual Claude API calls, actual DB writes |

**Mocking strategy:** Mock `parse.ts` and `db.ts` at the function level (dependency injection or vi.mock). Handler tests should verify *orchestration logic*, not AI or DB behavior.

#### B. Integration Tests (real external services, run before deploy)

| Test | External service | What to verify | Pass criteria |
|------|-----------------|----------------|---------------|
| **Parse accuracy (text)** | Claude Sonnet API | Feed 30+ real bilingual messages. Check: correct intent, correct amount, correct category slug, confidence > 0. | ≥ 85% overall accuracy. **This is validation gate #4.** |
| **Parse accuracy (receipt)** | Claude Vision API | Feed 10+ real Lima receipt images. Check: correct total, correct merchant. | ≥ 70% accuracy. **This is validation gate #5.** |
| **DB queries** | Supabase | Insert expense → query by date range → verify returned. Timezone-aware "today" query returns correct results. Summary aggregation math. Soft delete filters correctly. | All assertions pass |
| **Handler pipeline** | Claude API + Supabase | Send realistic text → handler returns correctly formatted confirmation + expense exists in DB with correct fields. | End-to-end data integrity |

**Important:** Integration tests call real APIs and cost money ($). Keep the test corpus fixed and small. Run manually, not in CI on every push.

#### C. E2E / Manual Testing (on real WhatsApp)

| Scenario | How to test | What to verify |
|----------|------------|----------------|
| Log text expense | Send "almuerzo 35 soles" on WhatsApp | Bot replies with ✅ confirmation within 5s |
| Log receipt | Send receipt photo | Bot replies with extracted total + merchant, asks "Look right?" |
| Ambiguous message | Send "spent 50" | Bot asks "What was it for?" |
| Follow-up response | Reply "groceries" to above | Bot logs S/50.00 — Groceries |
| Summary query | Send "how much this week?" | Bot replies with accurate breakdown |
| Set budget | Send "set food budget 800 monthly" | Bot confirms budget set |
| Query budget | Send "how's my food budget?" | Bot shows spent/remaining/percentage |
| Correct category | Send "wrong, it's transport" | Bot updates and confirms old → new |
| Delete expense | Send "delete that" | Bot confirms deletion |
| Help | Send "help" | Bot lists capabilities |
| Unsupported media | Send voice note | Bot replies "I can only process text and photos" |
| Latency | Time each interaction | Text < 5s, image < 10s |

**No automated E2E framework for WhatsApp.** This is manual testing on your phone. The friction is intentional — it forces you to experience the UX as a real user.

#### D. What to measure in production (post-deploy logging, not tests)

| Metric | How | Where |
|--------|-----|-------|
| Parse accuracy | Log `raw_input` + `ai_confidence` on every expense. Weekly: query expenses where user corrected → correction rate. | Supabase query |
| Response latency | Log `webhook_received_at` and `response_sent_at` timestamps. Compute p50/p95. | Railway logs + structured JSON |
| Daily usage | Count distinct days with ≥1 expense. | Supabase query |
| Error rate | Log errors with stack traces as structured JSON. | Railway logs |

---

## Appendix: Key Technical Decisions

### Why `handler.ts` is the most complex file

The handler is the state machine. It decides:
1. Is there pending conversation state? → Handle as follow-up
2. No state? → Call parse.ts to determine intent
3. What's the confidence? → Auto-log, confirm, or clarify
4. Which intent? → Route to appropriate action (log, query, correct, delete, etc.)
5. What state to set for next message? → Update state map

This file will need the most testing and the most iteration. Plan for it.

### Why no separate "router" or "intent classifier"

The PRD is explicit: one Claude call handles everything. The system prompt includes intent classification as part of its output. Splitting into Haiku router + Sonnet parser adds latency (2x API calls), complexity (retry logic per step), and cost that isn't justified at 5–15 messages/day.

### Timezone strategy

All dates in the database are stored as `DATE` (no time component) or `TIMESTAMPTZ` (for created_at). When computing "today" or "this week":

1. Get user's timezone from `users.timezone` (default: `America/Lima`)
2. Compute current date/time in that timezone
3. Derive date range boundaries in that timezone
4. Query with those boundaries

Library: Use Node.js built-in `Intl.DateTimeFormat` with timezone support, or a lightweight library like `date-fns-tz`. Do NOT pull in Moment.js.

### Idempotency for webhook retries

Kapso (and WhatsApp Cloud API) may retry webhook delivery. Each message has a unique `message_id`. Store the last N processed message IDs in memory (or check if expense with that `raw_input` was recently created) and skip duplicates.
