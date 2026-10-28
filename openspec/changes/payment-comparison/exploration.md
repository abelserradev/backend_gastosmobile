# Exploration: payment-comparison

Date: 2026-10-21 · Repos read: `backend_gastosmobile`, `frontend_gastosmobile`, `../../exchange-rate` (reference).
No `.codegraph/`, `graphify-out/` or `lat.md/` exists in any of the three, so this was built from direct reads.

## What already exists in Gastos

| Capability | Where | Notes |
|---|---|---|
| BCV official rate from DolarAPI, PG table + Redis `gastos:bcv:day:{ymd}` | `src/bcv/bcv-rate.service.ts`, `BcVOfficialRate` model | On-demand fetch, no scheduled refresh, `/v1/dolares/oficial` + historic only |
| Bs → USD conversion at creation time | `src/common/utils/amount-currency.util.ts`, `MeService.createExpense` (`src/me/me.service.ts:1008-1058`) | Stores USD in `Expense.amount`, plus `bcvRateApplied` / `bcvRateDate` |
| Expense creation API | `POST /api/me/expenses`, `POST /api/me/expenses/with-receipt` | JWT (cookie or Bearer) + `X-API-KEY`; used by web, APK and Telegram bot |
| Expense creation UI | Angular `ExpenseTypeSelectorComponent` (`manual` / `invoice` / `payment` / `income`) → modals | Signals, standalone components, Tailwind 4, `MeApiService` |
| Audit trail | `DomainAuditEvent` via `recordExpenseEvent` | Fail-open |

## What is missing for the comparator

- Parallel rate (DolarAPI `/v1/dolares/paralelo`) — not consumed anywhere.
- Payment method on `Expense` (cash USD / electronic USD / Bs) — no column, no enum.
- Platform commission, user selling rate, nominal amount + currency — Bs nominal is lost after conversion.
- Idempotent expense creation — none (`grep idempot` → 0).
- Server-side comparison history — the Next.js app keeps it in `localStorage`.

## Exchange Rate app (reference) — reusable assets

- Pure engine `lib/calcular.ts` (`calcularComparacion`, `describirMejorOpcion`) with 18 unit tests, including the user's real case (GPU: $380 vs Bs 391.400, sell rate 1100 → Bs costs $355.82).
- Offer model `OfertaVendedor` (methods, USD price, Bs price + origin, electronic commission %).
- Rate cache with a daily 09:00 America/Caracas cycle (Redis + in-memory fallback, lock, stale flag).

## Audit inputs (scoped)

See `docs/code-audit/2026-10-21-integracion-exchange/01-AUDIT-REPORT.md`. Findings that gate this change:
F-01 (fallback rate cached as "today" and served as fresh — verified at `bcv-rate.service.ts:195-209` + `:76-79`),
F-03 (no idempotency — verified at `me.service.ts:1030`), F-04 (frontend converts with its own rate),
F-05 (money math in `number`), F-07 (rates service 8% covered), F-08 (clock-bound test breaks `pnpm test`).

## Related workspace fact

`project-condominio` also consumes BCV rates (its own `TasaBcv` module). That is the trigger to watch for extracting
rates into a shared service later (see proposal, "Revisit triggers").
