# SDD verify — payment-comparison (2026-11-01)

## Automatizado (agente)

| Proyecto | lint | test | build |
|----------|------|------|-------|
| backend_gastosmobile | `pnpm lint:ci` OK | 252 tests OK | `pnpm build` OK |
| frontend_gastosmobile | `ng lint web` OK | (no ejecutado en esta pasada) | `ng build` OK con `FIREBASE_WEB_API_KEY` + `GASTOS_API_KEY` |

## T6.1 — Progreso (2026-11-01, agente)

| Paso | Estado | Evidencia |
| --- | --- | --- |
| A — Exchange API smoke | **OK local** | `GET /api/v1/tasas` y `POST /api/v1/comparaciones` (3 opciones, `mejores: efectivo`) contra `http://localhost:3010` con Exchange en `next dev -p 3010`. Script: `scripts/t6.1-exchange-smoke.ps1`. |
| B — UI compare → gasto → detalle | **Pendiente** | Gastos API `:3088` no respondía; Docker Desktop apagado (sin PG local). Runbook Coolify/tunnel: `payment-comparison-t6.1-runbook.md`. |
| C — Idempotency / 410 | **Pendiente** | Requiere B completo o staging con login. |

Cuando Coolify + tunnel estén listos: ejecutar smoke contra la URL pública o interna y completar checklist B con login real.

## T6.1 — Checklist manual (usuario)

Requisitos: Exchange `:3010` (o URL tunnel), Gastos API `:3088`, Angular `:4200`, `PAYMENT_COMPARISON_ENABLED=true`, migración `20261021200000_payment_comparison` aplicada, claves Exchange configuradas. Ver runbook `payment-comparison-t6.1-runbook.md`.

1. Login en la app → menú **Comparar pago** visible si el flag está activo en `/api/me/state`.
2. Crear comparación (USD + métodos) → ver ranking y opciones.
3. Elegir opción → registrar gasto pendiente → aparece en lista con subtítulo nominal.
4. **Ver comparación de pago** en el gasto → tabla con opción elegida resaltada.
5. Reintentar conversión con la misma `Idempotency-Key` (simular doble tap) → un solo gasto.
6. Comparación vencida (>24 h o forzar `expiresAt`) → 410 y mensaje en UI.

## T6.2 — Archivo

Change OpenSpec: `openspec/changes/payment-comparison/` — marcar T5/T6 en `tasks.md` y `state.yaml` tras push.
