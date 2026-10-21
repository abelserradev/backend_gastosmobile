# Tasks: payment-comparison

Work mode (user, 2026-10-21): **commits, not PRs**, pushed by the agent (personal project). Focus on **local**;
production (VPS + Cloudflare URL) comes later. Agents never run migrations or write to any database: migration SQL
is generated, the user applies it.

Each task = one commit (Conventional Commits, Spanish message), tests in the same commit.

## Phase 0 — Gastos backend guardrails (`develop`)

- [x] T0.1 `test(budget)`: make `active-budget-context.util.spec.ts` deterministic with a fixed clock (F-08, R-06)
- [x] T0.2 `test(bcv)`: `bcv-rate.service.spec.ts` covering PG hit, Redis hit, live OK, live fail → fallback (R-07 part 1)
- [x] T0.3 `fix(bcv)`: fallback no longer cached as today's rate; `usedFallback` propagated (F-01, R-01)
- [x] T0.4 `build(deps)`: `follow-redirects` ≥ 1.16.1 via override; `pnpm audit --prod --audit-level=high` exit 0 (F-06, R-08)

## Phase 1 — Exchange: repo + rates history (`exchange-rate`, new repo)

- [x] T1.1 `chore`: own git repo for `exchange-rate` (initial commit of the current app)
- [x] T1.2 `build(db)`: Prisma 7 + `TasaHistorial` schema + `docker-compose.yml` with local PostgreSQL; migration SQL generated (user applies)
- [x] T1.3 `feat(tasas)`: `RepositorioTasas` (Prisma) + rates service writes history and falls back to PG (RATES-001..004)
- [x] T1.4 `feat(api)`: `GET /api/v1/tasas` (public contract); `/api/tasas` stays internal for the web (RATES-002, RATES-005)

## Phase 2 — Exchange: engine API

- [ ] T2.1 `refactor(motor)`: `lib/motor/comparar.ts` on decimal.js + golden vectors; `lib/calcular.ts` becomes an adapter (PC-001, TD-1, TD-9)
- [ ] T2.2 `feat(api)`: contract v1 parse/serialize + `POST /api/v1/comparaciones` (PC-002)
- [ ] T2.3 `feat(api)`: consumer keys (hashed) + Redis rate limiting (PC-003, TD-7, TD-8)

## Phase 3 — Gastos backend: data model

- [ ] T3.1 `feat(db)`: Prisma schema (`PaymentComparison`, enums, `Expense` fields) + migration SQL (user applies) (design §3.2)
- [ ] T3.2 `feat(expenses)`: new fields in `mapExpenseToResponse`; `resolveExpenseContext()`; amount edit 409 on `SELL_RATE` (EXP-001, EXP-003, TD-4)

## Phase 4 — Gastos backend: comparisons module

- [ ] T4.1 `feat(comparisons)`: Exchange client + contract validation + error mapping (GC-001)
- [ ] T4.2 `feat(comparisons)`: create / list / read / discard + expiry on access (GC-002..004)
- [ ] T4.3 `feat(comparisons)`: convert to expense with idempotency (GC-005, TD-5)
- [ ] T4.4 `feat(comparisons)`: hourly cleanup with Redis lock + `GET /api/me/expenses/:id/comparison` + feature flag (GC-004, EXP-002, TD-6)

## Phase 5 — Gastos frontend (`develop`)

- [ ] T5.1 `feat(comparar)`: API service + "Comparar pago" form and result (APP-001, APP-003)
- [ ] T5.2 `feat(comparar)`: convert dialog with Idempotency-Key + expiry handling (APP-002)
- [ ] T5.3 `feat(gastos)`: shared comparison table in expense detail + method/nominal in list + read-only amount (APP-004, APP-005)

## Phase 6 — Local end-to-end check

- [ ] T6.1 Both services running locally (Exchange :3010, Gastos API :3088, Angular :4200); flow compare → register → detail verified in the browser
- [ ] T6.2 `sdd-verify` report + archive

## Later (production, out of this list)

VPS setup, Cloudflare DNS for Exchange, Coolify/compose for both, `EXCHANGE_API_URL` + keys in production env.
