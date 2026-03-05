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
>
> **Source**: `ideal-bot-state/financial-advisor.skill`

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

- [ ] TASK-56: Update CLAUDE.md for Phase 3
  - Remove "Parse receipt line items — totals only" from Do NOT list
  - Add: "Receipt items are sub-items of ONE expense, not multiple expenses"
  - Depends on: TASK-55

---

### Phase 4: Financial Rules Engine

> User-defined rules checked on every expense log. Types: spending limits, payment defaults, prohibitions, habits. Violation alerts appended to expense confirmation.

- [ ] TASK-57: Migration + types for financial rules
  - Create `migrations/005_financial_rules.sql`: `financial_rules` table (user_id, name, rule_type, category_id, threshold, period, action_value, is_active)
  - Add `FinancialRule` interface. Add `set_rule`, `list_rules`, `delete_rule` intents
  - Depends on: Phase 3

- [ ] TASK-58: DB functions for rules CRUD
  - `insertRule`, `getActiveRules`, `deleteRule` in db.ts
  - Integration tests
  - Depends on: TASK-57

- [ ] TASK-59: Rules engine — checking logic
  - New `src/rules.ts`: `checkRules(userId, expense, rules): RuleViolation[]`
  - Pure function, no side effects
  - Unit tests with various rule combinations
  - Depends on: TASK-57

- [ ] TASK-60: Prompt update for rule intents
  - Add `set_rule`, `list_rules`, `delete_rule` to expense-parser prompt with examples
  - Add ~10 fixtures: "avisa si gasto mas de 100 en comida", "mis reglas", "borra la regla de comida"
  - Depends on: TASK-57

- [ ] TASK-61: Handler for rule CRUD + violation checks
  - `handleSetRule()`, `handleListRules()`, `handleDeleteRule()`
  - After expense logging, call `checkRules()` and append alerts
  - Unit tests
  - Depends on: TASK-58, TASK-59, TASK-60

- [ ] TASK-62: Formatter for rules
  - `formatRuleCreated()`, `formatRuleList()`, `formatRuleDeleted()`, `formatRuleViolation()`
  - Inline snapshot tests
  - Depends on: TASK-61

- [ ] TASK-63: Integration parse accuracy test for rule intents
  - Verify rule intent fixtures parse correctly
  - Depends on: TASK-60

---

### Future Ideas (Not Scoped)

> These are deferred ideas that don't fit the current WhatsApp architecture or aren't prioritized yet.

- **Bank statement analysis**: PDF upload → extract transactions → categorize → summary. Requires multi-call architecture or external processing. Better suited for a web companion app.
- **User financial profile**: Income, accounts, portfolio tracking. Too complex for chat interface.
- **Proactive alerts**: Scheduled budget warnings (needs cron/scheduler — currently blocked by architecture constraint).
- **Multi-currency dashboard**: Exchange rate tracking, cross-currency summaries.
- **Shared expenses**: Split tracking between users.
