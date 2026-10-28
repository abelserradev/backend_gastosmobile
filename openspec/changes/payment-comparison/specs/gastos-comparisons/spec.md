# Delta spec: gastos-comparisons (Gastos as Exchange client)

Repo: backend. Traces: REQ-002, REQ-003, REQ-008, REQ-009, D4, D7, D10, D12, D13. Auth for every endpoint: same
guards as `/api/me` (JWT cookie or Bearer + `X-API-KEY`).

## ADDED Requirements

### GC-001 Exchange client

Configuration: `EXCHANGE_API_URL`, `EXCHANGE_SERVICE_KEY` (backend env only), `PAYMENT_COMPARISON_ENABLED`.

#### Scenario: Normal call
- THEN Gastos MUST call Exchange with the service key and `X-Consumer-User` = the Gastos user id, timeout 3 s,
  one retry on network error or 5xx

#### Scenario: Exchange unavailable (REQ-008)
- WHEN both attempts fail
- THEN Gastos MUST return 503 `COMPARISON_UNAVAILABLE`, and no other endpoint MUST be affected

#### Scenario: Exchange validation error
- WHEN Exchange returns 400
- THEN Gastos MUST return 400 with the same field errors

### GC-002 Create a comparison

`POST /api/me/comparisons` with the offer (prices, methods, commission %, selling rate, optional product name).

#### Scenario: Success
- WHEN Exchange returns a result
- THEN Gastos MUST store a `PaymentComparison` (status `PENDING`, owner user, offer, full result, rates,
  `computedAt`, `expiresAt` = now + 24 h) and return 201 with it

### GC-003 Read and discard

`GET /api/me/comparisons` (own pending, newest first), `GET /api/me/comparisons/:id`,
`DELETE /api/me/comparisons/:id`.

#### Scenario: Another user's comparison
- THEN the response MUST be 404

### GC-004 Expiry (D7, D10)

#### Scenario: Expired on access
- WHEN a pending comparison older than 24 h is read or converted
- THEN Gastos MUST delete it and return 410 `COMPARISON_EXPIRED`
- AND the client MUST clear the form so the user re-enters the data

#### Scenario: Periodic cleanup
- THEN pending comparisons past `expiresAt` MUST be deleted at least hourly
- AND converted comparisons MUST never be deleted by the cleanup

### GC-005 Convert to expense (REQ-002, REQ-003)

`POST /api/me/comparisons/:id/expense` with header `Idempotency-Key` and body: option id, title, categoryId or
categoryName, profileId, paymentDate.

#### Scenario: Success
- WHEN the comparison is pending, not expired, and the option exists
- THEN in one transaction Gastos MUST create a pending expense (`isPaid = false`, `amount` = option's real USD
  cost, `valuationBasis` = `SELL_RATE`, payment metadata filled, `comparisonId`) and mark the comparison
  `CONVERTED`; response 201 with the expense

#### Scenario: Same key, same body
- THEN 200 with the existing expense

#### Scenario: Same key, different body
- THEN 409

#### Scenario: Already converted with another key
- THEN 409 with the existing expense id

#### Scenario: Feature flag off
- WHEN `PAYMENT_COMPARISON_ENABLED` is false
- THEN every `/api/me/comparisons*` endpoint MUST return 404
