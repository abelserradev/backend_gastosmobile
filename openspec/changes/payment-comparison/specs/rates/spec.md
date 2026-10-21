# Delta spec: rates

Repo: **exchange-rate**. Traces: REQ-004, REQ-005, D6, D14, D15. Gastos' BCV module is untouched in this delivery
(its F-01 fix is Phase 0 of the backend and is tracked in the audit plan, not here).

## ADDED Requirements

### RATES-001 Rate history table

Exchange SHALL keep a PostgreSQL table `tasa_historial` with one row per **new value** of each rate
(`oficial`, `paralelo`): value, source (`dolarapi`), `fechaActualizacion` from the source, `cicloYmd`
(Caracas day of the 09:00 cycle) and `obtenidaEn`.

#### Scenario: New value published
- GIVEN the latest stored `paralelo` is 1100.00
- WHEN the refresh obtains 1104.17
- THEN a new row MUST be inserted and Redis MUST be updated from that row

#### Scenario: Same value again
- WHEN the refresh obtains a value equal to the latest stored one
- THEN no new row MUST be inserted, and Redis MUST keep the stored row

### RATES-002 Read path served from Redis

#### Scenario: Normal read
- WHEN any client calls `GET /api/v1/tasas`
- THEN the response MUST come from Redis without querying PostgreSQL
- AND include for each rate: value, `fechaActualizacion`, `cicloYmd`, `stale`

#### Scenario: Redis empty or unavailable
- WHEN Redis has no entry (cold start) or is down
- THEN the latest row from PostgreSQL MUST be served and Redis repopulated when available

### RATES-003 Daily cycle at 09:00 America/Caracas

#### Scenario: First read after 09:00
- GIVEN the cached rates belong to the previous cycle
- WHEN the first read after 09:00 Caracas happens
- THEN Exchange MUST refresh from DolarAPI once (single-flight lock) and serve the new values

#### Scenario: Before 09:00
- WHEN a read happens at 08:59 Caracas
- THEN the previous cycle's rates MUST be served as current (not stale)

### RATES-004 Source failure without cache poisoning

#### Scenario: DolarAPI down after 09:00
- WHEN the refresh fails
- THEN the last stored rate MUST be served with `stale: true`
- AND it MUST NOT be stored as the current cycle's rate, so the next read retries (after a 5-minute backoff)

#### Scenario: No rate ever stored
- WHEN the refresh fails and the history table is empty
- THEN `GET /api/v1/tasas` MUST return 503 and the UI MUST allow manual rate input

### RATES-005 Public read API

#### Scenario: Rate limiting
- WHEN a client exceeds 60 requests per minute per IP
- THEN Exchange MUST return 429

#### Scenario: Future consumer (D15)
- THEN the response shape MUST be versioned under `/api/v1` so Gastos can consume it later without changes
