# Proposal: payment-comparison

| Field | Value |
|---|---|
| Status | `IN_REVIEW` (v3 — ADR-003 supersedes ADR-001 and ADR-002, 2026-10-21) |
| Date | 2026-10-21 |
| Repos affected | **exchange-rate** (`../../exchange-rate`, React/Next.js, becomes a microservice + its public web) · **backend** (this repo) · **frontend** (`../frontend_gastosmobile`, Angular) |
| API contract impact | Exchange: new versioned API `/api/v1`. Gastos: new `/api/me/comparisons` endpoints + additive expense fields. No breaking change. |

## 1. Summary

Exchange Rate and Gastos are **two separate products**. Exchange Rate is a payment-method calculator with its own
public web (React). Gastos is the expense app (Angular + NestJS).

Gastos uses Exchange Rate **as an extra**, the same way it would use any external service: Gastos has its own
"Comparar pago" screen in Angular; the Gastos backend calls the Exchange Rate microservice for rates and for the
comparison math, keeps the comparison, and turns the chosen option into a pending expense with no manual input.

Exchange Rate never stores users or expenses. It only knows whether a request comes **from Gastos on behalf of a
registered user** (service key + user id) or **from an anonymous visitor** of its public web.

## 2. Problem

- In Venezuela the same purchase has different prices per payment method (e.g. $380 cash vs Bs 391.400, which is
  $443 at BCV but only $355.82 when the buyer sells dollars at 1.100 Bs/$).
- Gastos records every Bs expense at BCV, so it overstates the real cost and cannot tell how it was paid.
- Today the user compares in one app and retypes the result in another.

## 3. Business decisions (confirmed by the user, 2026-10-21)

| # | Decision |
|---|---|
| D1 | `Expense.amount` = **real USD cost at the user's selling rate**; BCV equivalent stored as reference. |
| D2 | Electronic commission is **included** in a single expense, broken down. |
| D3 | Exchange Rate's public web keeps working without any account. |
| D4 | The created expense is **pending** (`isPaid = false`). |
| D5 | SDD persistence: hybrid (this `openspec/` + Engram project `gastos`). |
| D6 | Rates are stored in a PostgreSQL history table (new row per new value) **and** served from Redis. |
| D7 | A Gastos comparison expires after **24 h**; then it is cleared and the user re-enters the data. |
| D8 | The Gastos expense detail shows **all compared options** in the comparison table. |
| D9 | Amount edits on comparison expenses are rejected; the user deletes and compares again. |
| D10 | Expired comparisons are deleted immediately (on access + periodic cleanup), no retention. |
| D11 | Nominal amount/currency are stored only for comparison expenses; manual expenses are unchanged. |
| D12 | Exchange Rate and Gastos are **separate projects**; Exchange is a **microservice** consumed by Gastos. |
| D13 | The Gastos user compares **inside Gastos** (own Angular screen); never leaves the app. |
| D14 | The rate history table lives in **Exchange Rate's** own PostgreSQL. Gastos stores only rates used per comparison. |
| D15 | Gastos' BCV module stays as is now; later it consumes Exchange `/api/v1/tasas`. |
| D16 | "Registered user" for Exchange = the call comes from Gastos with its service key and a user id. Exchange keeps no accounts. |

## 4. Architecture decision (ADR-003, supersedes ADR-001 and ADR-002)

```
 Anonymous visitor ──▶ Exchange web (React) ──┐
                                              ├──▶ Exchange API /api/v1  (rates + engine)   PG + Redis
 Gastos user ──▶ Gastos Angular ──▶ Gastos API ┘     no users, no expenses
                                     └─ PaymentComparison + Expense (Gastos PostgreSQL)
```

| Service | Owns | Does not own |
|---|---|---|
| **Exchange Rate** | Rates and their history; comparison engine; its public web | Users, expenses, comparison history of Gastos users |
| **Gastos** | Users, login, expenses, categories, profiles; the user's comparisons (24 h) and the ones turned into expenses; the "Comparar pago" UI | Rates for comparisons; comparison math |

### Why

| Option | Verdict | Why |
|---|---|---|
| ADR-001 monolith: copy the engine into Gastos | Superseded | Duplicates the hardest part; two engines drift. Exchange is its own product. |
| ADR-002: Gastos user goes to the Exchange web, Gastos acts as OAuth provider | Superseded | Mixes both products (login of Gastos inside Exchange), user leaves Gastos, adds an auth server to build. |
| **ADR-003: Exchange as a microservice; Gastos backend is its client (backend-for-frontend)** | **Chosen** | Clear boundary, one engine, Gastos UI stays native Angular, the service key never reaches a browser or the APK, Exchange stays stateless with respect to users. |

### Rules of the boundary

1. **Only the Gastos backend calls Exchange** (server-to-server). The Angular app calls Gastos, never Exchange
   directly — so the service key is not exposed (unlike `X-API-KEY`, audit F-14).
2. Gastos authenticates with `Authorization: Bearer <EXCHANGE_SERVICE_KEY>` and sends `X-Consumer-User: <userId>`.
   Exchange uses the user id only for per-user rate limiting and logs; it never stores it.
3. Calls without a service key are anonymous: allowed, but rate-limited per IP (the public web).
4. Exchange's API is versioned (`/api/v1`) and is the contract; Gastos never depends on Exchange internals.
5. **Failure isolation:** Gastos calls Exchange with a 3 s timeout and one retry. If Exchange is down, "Comparar
   pago" shows "Servicio de comparación no disponible"; manual expenses and the rest of Gastos keep working.

### Flow

```
Angular ── POST /api/me/comparisons (offer) ──▶ Gastos API
Gastos API ── POST /api/v1/comparaciones (service key) ──▶ Exchange → result (options, best, rates, computedAt)
Gastos API: store PaymentComparison (PENDING, expiresAt = +24 h) → return to Angular
Angular ── POST /api/me/comparisons/:id/expense (option, category, profile, Idempotency-Key) ──▶ Gastos API
Gastos API: one transaction → Expense (pending) + comparison CONVERTED
```

Gastos does not recompute: the numbers come from Exchange and are stored as returned (decimal strings).

## 5. Scope

### 5.1 In scope

1. **Exchange — rates:** PostgreSQL history table + Redis cache with the 09:00 Caracas cycle and stale handling
   without cache poisoning; `GET /api/v1/tasas`.
2. **Exchange — engine API:** decimal-math engine; `POST /api/v1/comparaciones`; consumer authentication
   (service keys) and rate limiting; the public React web uses the same engine.
3. **Gastos backend:** Exchange HTTP client (timeout, retry, flag); `PaymentComparison` storage with 24 h expiry and
   cleanup; endpoints to create, read, discard and convert comparisons (idempotent); additive expense fields;
   `GET /api/me/expenses/:id/comparison`.
4. **Gastos Angular:** "Comparar pago" screen (offer form, results, detail table, choose → expense); list shows
   method + nominal amount; expense detail shows the comparison table.

### 5.2 Out of scope (v1)

- Gastos BCV module consuming Exchange rates (D15).
- Telegram bot comparisons.
- Remembering the user's selling rate as a preference.
- Other consumers of Exchange besides Gastos (the key model allows them later).

## 6. High-level requirements (EARS)

| ID | Requirement |
|---|---|
| REQ-001 | THE EXCHANGE SERVICE SHALL compute, for each accepted method, the cost in the user's USD at the user's selling rate, including electronic commission, using decimal arithmetic. |
| REQ-002 | WHEN a Gastos user chooses an option of a valid comparison, THE GASTOS SYSTEM SHALL create exactly one pending expense with `amount` = the option's real USD cost and the payment metadata and full comparison stored. |
| REQ-003 | IF the conversion is repeated with the same `Idempotency-Key`, THEN THE GASTOS SYSTEM SHALL return the existing expense. |
| REQ-004 | THE EXCHANGE SERVICE SHALL refresh rates once per cycle after 09:00 America/Caracas, keep every new value in history, serve reads from Redis and flag stale rates. |
| REQ-005 | IF DolarAPI is unavailable, THEN THE EXCHANGE SERVICE SHALL serve the last known rate marked stale and SHALL NOT store it as the current cycle's rate. |
| REQ-006 | WHEN an expense comes from a comparison, THE GASTOS APP SHALL show method and nominal amount in the list and all options in the detail. |
| REQ-007 | THE EXCHANGE SERVICE SHALL treat requests with a valid service key as coming from a registered Gastos user and requests without it as anonymous. |
| REQ-008 | IF the Exchange service is unavailable, THEN THE GASTOS SYSTEM SHALL keep every other feature working and show that comparison is unavailable. |
| REQ-009 | WHEN a Gastos comparison is older than 24 h, THE GASTOS SYSTEM SHALL delete it and reject its conversion with 410. |

## 7. Prerequisites from the scoped audit (Gastos)

| Finding | Why it matters | Handled by |
|---|---|---|
| F-08 clock-bound test fails `pnpm test` | CI and pre-push red | Phase 0 |
| F-06 `follow-redirects` high CVEs | CI audit job blocks | Phase 0 |
| F-01 fallback BCV cached as today's | Manual Bs expenses still use Gastos' BCV; Exchange applies the same rule from day one | Phase 0 (Gastos) + REQ-005 |
| F-03 no idempotency | Double expense | REQ-003 |
| F-14 `X-API-KEY` in the frontend bundle | Must not be reused for Exchange | Service key only in Gastos backend env |

## 8. Delivery plan (chained PRs, ≤ 400 changed lines each)

| Phase | Repo | Content |
|---|---|---|
| 0 | backend | Fix F-08, F-01, F-06 |
| 1 | exchange | PostgreSQL + rates history, Redis cycle, `GET /api/v1/tasas` |
| 2 | exchange | Decimal engine, `POST /api/v1/comparaciones`, service keys + rate limiting, golden vectors |
| 3 | backend | Prisma migration (additive; **the user runs it**): `PaymentComparison`, expense fields |
| 4 | backend | Exchange client + comparisons endpoints + conversion with idempotency + cleanup |
| 5 | frontend | "Comparar pago" screen, list/detail comparison table |

## 9. Risks

| Risk | Mitigation |
|---|---|
| Exchange down blocks comparisons | Timeout + retry + clear message; feature isolated (REQ-008) |
| Contract drift between services | Versioned `/api/v1`, contract tests in Gastos against recorded Exchange responses |
| Mixed valuation bases in totals | `valuationBasis` per expense, visible in detail |
| Service key leak | Only in backend env, rotation by supporting two active keys |
| Another service to operate | Exchange already runs; adds a small PostgreSQL |

## 10. Rollback

- `PAYMENT_COMPARISON_ENABLED` (Gastos backend + frontend) hides the screen and returns 404 on the new endpoints.
  Exchange's public web is unaffected.
- Gastos migration is additive (new table + nullable columns).
- Agents never run migrations or write to any database.
