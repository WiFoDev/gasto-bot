# GastoBot — Product Requirements Document

**Version:** 3.0 (Execution-Focused)
**Author:** PRD Architect + Stress-Test Revision
**Date:** February 25, 2026
**Status:** Draft — Revised for execution realism

---

## 1. Problem

Tracking daily expenses is tedious. Most finance apps require you to open a dedicated app, navigate forms, pick categories, and manually enter amounts — creating enough friction that people stop logging after a few days. The result: no visibility into spending habits, no accountability, and no path to financial improvement.

**Core insight:** The best expense tracker is the one you actually use. If logging an expense is as easy as sending a WhatsApp message, adoption sticks.

---

## 2. Hypothesis

If we reduce expense logging to a single WhatsApp message (free text, no format required), powered by an AI parsing layer that structures the data automatically, then daily logging consistency will increase dramatically compared to traditional expense apps — and the structured data enables budgeting, categorization, and spending insights without manual effort.

---

## 3. Target User

**Phase 1:** You — a solo developer who wants a personal finance tool that fits into your existing habits (WhatsApp), requires zero UI friction, and works end-to-end with minimal infrastructure.

**Phase 2:** Individuals who want a low-friction expense tracker and are comfortable interacting with a WhatsApp bot. Likely tech-savvy, 22–40, managing personal finances without a formal budgeting system.

---

## 4. Guiding Principles

These principles override all architectural decisions:

1. **Ship, then refactor.** A working single-file bot beats an unfinished multi-package monorepo. Every architectural layer must earn its existence by solving a real, current problem.
2. **Validate hard dependencies first.** If Meta Business Verification or the WhatsApp integration SDK fails, nothing else matters. Test blockers before writing features.
3. **One LLM call until proven insufficient.** Do not split parsing into multiple chained calls unless a single call demonstrably fails at the task. Latency and complexity compound fast.
4. **Manual before automated.** If a feature can be handled by you (the solo user) checking a Supabase dashboard instead of building an automated alert system, do that.
5. **Prove the habit before building the platform.** Use this daily for 30 days before investing in multi-client architecture.

---

## 5. Pre-Development Validation Checklist

Before writing any feature code, complete these gates. Each is a potential project-killer.

| # | Gate | Action | Pass Criteria | Timeline |
|---|------|--------|---------------|----------|
| 1 | Meta Business Verification | Submit Meta Business verification application | Application accepted (can take 1–4 weeks; this is opaque and non-negotiable) | Day 1 |
| 2 | WhatsApp SDK viability | Test Kapso SDK end-to-end: send message, receive webhook, reply, download image | Webhook receives messages reliably; image URLs download successfully before expiry | Days 1–2 |
| 3 | Kapso fallback plan | If Kapso fails gate #2, test Twilio WhatsApp API or direct Meta Cloud API | Working alternative identified | Days 2–3 |
| 4 | AI text parsing accuracy | Test Claude Sonnet with 20+ real expense messages in your actual mixed Spanish/English style using a single prompt | Parse accuracy ≥ 85% with one LLM call | Days 2–3 |
| 5 | AI receipt parsing viability | Test Claude Vision with 10+ real receipts from Lima (Plaza Vea, Wong, Metro, bodegas, restaurants) | Correct total + merchant extraction ≥ 70%. If below 70%, defer receipt scanning to Phase 2 | Days 3–4 |
| 6 | Supabase free tier limits | Estimate storage usage: average receipt image size × expected monthly volume. Confirm storage and row limits are sufficient | Free tier covers 6+ months of personal use | Day 2 |

**If gate #1 is not approved within 3 weeks:** Proceed with Kapso sandbox/test number for development. Do not block development, but flag production deployment as at-risk.

**If gate #5 fails:** Remove receipt scanning from Phase 1 entirely. It becomes a Phase 2 feature.

---

## 6. Architecture — Phase 1

Phase 1 uses the simplest architecture that works: a single Node.js application that receives WhatsApp messages, calls Claude once, writes to Supabase, and replies.

```
WhatsApp Message
     │
     ▼ (Kapso webhook)
┌──────────────────────────────────────┐
│        SINGLE NODE.JS APP            │
│                                      │
│  webhook.ts ──▶ parse.ts ──▶ db.ts  │
│       │             │           │    │
│       │        Claude API       │    │
│       │        (1 call)    Supabase  │
│       │             │           │    │
│       ◀─────── response.ts ◀───┘    │
│                                      │
└──────────────────────────────────────┘
     │
     ▼
WhatsApp Reply (via Kapso SDK)
```

**There is no separate Core API, no monorepo, no shared-types package, no Turborepo.** The application is one project with one `src/` folder. Supabase is accessed directly via the JS client.

**Why:** You are one person building a personal tool. A REST API layer between your own parsing code and your own database adds latency, complexity, and maintenance cost with zero benefit. If you later need a separate API (for a web dashboard), extract it then.

### Folder Structure (Phase 1)

```
gastobot/
├── src/
│   ├── index.ts              # Entry point, starts webhook server
│   ├── webhook.ts            # Kapso webhook handler
│   ├── parse.ts              # Single Claude call: route + extract + categorize
│   ├── parse-image.ts        # Claude Vision: extract receipt data
│   ├── db.ts                 # Supabase client + all queries
│   ├── formatter.ts          # Format WhatsApp response messages
│   ├── state.ts              # In-memory conversation state (Map<phone, lastAction>)
│   ├── types.ts              # All TypeScript interfaces
│   └── prompts/
│       ├── expense-parser.ts # System prompt for text expense parsing
│       ├── receipt-parser.ts # System prompt for receipt image parsing
│       └── summary.ts        # System prompt for summary formatting
├── migrations/
│   └── 001_initial.sql       # Supabase schema
├── seed.sql                  # Default categories
├── package.json
├── tsconfig.json
└── .env
```

---

## 7. AI Parsing Design — Phase 1

### One Call, Not a Chain

Phase 1 uses a **single Claude Sonnet call** per message that handles routing, extraction, and categorization in one prompt. This is the critical difference from the previous design.

**Why:** At personal scale (5–15 messages/day), the cost difference between one Sonnet call and a Haiku router + Sonnet parser is negligible (~$0.01/day difference). But the latency difference is significant: one call ≈ 1–2 seconds, two calls ≈ 3–4 seconds. And the complexity difference is enormous: one prompt to maintain vs. an orchestration layer with retry logic per step.

**When to split into a chain:** Only if testing reveals that a single prompt consistently fails at one sub-task (e.g., categorization accuracy drops below 80% when combined with extraction). Measure first, split second.

### System Prompt Design

The single system prompt instructs Claude to:

1. Determine the user's intent (log expense, query summary, set budget, correct expense, help, unknown)
2. If logging expense: extract amount, currency, category, description, merchant, date
3. If querying: identify the time range and category filter
4. Return structured JSON with a confidence score

```
Input:  "almuerzo 35 soles"
Output: {
  "intent": "log_expense",
  "data": {
    "amount": 35.00,
    "currency": "PEN",
    "category": "food_dining",
    "description": "almuerzo",
    "date": "2026-02-25",
    "confidence": 0.95
  }
}

Input:  "how much this week?"
Output: {
  "intent": "query_summary",
  "data": {
    "period": "week",
    "category": null
  }
}
```

### Receipt Image Parsing

For receipt photos (if validation gate #5 passes):

1. One Claude Vision call extracts: merchant, total amount, date, currency
2. If confidence is below 0.7 or required fields are missing → ask user to confirm
3. No evaluator-optimizer loop in Phase 1. One call + user confirmation is sufficient

**Fallback:** If the Vision call returns low confidence, reply: "I couldn't read that clearly. What was the total amount and where was it from?"

### Confidence Handling

| Confidence | Action |
|---|---|
| ≥ 0.85 | Log automatically, confirm to user |
| 0.6–0.84 | Log but ask user to confirm category |
| < 0.6 | Ask user for clarification before logging |

---

## 8. Conversation State Management

**Problem identified in stress-test:** The bot asks "what was this for?" but has no way to know the user's next message is an answer vs. a new expense.

### Solution: Minimal In-Memory State

```typescript
// state.ts
interface ConversationState {
  lastAction: 'awaiting_description' | 'awaiting_confirmation' | 'awaiting_correction' | null;
  pendingExpense: Partial<Expense> | null;
  lastExpenseId: string | null;
  updatedAt: number;
}

const state = new Map<string, ConversationState>();

// Auto-expire after 5 minutes of inactivity
// If state is expired, treat next message as fresh input
```

**Rules:**
- If state exists and is not expired → treat incoming message as a response to the pending question
- If state is expired (>5 min) or null → treat as a new intent
- If user sends something that clearly parses as a new expense while in an awaiting state → abandon pending state, process new expense
- State is in-memory only. Server restart clears it. This is acceptable for a single-user MVP.

---

## 9. Timezone Handling

**Problem identified in stress-test:** "How much today?" depends on timezone. Supabase stores UTC. Peru is UTC-5.

### Solution

- Store a `timezone` column on the `users` table. Default: `America/Lima` (UTC-5)
- All date queries in the summary logic apply the user's timezone offset before querying
- All "today", "this week", "this month" boundaries are computed in the user's local timezone
- Dates displayed in WhatsApp responses are in the user's local timezone

---

## 10. Core Features — Phase 1

### F1: WhatsApp Expense Logging (Text)

Send a WhatsApp message in any format to log an expense.

- **Input:** Free text in Spanish, English, or mixed (e.g., "almuerzo 35 soles", "uber 23.5", "lunch with maria 80")
- **Processing:** Single Claude Sonnet call → structured JSON → Supabase insert
- **Response:** Bot confirms the parsed expense (amount, category, description, date)
- **Ambiguity handling:** If amount or description is missing, ask a single follow-up question

### F2: Receipt/Image Scanning (Conditional on Gate #5)

Send a photo of a receipt to auto-extract expense data.

- **Input:** Receipt photo via WhatsApp image message
- **Processing:** Download image (handle URL expiry — download immediately on webhook receipt) → Claude Vision → extract total, merchant, date
- **Confirmation flow:** Always confirm with user before storing ("Does this look right?")
- **Fallback:** If extraction fails, ask user for amount and merchant in plain text
- **Scope limit:** Extract total amount and merchant only. No line-item parsing in Phase 1.

### F3: Auto-Categorization

AI assigns a category to every expense automatically, within the same parsing call.

- **Default categories:** Food & Dining, Transport, Groceries, Entertainment, Health, Shopping, Bills & Utilities, Education, Other
- **Correction:** User replies "wrong, it's transport" → updates the last logged expense's category
- **No learning loop in Phase 1.** Corrections update the record but don't modify future prompt behavior. Prompt tuning is manual.

### F4: Spending Summaries

User requests summaries by messaging the bot.

- **Triggers:** "how much today?", "summary this month", "what did I spend on food this week?"
- **Response:** Formatted WhatsApp text with breakdown by category and totals
- **Budget comparison:** If a budget is set for the period, include progress (e.g., "S/520 / S/800 — 65%")
- **Timezone-aware:** All period calculations use user's local timezone

### F5: Budget Tracking (Query-Only)

User sets budgets and checks them on demand. No proactive alerts in Phase 1.

- **Set:** "set food budget 800 monthly"
- **Query:** "how's my food budget?" → returns spent vs. budget, remaining, % used
- **No alerts.** The user checks their budget manually. Proactive 80%/100% alerts are Phase 2.

**Why no alerts:** Proactive alerts require either a cron job or a trigger-on-insert pattern. Both add infrastructure complexity (scheduled functions, event listeners) for a feature the solo user can replicate by typing "how's my budget?" This is a textbook case of "manual before automated."

### F6: Corrections and Deletions

- **Correct last expense:** "wrong category, it's transport" or "actually it was 45 not 35"
- **Delete last expense:** "delete that" or "cancel last one"
- **Scope:** Corrections only apply to the most recent expense. No "correct the one from Tuesday" in Phase 1.

---

## 11. Non-Goals — Phase 1

| Explicitly Out of Scope | Reason |
|---|---|
| Web dashboard or mobile app | WhatsApp is the only client |
| Voice note parsing | Requires speech-to-text pipeline |
| Bank statement imports (CSV/PDF) | Separate parsing challenge |
| Multi-currency conversion | Log in any currency, no auto-conversion |
| Shared expenses / splitting | Solo user only |
| Investment tracking | This is an expense tracker |
| Bank account linking (Plaid) | Manual logging only |
| User registration / onboarding | Single-user (phone number = identity) |
| Advanced analytics / ML predictions | Simple summaries only |
| Proactive budget alerts | User queries manually |
| Receipt line-item parsing | Store totals only |
| Multi-expense message parsing | One expense per message |
| Monorepo / shared packages | Single project, single deploy |
| Separate REST API layer | Direct Supabase access |
| Agent pattern orchestration (routing → chaining → evaluation) | Single LLM call |
| Haiku for routing | Not cost-justified at personal scale |

---

## 12. Tech Stack — Phase 1

| Layer | Technology | Rationale |
|---|---|---|
| WhatsApp Integration | Kapso WhatsApp Cloud API (primary) or Twilio (fallback) | Kapso: free, TypeScript-native. Twilio: proven reliability if Kapso fails validation gate |
| AI Parsing | Claude Sonnet API (single call per message) | Best structured extraction + vision quality. One model, no routing layer |
| Runtime | Node.js + TypeScript + Fastify | Lightweight, fast webhook handling |
| Database | PostgreSQL via Supabase | Managed Postgres, JS client, storage for receipt images |
| Hosting | Railway | Persistent process for webhook reliability (not serverless) |
| Language | TypeScript | Type safety without monorepo overhead |

---

## 13. Data Model — Phase 1

```sql
-- Users (single-user MVP)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100),
  default_currency VARCHAR(3) DEFAULT 'PEN',
  timezone VARCHAR(50) DEFAULT 'America/Lima',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Categories
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  name VARCHAR(50) NOT NULL,
  slug VARCHAR(50) NOT NULL,          -- machine-readable key for AI matching
  icon VARCHAR(10),                   -- emoji for WhatsApp display
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, slug)
);

-- Expenses
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'PEN',
  category_id UUID REFERENCES categories(id),
  description TEXT,
  merchant VARCHAR(100),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  source VARCHAR(10) NOT NULL DEFAULT 'text',  -- 'text' | 'image'
  raw_input TEXT,                               -- original message for debugging
  image_url TEXT,                               -- Supabase storage URL for receipt
  ai_confidence DECIMAL(3,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Budgets
CREATE TABLE budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  category_id UUID REFERENCES categories(id),  -- NULL = overall budget
  amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'PEN',
  period VARCHAR(10) DEFAULT 'monthly',
  start_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_expenses_user_date ON expenses(user_id, date DESC);
CREATE INDEX idx_expenses_user_category ON expenses(user_id, category_id);
CREATE INDEX idx_budgets_user_active ON budgets(user_id, category_id, period);
```

**Notable differences from v2:**

- `users.timezone` added — critical for correct date queries
- `categories.slug` added — stable identifier for AI category matching (AI returns slug, not display name)
- No `parsing_logs` table — use structured console logging (JSON) piped to Railway's log drain. Build a logging table only if you find yourself needing historical query patterns after 30 days of use
- Indexes added for the two most common query patterns

---

## 14. WhatsApp Conversation Flows

### Logging an Expense (Text)
```
User:  almuerzo 35 soles
Bot:   ✅ S/35.00 — Food & Dining
       "almuerzo" · Feb 25

User:  uber al trabajo 12.50
Bot:   ✅ S/12.50 — Transport
       "uber al trabajo" · Feb 25
```

### Logging an Expense (Receipt Photo)
```
User:  [sends photo of receipt]
Bot:   🧾 Plaza Vea — S/127.50
       Category: Groceries · Feb 25
       Look right? (reply "yes" or correct me)

User:  yes
Bot:   ✅ Logged!
```

### Handling Ambiguity
```
User:  spent 50
Bot:   Got it — S/50.00. What was it for?

User:  groceries
Bot:   ✅ S/50.00 — Groceries · Feb 25
```

### Failed Receipt Scan
```
User:  [sends blurry photo]
Bot:   Couldn't read that clearly.
       What was the amount and where was it from?

User:  127.50 plaza vea groceries
Bot:   ✅ S/127.50 — Groceries
       "plaza vea" · Feb 25
```

### Correction
```
User:  wrong, that was transport
Bot:   ✅ Updated: S/12.50 — Transport (was: Food & Dining)
```

### Deletion
```
User:  delete that
Bot:   🗑️ Deleted: S/12.50 — Transport · Feb 25
```

### Requesting Summary
```
User:  how much this week?
Bot:   📊 This Week (Feb 19–25)
       Total: S/342.50

       🍽 Food & Dining     S/185.00
       🚗 Transport          S/87.50
       🛒 Groceries          S/70.00

       Budget: S/342.50 / S/500.00 (68%)
```

### Setting a Budget
```
User:  set food budget 800 monthly
Bot:   ✅ Budget set: Food & Dining
       S/800.00/month starting March 2026
```

### Budget Query
```
User:  how's my food budget?
Bot:   🍽 Food & Dining
       Spent: S/520 / S/800 (65%)
       Remaining: S/280
       ⚠️ 5 days left in month
```

---

## 15. Constraints & Known Risks — Phase 1

### Hard Blockers

| Risk | Impact | Mitigation |
|---|---|---|
| Meta Business Verification delayed/rejected | Cannot deploy to production WhatsApp number | Submit Day 1. Develop against sandbox. If blocked >4 weeks, evaluate Telegram as alternative channel |
| Kapso SDK unreliable | Messages lost, images fail to download | Validate in gate #2. Fallback: Twilio or direct Meta Cloud API |
| WhatsApp image URL expiry | Receipt images become inaccessible before download | Download to Supabase Storage immediately upon webhook receipt (within seconds, not deferred) |

### Product Risks

| Risk | Impact | Mitigation |
|---|---|---|
| AI misparses expenses | Wrong amounts logged → trust erosion | Confidence thresholds + confirmation flow. Review misparses weekly via logs. Manually tune prompts |
| Category boundaries are ambiguous | "uber eats 23.5" = transport or food? User disagrees with AI | Define category rules explicitly in system prompt. Accept that ~10% will need correction. Make correction dead simple |
| Bilingual input inconsistency | Mixed Spanish/English causes parsing confusion | Test extensively in validation gate #4. Include bilingual examples in system prompt |
| Conversation state breaks | User sends new expense while bot awaits a response | Auto-expire state after 5 min. If new message parses as a valid expense, abandon pending state |
| Summary formatting limited by WhatsApp | No tables, no charts, limited markdown | Design summaries as plain text with emoji + whitespace alignment. Test rendering on phone |
| Correction fatigue | User stops correcting → bad data accumulates | Keep corrections to one reply ("wrong, it's X"). Track correction rate in logs |

### Technical Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Claude Vision + receipt quality | Blurry/dark/angled photos extract badly | Always confirm with user. If gate #5 shows <70% accuracy, defer to Phase 2 |
| Response latency | Text >5s or image >10s feels broken | Single LLM call (not chain) keeps text fast. Image: one Vision call + confirm, no evaluator loop |
| Supabase storage limits | Receipt images consume free tier storage | Monitor usage monthly. Compress images before upload. Upgrade tier if needed |
| Server restarts lose conversation state | In-memory state map clears | Acceptable for single-user MVP. If becomes a problem, persist to Supabase |

---

## 16. Success Criteria — Phase 1

### Ship Criteria (Before "MVP is done")

1. Send a WhatsApp text → get a confirmed, correctly parsed expense logged
2. Send a receipt photo → get an accurate extraction (total + merchant) with confirmation flow
3. Ask "how much this month?" → get an accurate, timezone-correct breakdown
4. Set a budget → query budget status and get correct remaining amount
5. Correct a miscategorized expense with one reply
6. Text response latency < 5 seconds (p95)
7. Image response latency < 10 seconds (p95)

### 30-Day Usage Criteria (After daily use)

| Metric | Target | How Measured |
|---|---|---|
| Daily logging consistency | Used 25+ of 30 days | Count distinct days with ≥1 expense logged |
| Text parse accuracy | ≥ 90% correct without correction | (Total text expenses − corrections) / Total text expenses |
| Image parse accuracy | ≥ 80% correct on first attempt | (Images confirmed "yes" on first ask) / Total image expenses |
| Correction rate | < 15% of expenses need correction | Corrections / Total expenses |
| Text response p95 latency | < 5 seconds | Log timestamp of webhook receipt → response sent |
| Image response p95 latency | < 10 seconds | Same as above |

### Failure Signals (Kill or Pivot Criteria)

- You stop logging for 3+ consecutive days (habit didn't form)
- Text parse accuracy is below 80% after 2 weeks of prompt tuning (AI isn't reliable enough)
- You find yourself opening Supabase dashboard to manually fix data more than twice per week (tool creates more work than it saves)
- Average response latency exceeds 8 seconds for text (too slow for chat UX)

---

## 17. Implementation Plan — Phase 1 (4 Weeks)

### Week 0: Validation (Days 1–4)

This is not optional pre-work. This is the most important "development" you'll do.

- **Day 1:** Submit Meta Business Verification. Set up Kapso sandbox account.
- **Days 1–2:** Test Kapso end-to-end: send message → receive webhook → reply → download image. If it fails, switch to Twilio and re-test.
- **Days 2–3:** Write and test the expense parsing system prompt. Feed it 20+ real messages in your actual style. Measure accuracy. Iterate prompt until ≥ 85%.
- **Days 3–4:** Test Claude Vision with 10+ real Lima receipts. Record accuracy. If < 70%, remove receipt scanning from Phase 1 scope.
- **Day 4:** Decision gate. Confirm: WhatsApp SDK works, text parsing is accurate, receipt scanning is go/no-go.

### Week 1: Core Loop (Days 5–11)

Build the minimum end-to-end flow: message in → expense stored → reply out.

- Initialize project: single Node.js + TypeScript + Fastify
- Set up Supabase: create schema (users, categories, expenses, budgets), seed default categories
- Build `webhook.ts`: receive Kapso webhook, extract message text and sender phone number
- Build `parse.ts`: single Claude Sonnet call with the tested system prompt. Returns structured JSON
- Build `db.ts`: Supabase client, insert expense, query expenses
- Build `formatter.ts`: format confirmation message for WhatsApp
- Wire it all together: webhook → parse → db → format → reply
- Deploy to Railway (get it running remotely early, not just locally)

**End of Week 1 deliverable:** You can send "almuerzo 35 soles" on WhatsApp and get "✅ S/35.00 — Food & Dining" back.

### Week 2: Summaries + Budgets + State (Days 12–18)

Add the query and budget features, plus conversation state for ambiguity handling.

- Build `state.ts`: in-memory Map with auto-expiry for conversation context
- Handle ambiguous messages: "spent 50" → ask follow-up → store on reply
- Add summary queries: "how much today / this week / this month / on food"
- Summary query logic: timezone-aware date range → aggregate by category → format
- Add budget CRUD: "set food budget 800 monthly" → store in budgets table
- Add budget query: "how's my food budget?" → compare spend vs. budget → format response
- Add correction flow: "wrong, it's transport" → update last expense's category
- Add deletion: "delete that" → soft-delete or hard-delete last expense

### Week 3: Receipt Scanning + Edge Cases (Days 19–25)

*If receipt scanning passed validation gate #5. Otherwise, use this week for polish and edge cases.*

- Build `parse-image.ts`: download WhatsApp image → upload to Supabase Storage → Claude Vision call
- Handle image URL expiry: download immediately in webhook handler, not deferred
- Confirmation flow: always ask "look right?" before storing receipt expenses
- Fallback: if Vision returns low confidence → ask for manual amount + merchant
- Edge cases: handle duplicate messages (WhatsApp webhook retries), empty messages, non-image media (videos, voice notes → "I can only process text and photos"), messages from unknown numbers (ignore or reply with "this is a personal bot")
- Test on real receipts: Plaza Vea, Wong, Metro, restaurant receipts, taxi receipts

### Week 4: Polish + Daily Use (Days 26–30)

- Fix bugs from Week 1–3 testing
- Tune system prompts based on real parsing failures
- Improve WhatsApp response formatting (test rendering on phone)
- Add "help" command: list what the bot can do
- Add basic error handling: graceful failures, user-friendly error messages
- Set up structured JSON logging for monitoring (parse accuracy, latency, errors)
- **Start using it daily.** Log every expense for the remaining days. Note friction points.
- Kapso production setup (if Meta verification is approved)

**End of Week 4 deliverable:** Fully functional personal expense bot, deployed, in daily use.

---

## 18. Open Questions — Phase 1

| # | Question | Recommendation | Impact if Wrong |
|---|---|---|---|
| 1 | Default currency? | PEN (Peruvian Sol). Detect "dollars" or "$" in message and use USD when explicit. | Low — easy to adjust |
| 2 | Category language? | English slugs internally, Spanish display names in WhatsApp. AI normalizes to English slugs. | Low — prompt change only |
| 3 | Kapso vs. Twilio? | Kapso primary, Twilio fallback. Decided by validation gate #2. | High — must decide by Day 2 |
| 4 | Kapso free tier limits? | Verify media message limits before committing. If limited, Twilio may be necessary. | Medium — cost impact |
| 5 | Store receipt line items? | No. Totals only for Phase 1. | Low — additive later |
| 6 | Railway vs. Vercel? | Railway. Webhooks need persistent processes, not cold-start serverless. | Medium — deploy architecture |

---

---

# Phase 2 — Enhanced Product (Weeks 5–12)

Phase 2 begins only after Phase 1 has been in daily use for 30 days and success criteria are met. Phase 2 features are prioritized by what friction you actually experienced during those 30 days, not by what sounds architecturally interesting.

---

## 19. Architecture Evolution — Phase 2

Phase 2 introduces the structural changes needed to support multiple clients and multiple users.

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT LAYER                            │
│  ┌──────────┐   ┌──────────┐                               │
│  │ WhatsApp │   │ Web App  │                               │
│  │  Bot     │   │ (Next.js)│                               │
│  └────┬─────┘   └────┬─────┘                               │
│       │              │                                      │
└───────┼──────────────┼──────────────────────────────────────┘
        │              │
        ▼              ▼
┌─────────────────────────────────────────────────────────────┐
│              AI PARSING LAYER (Entry API)                    │
│                                                             │
│  ┌─────────┐   ┌──────────────┐   ┌────────────────┐      │
│  │ ROUTER  │──▶│  SPECIALIZED │──▶│  EVALUATOR     │      │
│  │ (Haiku) │   │  HANDLERS    │   │  (Confidence)  │      │
│  └─────────┘   └──────────────┘   └────────────────┘      │
│                                                             │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                  CORE REST API                               │
│  Auth: Supabase Auth (JWT)                                  │
│  Endpoints: expenses, categories, budgets, summaries         │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              PostgreSQL via Supabase                          │
│              + Row Level Security                            │
└─────────────────────────────────────────────────────────────┘
```

**What changes from Phase 1:**

- Extract Core REST API as a separate service (needed once web dashboard exists)
- Introduce Turborepo monorepo with shared-types (justified by 2+ consumers of the API)
- Split AI parsing into Router (Haiku) + Specialized Handlers (Sonnet) — justified by multi-user cost optimization
- Add Supabase Auth + Row Level Security for multi-user support
- Add Evaluator-Optimizer pattern for receipt scanning (justified by user feedback on accuracy)

**The architectural upgrade is earned, not assumed.** Each change is triggered by a real Phase 1 learning.

---

## 20. Features — Phase 2

### P2-F1: Proactive Budget Alerts

- Trigger: on each expense insert, check if category or overall budget exceeds 80% or 100%
- Implementation: Supabase Edge Function triggered by INSERT on expenses table
- Send WhatsApp message: "⚠️ You've hit 80% of your Food budget (S/640 / S/800)"
- **Prerequisite:** Budget query feature must have been actively used in Phase 1. If you never checked your budget during 30 days, alerts won't help.

### P2-F2: Web Dashboard

- Next.js app in `apps/web-app/`
- Charts: spending over time, category breakdown, budget vs. actual
- Table view: searchable, filterable expense list
- Uses the same Core REST API that WhatsApp bot uses
- Auth: Supabase Auth (email + password or magic link)

### P2-F3: Multi-User Support

- Supabase Auth for user registration
- Row Level Security on all tables (user can only see their own data)
- Onboarding flow: first WhatsApp message creates account, sets default currency and timezone
- Rate limiting on AI parsing calls per user

### P2-F4: Voice Note Parsing

- WhatsApp voice note → download audio → speech-to-text (Whisper API or similar) → text → existing parse pipeline
- Only add this if you find yourself wanting to log expenses verbally during Phase 1

### P2-F5: Bank Statement Import (CSV/PDF)

- Upload CSV or PDF bank statement via web dashboard
- Parse and categorize transactions in bulk
- Deduplication against manually logged expenses

### P2-F6: Agent Pattern Upgrade

Split the single-call parser into specialized handlers, but only for the intents that need it:

- **Router (Haiku):** Cheap intent classification
- **Expense Text Handler (Sonnet):** Prompt chain with validation gates — only if single-call accuracy was insufficient
- **Receipt Handler (Sonnet + Vision):** Evaluator-Optimizer loop — only if single-call Vision accuracy was below 85%
- **Summary Handler:** Direct DB query + formatting (no LLM needed for this)

### P2-F7: Correction Learning

- Track all user corrections in a `corrections` table
- Periodically review corrections to identify systematic prompt failures
- Update system prompts with explicit correction examples (few-shot learning)
- Eventually: include recent corrections as context in the parsing prompt for each user

### P2-F8: Monorepo Migration

```
gastobot/
├── turbo.json
├── packages/
│   ├── shared-types/
│   ├── core-api/
│   ├── ai-parsing/
│   └── db-schema/
├── apps/
│   ├── whatsapp-bot/
│   └── web-app/
└── tooling/
```

This structure is justified once there are 2+ apps consuming shared packages. Not before.

---

## 21. Phase 2 Prioritization

After 30 days of Phase 1 use, rank these based on actual pain points:

| Priority | Feature | Trigger |
|---|---|---|
| Do first | Whatever caused the most friction in Phase 1 | Your own daily use experience |
| Likely high | Web Dashboard (P2-F2) | "I want to see trends and charts" |
| Likely high | Proactive Budget Alerts (P2-F1) | "I keep forgetting to check my budget" |
| Medium | Multi-User (P2-F3) | Someone else wants to use it |
| Medium | Correction Learning (P2-F7) | Correction rate is still >10% after prompt tuning |
| Lower | Voice Notes (P2-F4) | You actually tried to send voice notes in Phase 1 |
| Lower | Bank Import (P2-F5) | You want retroactive data |
| Defer | Agent Pattern Upgrade (P2-F6) | Single-call accuracy is provably insufficient |
| Defer | Monorepo (P2-F8) | You have 2+ apps sharing code |

---

## 22. Summary

**Phase 1 is a bet on the habit, not the architecture.** You're testing whether WhatsApp expense logging sticks as a daily behavior. Everything is optimized for speed to that answer: single project, single LLM call, direct database access, minimal infrastructure.

**Phase 2 is earned by Phase 1 success.** Every architectural upgrade, every new feature, every pattern is justified by real friction observed during 30 days of daily use. Nothing is built on speculation.

**The most likely failure mode is not technical — it's motivational.** Ship fast, use it daily, iterate based on reality.
