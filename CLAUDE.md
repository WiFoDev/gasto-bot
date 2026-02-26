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
- `npm run dev` — start dev server with tsx
- `npm run build` — compile TypeScript
- `npm run start` — run compiled output
- `npm run test` — run full Vitest suite
- `npx tsc --noEmit` — type-check without emitting

## Code Style
- Single flat project — no monorepo, no packages, no shared-types folder
- All source under `src/`, all tests under `tests/`
- All TypeScript interfaces in `src/types.ts` — every cross-module shape lives here
- System prompts in `src/prompts/*.ts` as exported template string functions
- Supabase accessed via JS client only — no REST API layer
- Conversation state is in-memory `Map` with TTL expiry — not persisted
- Pure functions for formatting (`formatter.ts`) — no side effects
- `console.log(JSON.stringify(...))` for logging — no logging libraries
- `webhook.ts` handles HTTP only; business logic lives in `handler.ts`
- `storage.ts` (blob uploads) is separate from `db.ts` (SQL queries)

## Architecture
- `src/index.ts` — Fastify server, route registration, graceful shutdown
- `src/config.ts` — env validation, constants (thresholds, TTL, timezone)
- `src/webhook.ts` — POST /webhook (Kapso payload), GET /health
- `src/handler.ts` — core orchestrator: state check → parse → route intent → respond
- `src/parse.ts` — single Claude Sonnet call per message (intent + extract + categorize)
- `src/parse-image.ts` — Claude Vision call for receipts
- `src/db.ts` — Supabase client + all query functions
- `src/storage.ts` — download from Kapso → upload to Supabase Storage
- `src/state.ts` — conversation state Map keyed by phone number
- `src/formatter.ts` — WhatsApp-optimized response strings
- `migrations/` — SQL schema files, run against Supabase directly
- `seed.sql` — default user + 9 categories

## Testing (CRITICAL)
- **Unit** (`tests/unit/`): formatter, state, config. Mock `parse.ts` and `db.ts` via `vi.mock`. ALWAYS test orchestration logic, not library wrappers.
- **Integration** (`tests/integration/`): parse accuracy (real Claude API), db queries (real Supabase), handler pipeline. These cost money — keep corpus fixed and small.
- **Validation gates**: Text parse ≥ 85% accuracy BLOCKS handler work. Receipt parse ≥ 70% accuracy OR skip receipt features entirely.
- **E2E**: Manual WhatsApp testing on real phone. No automated E2E framework.
- **IMPORTANT**: If tests fail, fix the CODE, not the tests. Tests define correctness.
- **YOU MUST** run `npm run test` before every commit.

## Workflow
1. Read `TASKS.md` at session start. Identify the next incomplete task.
2. Work ONE task at a time. Do not skip ahead.
3. Write/update tests FIRST, then implement, then verify with `npm run test`.
4. Respect `⚡ CRITICAL PATH` and `🚧 GATE` markers — gates block downstream tasks.
5. Commit after each completed task.
6. Commit format: `feat(TASK-XX): short description`
7. Branch naming: `feat/task-XX-short-name`
8. Mark task complete in `TASKS.md` after commit: `- [x] TASK-XX`
9. If a gate fails, iterate on the blocking task until it passes. Do NOT proceed.
10. Always use Context7 MCP when I need library/API documentation, code generation, setup or configuration steps without me having to explicitly ask.

## Do NOT
- Create a monorepo, Turborepo, or shared-types package
- Build a separate REST API or core API layer
- Chain multiple LLM calls per message — single call only
- Add cron jobs, event-driven triggers, or proactive alerts
- Add multi-user auth, RLS, or onboarding flows
- Parse receipt line items — totals only
- Parse multiple expenses from a single message
- Add Moment.js — use `Intl.DateTimeFormat` or `date-fns-tz`
- Add a logging library — use structured `console.log`
- Skip a validation gate or weaken pass criteria
- Implement features not in TASKS.md without explicit approval
