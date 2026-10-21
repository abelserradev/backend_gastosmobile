# Delta spec: expenses

Repo: backend. Traces: REQ-002, REQ-006, D1, D8, D9, D11. Additive to the existing expense API (no main spec yet →
ADDED). Comparison expenses are created only through GC-005 (`gastos-comparisons`).

## ADDED Requirements

### EXP-001 Payment metadata on expenses

Every expense response (`GET /api/me/state`, list endpoints, `POST /api/me/expenses`, the new comparison endpoint)
SHALL include these fields, `null` when unknown:
`paymentMethod`, `nominalAmount`, `nominalCurrency`, `commissionPct`, `commissionUsd`, `sellRate`,
`bcvEquivalentUsd`, `valuationBasis` (`BCV` | `SELL_RATE`), `comparisonId`.

#### Scenario: Existing expenses keep working
- GIVEN an expense created before this change
- WHEN it is returned by any endpoint
- THEN all new fields MUST be `null` except `valuationBasis`, which MUST be `BCV`
- AND `amount`, `bcvRateApplied` and `bcvRateDate` MUST be unchanged

#### Scenario: Manual expenses are unchanged
- WHEN a client calls `POST /api/me/expenses` (USD or Bs)
- THEN the expense MUST be created exactly as today, with `valuationBasis` = `BCV`
- AND every payment metadata field MUST stay `null` (nominal amounts are stored only for comparison expenses,
  confirmed 2026-10-21)

### EXP-002 Comparison table for an expense (D8)

`GET /api/me/expenses/:id/comparison`

#### Scenario: Expense created from a comparison
- GIVEN an expense created from a comparison with three options
- WHEN the user requests its comparison
- THEN the response MUST be 200 with all three options (amount charged, BCV equivalent, commission, real cost USD,
  real cost Bs, difference vs best), the chosen option, the rates used and the comparison date

#### Scenario: Expense without comparison
- WHEN the expense was not created from a comparison
- THEN the response MUST be 404

#### Scenario: Shared profiles
- GIVEN the user can read the expense through a profile they collaborate on
- WHEN they request its comparison
- THEN the same visibility rule as the expense itself MUST apply

### EXP-003 Edits do not silently re-value comparison expenses

#### Scenario: Editing title or category
- WHEN the user edits title or category of an expense with `valuationBasis` = `SELL_RATE`
- THEN `amount`, payment metadata and the comparison link MUST be preserved

#### Scenario: Editing the amount
- WHEN the user edits the amount of an expense with `valuationBasis` = `SELL_RATE`
- THEN the edit MUST be rejected with 409 and a message asking to delete and compare again
- (Rationale: re-valuing with today's BCV would mix bases; see audit F-02. Confirmed 2026-10-21.)
