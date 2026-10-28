# Delta spec: gastos-app (Angular)

Repo: frontend. Traces: REQ-002, REQ-006, REQ-008, D7, D8, D9, D13. The Angular app talks only to the Gastos API,
never to Exchange.

## ADDED Requirements

### APP-001 "Comparar pago" screen

#### Scenario: Compare
- WHEN the user fills the offer (USD price, Bs price or USD at BCV/other rate, accepted methods, electronic
  commission %, selling rate) and taps "Comparar"
- THEN the app MUST call `POST /api/me/comparisons` and show the options ranked by real cost, the best option,
  break-even rate and Bs surcharge

#### Scenario: Comparison service unavailable
- WHEN the API returns 503 `COMPARISON_UNAVAILABLE`
- THEN the app MUST show "Servicio de comparación no disponible, intenta más tarde" and keep the form data

#### Scenario: Flag off
- THEN the entry MUST be hidden

### APP-002 Choose an option → expense

#### Scenario: Register
- WHEN the user picks an option, profile, category and confirms
- THEN the app MUST call `POST /api/me/comparisons/:id/expense` with an `Idempotency-Key` generated once per
  confirmation and reused on retries, and show "Gasto pendiente creado"

#### Scenario: Expired (D7)
- WHEN the API returns 410
- THEN the app MUST clear the form and show "La comparación venció, vuelve a cargar el precio"

### APP-003 Pending comparisons

#### Scenario: Resume
- WHEN the user reopens "Comparar pago"
- THEN pending comparisons younger than 24 h MUST be listed to resume or discard

### APP-004 List shows method and nominal amount

#### Scenario: Comparison expense in the list
- WHEN an expense has `valuationBasis` = `SELL_RATE`
- THEN the row MUST show the USD amount, the method label and the nominal amount (e.g. "Bs 391.400,00 · Bolívares")

### APP-005 Detail shows the comparison table (D8, D9)

#### Scenario: Open detail
- THEN the app MUST load `GET /api/me/expenses/:id/comparison` and show every option (amount charged, BCV
  equivalent, commission, real cost USD, real cost Bs, difference), highlighting the chosen one, plus rates and date

#### Scenario: Amount edit blocked
- THEN the amount MUST be read-only with the hint "Elimina el gasto y vuelve a comparar"
