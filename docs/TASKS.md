# TASKS — Switch system to native Spanish

All user-facing bot responses are currently in English. Since our main users
are Spanish-speaking LATAM users, translate every string the user sees into
natural Latin American Spanish.

**Scope**: formatter.ts (22 functions), handler.ts (2 strings), webhook.ts (1 string),
plus all test snapshots/assertions.

**Out of scope**: AI system prompts (already handle Spanish input), schema, config.

---

## Tasks

- [x] TASK-31 (feature): Translate `formatter.ts` to Spanish + update `formatter.test.ts`
  - Translate all 22 user-facing string functions to natural LATAM Spanish
  - Change `formatDate` locale from `en-US` to `es` (e.g. "Feb 25" → "25 feb")
  - Change `formatCurrency` number locale if needed (Peru uses same `1,234.50` format — verify)
  - Update all ~30 inline snapshots in `formatter.test.ts`
  - Update all string assertions that match English words (e.g. "Updated", "Deleted", "Got it")
  - Key translations:
    - "Got it — {amount}. What was it for?" → "Listo — {amount}. ¿En qué fue?"
    - "Something went wrong, try again." → "Algo salió mal, intenta de nuevo."
    - "Updated:" → "Actualizado:"
    - "Deleted:" → "Eliminado:"
    - "No recent expense to modify." → "No hay gasto reciente para modificar."
    - "Spent:" / "Remaining:" → "Gastado:" / "Restante:"
    - "Over budget by" → "Excediste por"
    - "days left in month/week" → "días restantes en el mes/semana"
    - "Today" / "This Week" / "This Month" → "Hoy" / "Esta semana" / "Este mes"
    - "Total:" → "Total:" (same)
    - "No expenses recorded." → "Sin gastos registrados."
    - "Look right?" → "¿Está bien?"
    - "Receipt" → "Recibo"
    - Help text: translate all examples to Spanish
    - "This is a personal bot." → "Este es un bot personal."
    - "I can only process text and photos right now." → "Solo puedo procesar texto y fotos por ahora."

- [x] TASK-32 (feature): Translate `handler.ts` + `webhook.ts` strings + update tests
  - `handler.ts` `buildConfirmationMessage`: `" at "` → `" en "`, `"Log it?"` → `"¿Lo registro?"`
  - `webhook.ts` line 206: replace hardcoded `'Something went wrong, try again.'` with `formatError()`
  - Update `handler.test.ts` assertions that check English substrings in responses
  - Update `webhook.test.ts` if it asserts on the fallback string
  - Depends on: TASK-31

- [ ] TASK-33 (chore): Final verification pass
  - Run `npm run test` — all 265 tests must pass
  - Run `npx tsc --noEmit` — no type errors
  - Grep codebase for remaining English user-facing strings (exclude prompts, logs, types)
  - Verify no English leaks in any response path
  - Depends on: TASK-32
