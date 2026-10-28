# Delta spec: payment-comparison (Exchange engine API)

Repo: **exchange-rate**. Traces: REQ-001, REQ-007, D1, D2, D12, D16. The engine runs only in Exchange; Gastos
stores what Exchange returns and never recomputes.

## ADDED Requirements

### PC-001 Engine with decimal arithmetic

For an offer (USD price, Bs price, accepted methods, electronic commission %, user's selling rate, BCV rate) the
engine SHALL return per option: amount charged, BCV equivalent USD, commission USD, real cost USD, real cost Bs,
difference vs best; plus best option, break-even rate and Bs surcharge %. Money math SHALL use a decimal library;
values are serialized as decimal strings rounded half-up to 2 decimals.

#### Scenario: Golden vector — sell rate 1100
- GIVEN USD 380 cash, Bs 391.400, BCV 883.40, sell rate 1100
- THEN Bs real cost MUST be 355.82, BCV equivalent 443.06, saving vs cash 24.18, break-even 1030.00,
  surcharge 16.59 %, best option "bs"

#### Scenario: Golden vector — electronic commission
- GIVEN USD 380 cash and electronic with 3 % commission, Bs 391.400, sell rate 1004.16805
- THEN electronic MUST be 391.40, Bs 389.78, cash 380.00, best option "efectivo"

#### Scenario: Ties
- WHEN two options differ by less than 0.005 USD
- THEN they MUST be reported as tied

### PC-002 Comparison endpoint

`POST /api/v1/comparaciones`

#### Scenario: Valid offer
- WHEN the body is a valid offer
- THEN the response MUST be 200 with options, best option, break-even, surcharge, rates used (value + source date)
  and `computedAt`
- AND Exchange MUST NOT persist the comparison

#### Scenario: Selling rate omitted
- WHEN no selling rate is sent
- THEN the current `paralelo` rate MUST be used and reported as such

#### Scenario: Invalid offer
- WHEN prices are ≤ 0, commission > 30 %, or no method is accepted
- THEN the response MUST be 400 with field errors

### PC-003 Consumers: registered (via Gastos) vs anonymous (D16)

#### Scenario: Call from Gastos
- WHEN the request has `Authorization: Bearer <service key>` matching a configured consumer and `X-Consumer-User`
- THEN it MUST be treated as a registered user of that consumer: limit 60 req/min per user id, logged with consumer
  name and user id, and the user id MUST NOT be stored

#### Scenario: Anonymous call (public web or unknown client)
- WHEN no service key is sent
- THEN the request MUST be served with a limit of 30 req/min per IP

#### Scenario: Invalid service key
- WHEN a service key is sent but does not match
- THEN the response MUST be 401 (never silently downgraded to anonymous)

#### Scenario: Key rotation
- THEN Exchange MUST accept up to two active keys per consumer

### PC-004 Public web uses the same engine (D3)

#### Scenario: Public calculator
- WHEN an anonymous visitor uses the Exchange web
- THEN results MUST come from the same engine as PC-001 and every current feature (detail, local history,
  settings) MUST keep working without an account
