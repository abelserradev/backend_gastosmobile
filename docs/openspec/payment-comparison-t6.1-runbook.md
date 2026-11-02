# T6.1 runbook — local, Coolify and Cloudflare

Close the payment-comparison change with evidence before archive. Split into **API smoke** (Exchange only) and **UI flow** (Gastos + login).

## Prerequisites

| Check | Local | Coolify / tunnel |
| --- | --- | --- |
| Exchange `GET /api/v1/tasas` | `:3010` or tunnel URL | Public or internal URL |
| Gastos API | `:3088` | Internal URL for backend; public only if the app calls it |
| Angular | `:4200` | PWA URL behind tunnel |
| `PAYMENT_COMPARISON_ENABLED` | `true` in Gastos backend | Same in Coolify env |
| Migration `20261021200000_payment_comparison` | Applied on Gastos PG | Applied on deploy |
| Consumer keys | See below | Same keys in both services |

### Consumer key pairing (once per environment)

On Exchange repo:

```bash
node scripts/generar-clave-consumidor.mjs gastos
```

- **Gastos backend** (`EXCHANGE_SERVICE_KEY`): the printed plain key (secret).
- **Exchange** (`EXCHANGE_CONSUMER_KEYS`): the printed `gastos:<sha256>` entry (hash only).

Gastos must call Exchange **server-to-server** (Coolify internal hostname), not through the browser tunnel, when possible.

### Coolify layout (recommended)

1. **exchange-rate** — Next.js, Postgres 17, Redis 7. Env: `DATABASE_URL`, `REDIS_URL`, `EXCHANGE_CONSUMER_KEYS`. Port 3000 inside the stack; map or tunnel for the public React web only if needed.
2. **gastos-api** — NestJS. Env: `EXCHANGE_API_URL=http://<exchange-service-name>:3000` (adjust to your Coolify service name), `EXCHANGE_SERVICE_KEY`, `PAYMENT_COMPARISON_ENABLED=true`, `EXCHANGE_TIMEOUT_MS=3000`.
3. **gastos-web** — Angular static or SSR; `NEXT_PUBLIC` / env scripts point API to the tunnel URL users hit.

Cloudflare tunnel: point human-facing hostnames (app, optional exchange marketing site). Keep **API-to-Exchange** on the Docker network to avoid extra latency and exposing the service key path.

## Step A — Exchange API smoke (automated)

From `backend_gastosmobile`:

```powershell
# Local Exchange (pnpm exec next dev -p 3010 in exchange-rate/)
.\scripts\t6.1-exchange-smoke.ps1

# After tunnel is live
$env:EXCHANGE_SERVICE_KEY = "<plain key from generar-clave>"
.\scripts\t6.1-exchange-smoke.ps1 -BaseUrl https://exchange.example.com
```

Expected: HTTP 200, `mejores` non-empty, three `opciones` for the default offer.

## Step B — UI checklist (browser)

Requires Gastos API + frontend + Firebase login.

1. Login → **Comparar pago** visible (`/api/me/state` → `paymentComparison: true`).
2. Create comparison (USD + three methods) → ranking and best option.
3. Choose option → register pending expense → list shows nominal subtitle.
4. Expense detail → **Ver comparación de pago** → full table, chosen row highlighted.
5. Double submit with same `Idempotency-Key` → single expense.
6. Expired comparison → 410 and UI message.

### playwright-cli (optional recorder)

With app at `http://localhost:4200` (or tunnel URL):

```bash
playwright-cli open http://localhost:4200/login
# After manual login once:
playwright-cli state-save gastos-auth.json

playwright-cli state-load gastos-auth.json
playwright-cli goto http://localhost:4200/comparar
playwright-cli snapshot
# Fill form via refs from snapshot, submit, open convert dialog, etc.
playwright-cli close
```

Store `gastos-auth.json` outside git (credentials).

## Evidence to attach before marking T6.1 done

- Output of `t6.1-exchange-smoke.ps1` (local or tunnel URL).
- Screenshot or short note for steps B1–B4 minimum.
- Coolify env confirmation: `EXCHANGE_API_URL` internal, keys paired, flag on.

## Related

- `payment-comparison-verify-2026-11-01.md` — automated lint/test/build log.
- `openspec/changes/payment-comparison/tasks.md` — T6.1 checkbox.
