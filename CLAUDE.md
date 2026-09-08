# Project: GastoBot

## Stack
- Language: TypeScript (Node.js, ESM, strict mode)
- Framework: Fastify
- Database: PostgreSQL via Supabase JS client (direct access)
- AI: Anthropic Claude Sonnet (text), Claude Vision (receipts)
- WhatsApp: Kapso WhatsApp Cloud API
- Storage: Supabase Storage (receipt images)
- Hosting: Railway (persistent process)
- Testing: Vitest

## Commands
- `npm run dev` — start dev server with tsx watch
- `npm run build` — compile TypeScript
- `npm run start` — run compiled output (`node dist/index.js`)
- `npm run test` — unit tests only (excludes `tests/integration/**`)
- `npm run test:integration` — real API calls (~80s, ~$0.50/run)
- `npm run add-user` — CLI script to register new users (`tsx scripts/add-user.ts`)
- `npx tsc --noEmit` — type-check without emitting

## Code Style
- Single flat project — no monorepo, no packages, no shared-types folder
- All source under `src/`, all tests under `tests/`
- All TypeScript interfaces in `src/types.ts` — every cross-module shape lives here
- System prompts in `src/prompts/*.ts` as exported template string functions
- Supabase accessed via JS client only — no REST API layer
- Categories are dynamic and user-driven — AI suggests new categories when no existing one fits, user confirms to create
- Conversation state is in-memory `Map` with TTL expiry — not persisted
- Pure functions for formatting (`formatter.ts`) — no side effects
- `console.log(JSON.stringify(...))` for logging — no logging libraries
- `webhook.ts` handles HTTP only; business logic lives in `handler.ts`
- `storage.ts` (blob uploads) is separate from `db.ts` (SQL queries)

## Architecture
- `src/index.ts` — Fastify server, route registration, graceful shutdown
- `src/config.ts` — env validation, constants (thresholds, TTL, timezone)
- `src/webhook.ts` — POST /webhook (Kapso payload), GET /health, GET+POST /cron/keep-alive
- `src/handler.ts` — core orchestrator: state check → parse → route intent → respond. Intents: `log_expense`, `query_summary`, `query_budget`, `set_budget`, `correct_expense`, `delete_expense`, `list_categories`, `monthly_closing`, `help`
- `src/parse.ts` — single Claude Sonnet call per message (intent + extract + categorize)
- `src/parse-image.ts` — Claude Vision call for receipts
- `src/db.ts` — Supabase client + 18 query functions (incl. `pingDatabase()` health probe)
- `src/keep-alive.ts` — free-tier keep-alive probe + constant-time cron bearer auth
- `src/storage.ts` — download from Kapso → upload to Supabase Storage
- `src/state.ts` — conversation state Map keyed by phone number
- `src/formatter.ts` — WhatsApp-optimized response strings
- `src/utils.ts` — slugify utility for category slug generation
- `migrations/` — SQL schema files, run against Supabase directly
- `seed.sql` — default user + 9 categories

## Testing (CRITICAL)
- **Unit** (`tests/unit/`, 11 files, 350 tests): Mock external deps via hoisted `vi.mock()`. Test orchestration logic, not library wrappers. Uses inline snapshots for formatter output.
- **Integration** (`tests/integration/`, 5 files): Real Claude + Supabase API calls. Excluded from `npm run test` by vitest config. Run manually with `npm run test:integration`.
- **Validation gates**: Text parse ≥ 85% accuracy (GATE #1, currently 100%). Receipt parse ≥ 70% accuracy (GATE #2). Integration parse with payment/category fixtures ≥ 85% accuracy (GATE #3, currently 97.9%).
- **E2E**: Manual WhatsApp testing on real phone. No automated E2E framework.
- **IMPORTANT**: If tests fail, fix the CODE, not the tests. Tests define correctness.
- **YOU MUST** run `npm run test` before every commit.

## Workflow
1. Read `TASKS.md` at session start. Identify the next incomplete task.
2. Work ONE task at a time. Do not skip ahead.
3. Write/update tests FIRST, then implement, then verify with `npm run test`.
4. Respect `⚡ CRITICAL PATH` and `🚧 GATE` markers — gates block downstream tasks.
5. Commit after each completed task.
6. Commit format: `feat(TASK-XX): short description` or `fix: description`
7. Branch naming: `feat/task-XX-short-name`
8. Mark task complete in `TASKS.md` after commit: `- [x] TASK-XX`
9. If a gate fails, iterate on the blocking task until it passes. Do NOT proceed.
10. Always use Context7 MCP when I need library/API documentation, code generation, setup or configuration steps without me having to explicitly ask.

## Do NOT
- Create a monorepo, Turborepo, or shared-types package
- Build a separate REST API or core API layer
- Chain multiple LLM calls per message — single call only
- Add cron jobs, event-driven triggers, or proactive alerts — this bans *product* schedulers (budget warnings, reminders, digests). Two deliberate exceptions: (1) the infrastructure keep-alive cron (`/cron/keep-alive` + GitHub Actions), which sends no messages and touches no user data; (2) the bank-email channel (`POST /inbound/bank-email`, Phase 6), which is a *reply* to a bank notification the user forwarded — it registers the expense and sends exactly one WhatsApp message per email, never on a schedule, never batched, never a reminder. Anything time-triggered that talks to the user is still banned
- Add multi-user auth, RLS, or onboarding flows
- Receipt items are sub-items of ONE expense, not multiple expenses
- Parse multiple expenses from a single message
- Add Moment.js — use `Intl.DateTimeFormat` or `date-fns-tz`
- Add a logging library — use structured `console.log`
- Skip a validation gate or weaken pass criteria
- Implement features not in TASKS.md without explicit approval
