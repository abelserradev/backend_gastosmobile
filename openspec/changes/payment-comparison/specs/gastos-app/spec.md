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

## ADDED Requirements (2026-11-02, web entry points)

Context: on the web build the only entry to "Comparar pago" was the expenses sidebar, which is closed below 1024 px,
and `/` shows the marketing landing. Users read it as a mobile-only feature.

### APP-006 Web entry points

#### Scenario: Entry visible without opening the menu
- WHERE `features.paymentComparison` is true
- WHEN the user opens `/expenses` at any viewport width
- THEN a "Comparar pago" entry MUST be visible in the main column (the sidebar entry stays)

#### Scenario: Landing call to action
- WHEN an anonymous visitor opens `/` on the web
- THEN the landing MUST show a "Comparar formas de pago" card linking to `/login?next=/comparar`

#### Scenario: Return to the requested page after login
- WHEN the user logs in from `/login?next=<path>` and onboarding sends them to `/expenses`
- THEN the app MUST navigate to `<path>` instead
- IF `<path>` is not an internal absolute path (e.g. `//evil.com`, `https://…`, `/\…`)
- THEN the app MUST ignore it and keep the onboarding route

#### Scenario: Protected page without session
- WHEN an anonymous user opens a protected route such as `/comparar`
- THEN the guard MUST redirect to `/login?next=<that route>`

### APP-007 External calculator link (optional)

- WHERE the user is on `/comparar` or the landing card
- THE SYSTEM SHALL offer a secondary link to the public Exchange calculator (`<exchangePublicUrl>/calcular`) opened in
  a new tab; it never replaces `/comparar`, which is the only flow that creates an expense

### APP-008 Exchange links back to Spend$ave (repo `exchange-rate`)

- THE Exchange public web SHALL show a link to `https://mobilegastos.buildforge.work/login?next=/comparar` so users can
  register the chosen option as an expense
- Exchange MUST NOT receive or forward any Gastos credentials; the link is plain navigation
