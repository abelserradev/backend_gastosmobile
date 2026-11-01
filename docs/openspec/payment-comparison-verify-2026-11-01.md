# SDD verify — payment-comparison (2026-11-01)

## Automatizado (agente)

| Proyecto | lint | test | build |
|----------|------|------|-------|
| backend_gastosmobile | `pnpm lint:ci` OK | 252 tests OK | `pnpm build` OK |
| frontend_gastosmobile | `ng lint web` OK | (no ejecutado en esta pasada) | `ng build` OK con `FIREBASE_WEB_API_KEY` + `GASTOS_API_KEY` |

## T6.1 — Checklist manual (usuario)

Requisitos: Exchange `:3010`, Gastos API `:3088`, Angular `:4200`, `PAYMENT_COMPARISON_ENABLED=true`, migración `20261021200000_payment_comparison` aplicada, claves Exchange configuradas.

1. Login en la app → menú **Comparar pago** visible si el flag está activo en `/api/me/state`.
2. Crear comparación (USD + métodos) → ver ranking y opciones.
3. Elegir opción → registrar gasto pendiente → aparece en lista con subtítulo nominal.
4. **Ver comparación de pago** en el gasto → tabla con opción elegida resaltada.
5. Reintentar conversión con la misma `Idempotency-Key` (simular doble tap) → un solo gasto.
6. Comparación vencida (>24 h o forzar `expiresAt`) → 410 y mensaje en UI.

## T6.2 — Archivo

Change OpenSpec: `openspec/changes/payment-comparison/` — marcar T5/T6 en `tasks.md` y `state.yaml` tras push.
