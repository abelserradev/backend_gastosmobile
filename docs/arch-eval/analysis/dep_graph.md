# Dependency graph (modules)

**Repo:** `C:\Users\aserra\OneDrive - VENEMERGENCIA AG, C.A\Documentos\buildforge\gastos\backend_gastosmobile` · Files: 177 · Modules: 37 · Edges: 90

## 🔴 Dependency cycles (SCCs) — P1 evidence

1. `src/audit` ↔ `src/auth` ↔ `src/bcv` ↔ `src/common/utils` ↔ `src/email` ↔ `src/me` ↔ `src/me/utils`

### Mutual pairs (A→B and B→A)

- `src/audit` ↔ `src/auth`
- `src/common/utils` ↔ `src/me`

## Metrics per module (sorted by coupling)

| Module | Files | LOC | Fan-in | Fan-out | Instability | Score |
|---|---|---|---|---|---|---|
| `src/me` | 8 | 2634 | 3 | 10 | 0.77 | 30 |
| `src/inventory` | 14 | 2532 | 2 | 10 | 0.83 | 20 |
| `src/auth` | 11 | 1224 | 2 | 10 | 0.83 | 20 |
| `src/bcv` | 5 | 608 | 3 | 5 | 0.62 | 15 |
| `src` | 2 | 128 | 1 | 15 | 0.94 | 15 |
| `src/profile-collaborators` | 6 | 660 | 2 | 7 | 0.78 | 14 |
| `src/audit` | 5 | 228 | 5 | 2 | 0.29 | 10 |
| `src/common/decorators` | 2 | 13 | 8 | 1 | 0.11 | 8 |
| `src/telegram` | 13 | 2483 | 1 | 7 | 0.88 | 7 |
| `src/email` | 3 | 322 | 2 | 3 | 0.6 | 6 |
| `src/common/utils` | 8 | 616 | 5 | 1 | 0.17 | 5 |
| `src/chat` | 10 | 717 | 1 | 4 | 0.8 | 4 |
| `src/ocr` | 3 | 193 | 1 | 4 | 0.8 | 4 |
| `src/common/guards` | 6 | 160 | 4 | 1 | 0.2 | 4 |
| `src/common/services` | 3 | 182 | 3 | 1 | 0.25 | 3 |
| `src/me/utils` | 3 | 90 | 1 | 3 | 0.75 | 3 |
| `src/common/filters` | 1 | 73 | 1 | 2 | 0.67 | 2 |
| `src/inventory/entities` | 1 | 68 | 2 | 1 | 0.33 | 2 |
| `src/ocr/parsing` | 11 | 1581 | 1 | 1 | 0.5 | 1 |
| `src/ocr/services` | 6 | 624 | 1 | 1 | 0.5 | 1 |
| `src/common/cache` | 5 | 466 | 7 | 0 | 0.0 | 0 |
| `src/me/dto` | 16 | 429 | 2 | 0 | 0.0 | 0 |
| `src/inventory/dto` | 7 | 247 | 2 | 0 | 0.0 | 0 |
| `src/prisma` | 5 | 177 | 10 | 0 | 0.0 | 0 |
| `src/config` | 1 | 97 | 1 | 0 | 0.0 | 0 |

## ⚠️ God-module candidates (verify in Phase 1)

- `src/me` — fan-in 3, fan-out 10, 2634 LOC
- `src/inventory` — fan-in 2, fan-out 10, 2532 LOC
- `src/auth` — fan-in 2, fan-out 10, 1224 LOC
- `src/bcv` — fan-in 3, fan-out 5, 608 LOC

## Orphan modules (dead code or entrypoints?)

- `scripts`
