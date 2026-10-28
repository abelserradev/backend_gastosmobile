# Plan de remediación — integración calculadora de métodos de pago (exchange)

Referencia: `01-AUDIT-REPORT.md` (misma carpeta). Leyenda de la columna **Integración**:
- **PRERREQUISITO**: resolver antes de construir la calculadora.
- **AFECTA**: resolver durante la integración o justo después.
- **INDEPENDIENTE**: no condiciona la feature.

> Política del usuario aplicable a todo el plan: el agente no hace `git push`, no hace commits si no se piden explícitamente y no escribe en ninguna BD. Las migraciones Prisma (`prisma migrate dev/deploy`) y cualquier `pnpm install` las ejecuta el usuario.

## Fase 0 — Guardrails (antes de tocar código)

### R-00a · Reparar `node_modules` del backend (entorno local)
- **Causa:** los junctions de pnpm apuntan a `buildforge\backend_gastosmobile` (ruta anterior al move). Con eso `pnpm exec`, `pnpm test` y los hooks locales no funcionan, así que el pre-commit y el pre-push hoy no protegen nada en esta máquina.
- **Fix (lo ejecuta el usuario):** `pnpm install --frozen-lockfile` en `gastos/backend_gastosmobile` y en `gastos/frontend_gastosmobile` (este último no tiene `node_modules`).
- **Esfuerzo:** S · **Verificación:** `pnpm exec eslint src/bcv --max-warnings 0` corre sin pedir reinstalación, y `pnpm exec ng lint web` corre en el front.

### R-00b · Hooks que faltan en los `.pre-commit-config.yaml` existentes (no se crea archivo nuevo)

Hooks actuales en ambos repos: gitleaks, prettier `--check`, eslint `--max-warnings 0` y pre-push con `lint:ci` + tests.

| Repo | Hook que falta | Comando propuesto | Etapa |
|---|---|---|---|
| backend | Type-check | `pnpm exec tsc --noEmit -p tsconfig.json` | pre-commit (`pass_filenames: false`, `files: \.ts$`) |
| backend | SCA si cambia el lockfile | `pnpm audit --prod --audit-level=high` | pre-commit, `files: ^pnpm-lock\.yaml$` |
| backend | Validar schema Prisma | `pnpm exec prisma validate` | pre-commit, `files: ^prisma/schema\.prisma$` (no toca la BD) |
| backend | Duplicación | `npx jscpd@4 src --min-tokens 50 --threshold 3 --ignore "**/*.spec.ts"` | pre-push |
| backend | Complejidad / SAST ligero | Añadir `eslint-plugin-sonarjs` (`cognitive-complexity: 12`) y `eslint-plugin-security` a `eslint.config.mjs` (devDeps) | vía hook eslint existente |
| frontend | SCA si cambia el lockfile | `pnpm audit --prod --audit-level=high` | pre-commit, `files: ^pnpm-lock\.yaml$` |
| frontend | Type-check | `pnpm exec tsc --noEmit -p tsconfig.app.json` | pre-commit |
| frontend | Duplicación | `npx jscpd@4 src/app --min-tokens 50 --threshold 5` | pre-push |
| ambos (CI) | Cobertura mínima en dinero | backend: `jest --coverage --coverageThreshold` para `src/bcv` y `src/common/utils/amount-*` (85 % líneas, 80 % ramas) | CI |

- **Esfuerzo:** S · **Verificación:** `pre-commit validate-config` y luego `pre-commit run --all-files` en verde (después de R-06).

## Fase 1 — P1
No hay hallazgos P1.

## Fase 2 — P2

### R-01 · Que el fallback no envenene la caché del día (F-01) — **PRERREQUISITO**
- **Fix:**
  1. En `bcv-rate.service.ts` `fallbackToLastKnownRate` (:195-219), **no** escribir `bcv:day:<hoy>` con la fila de otro día. Si se quiere evitar golpear DolarAPI en bucle, usar una clave de "negative cache" corta (`bcv:day:<ymd>:fallback`, TTL 5-10 min) que guarde también `usedFallback: true`.
  2. En `BcvDayCachePayload`, añadir `usedFallback` y propagarlo en `readDayFromCache`/`getVesPerUsdForCalendarDay` (:76-79).
  3. Regla defensiva: si `payload.rateDateYmd !== ymd` en un día hábil, considerarlo stale.
- **Esfuerzo:** S · **Riesgo del fix:** más llamadas a DolarAPI durante una caída (mitigado con el TTL corto).
- **Verificación:** nuevo spec `bcv-rate.service.spec.ts`. Caso: "live falla → devuelve fila de ayer con `usedFallback: true`; segunda llamada en el mismo día con live recuperado → devuelve la tasa nueva con `usedFallback: false`". Ejecutar `pnpm test -- --testPathPatterns bcv-rate` en verde.

### R-02 · Una sola fuente de verdad para la conversión de moneda: el backend (F-04) — **PRERREQUISITO**
- **Fix:**
  1. Frontend: `me-api.service.ts` `createExpense` acepta `amountCurrency: 'USD' | 'BS'`. `expense-modal.component.ts:156-178` envía el monto **original** en Bs con `amountCurrency: 'BS'` y la vista previa queda solo como UI.
  2. Para la calculadora, crear un endpoint de cotización en el backend (p. ej. `GET /bcv/cotizacion?date=` que devuelva oficial + paralelo + `stale`) y que el `POST` de creación reciba `paymentMethod`, el monto original y `commissionPct`. El servidor calcula `amount` y el equivalente BCV.
  3. El frontend nunca debe persistir un monto calculado con `readBcvRateCacheOrLatest` de otra fecha. Si `fromLocalCache`, solo mostrar la vista previa con un aviso.
- **Esfuerzo:** M · **Riesgo del fix:** cambia el contrato de `POST /me/expenses`. Mantener la compatibilidad (USD por defecto si falta `amountCurrency`, que ya es el comportamiento actual).
- **Verificación:** spec backend "BS 150 con tasa 36.5 → amount 4.11 y bcvRateApplied 36.5". Spec front (Karma) de `expense-modal` que verifica que emite `amountCurrency: 'BS'`. Check manual: `amount ≈ montoBs / bcvRateApplied` en la respuesta.

### R-03 · Aritmética monetaria con `Prisma.Decimal` y redondeo explícito (F-05) — **PRERREQUISITO**
- **Fix:**
  1. Cambiar `resolveAmountUsd` a una firma `(amount: Prisma.Decimal | number, currency, vesPerUsd: Prisma.Decimal) => Prisma.Decimal` con `.toDecimalPlaces(2, Decimal.ROUND_HALF_UP)` en **un único** punto, al final.
  2. Para la calculadora: `costoUsd = montoUsd × (1 + comisión/100) ÷ tasaVenta`, redondeando solo al final. Documentar la regla en el spec.
  3. `create-expense.dto.ts` y `create-expense-with-receipt.dto.ts`: `@IsNumber({ maxDecimalPlaces: 2 })` y `@Max(999_999_999_999)` (cabe en `Decimal(14,2)`).
  4. El evento de auditoría (me.service.ts:1050-1053) debe registrar el valor ya redondeado.
- **Esfuerzo:** M · **Riesgo del fix:** diferencias de ±0.01 frente a gastos históricos (aceptable; no se recalculan).
- **Verificación:** `amount-currency.util.spec.ts` con casos de borde (`150/36.5 → 4.11`, `0.005 → 0.01`, comisión 3 % sobre 100 a tasa 40 → 2.58). `pnpm test -- --testPathPatterns amount` en verde.

### R-04 · Idempotencia en la creación de gastos (F-03) — **PRERREQUISITO**
- **Fix:**
  1. Frontend: el modal genera un `crypto.randomUUID()` al abrirse y lo envía como header `Idempotency-Key` (o en el campo `clientRequestId`). El botón "Aceptar" se deshabilita con un signal `submitting` mientras haya una petición en vuelo, incluida la consulta de tasa.
  2. Backend: añadir a `Expense` la columna `clientRequestId String?` con `@@unique([profileId, clientRequestId])`. Ante `P2002`, devolver el gasto existente (200) en lugar de crear otro. La migración la genera el agente y **la aplica el usuario**.
- **Esfuerzo:** M · **Riesgo del fix:** requiere migración. Los clientes viejos sin clave siguen funcionando (columna nullable).
- **Verificación:** e2e/supertest "dos POST con la misma clave → 1 fila y misma respuesta". Spec Karma "doble click en Aceptar → 1 llamada a `createExpense`".

### R-05 · Editar respeta la fecha de tasa original (F-02) — **AFECTA**
- **Fix:** en `updateExpenseFields` (me.service.ts:1751-1762) usar `row.paymentDate ? formatYmd(row.paymentDate) : formatYmdInCaracas()` para la tasa. Si el gasto se creó con la calculadora (método/tasa de venta guardados), recalcular con **sus** parámetros, no con la tasa de hoy. Aplicar lo mismo en `updateIncomeFields` (:1813-1824).
- **Esfuerzo:** S · **Riesgo del fix:** ninguno relevante (hoy el comportamiento es un bug).
- **Verificación:** spec "gasto con paymentDate 2026-10-10 → editar amount → `getVesPerUsdForCalendarDay` llamado con '2026-10-10'".

### R-06 · Volver determinista el test del ciclo de corte (F-08) — **PRERREQUISITO**
- **Fix:** en `active-budget-context.util.spec.ts:24-38`, pasar una fecha fija (`resolveActiveBudgetContext(pref, '2026-10-07')`) o usar `jest.useFakeTimers().setSystemTime(...)`, y derivar `legacyOct` del periodo calculado en vez de fijarlo a mano.
- **Esfuerzo:** S · **Verificación:** `pnpm test` en verde ejecutándolo con `TZ` y fecha del sistema distintas (p. ej. `jest --testPathPatterns active-budget` con `setSystemTime` en 2027-01-20).

### R-07 · Tests del módulo de tasas y del flujo de creación (F-07) — **PRERREQUISITO**
- **Fix:**
  1. `src/bcv/bcv-rate.service.spec.ts` con `HttpService`, `PrismaService` y `CacheService` mockeados. Casos: hit en PG, hit en Redis, live OK, live con timeout → fallback, histórico con fin de semana (on-or-after), día hábil sin dato (on-or-before), coalescing de concurrencia y la regresión de R-01.
  2. Contrato DolarAPI con fixtures JSON reales (oficial vivo, histórico y paralelo) en `src/bcv/__fixtures__/`.
  3. `me.service.spec.ts`: `createExpense` con BS, perfil ajeno → 400, categoría ajena → 400, y redondeo.
  4. Frontend: specs de `bcv-rate-cache.util`, `me-api.service` (con `HttpTestingController`) y `expense-modal`.
- **Esfuerzo:** M · **Verificación:** `pnpm test -- --coverage` con `bcv-rate.service.ts` ≥ 85 % líneas y ≥ 80 % ramas. `ng test --no-watch` en verde.

### R-08 · Subir `follow-redirects` (F-06) — **AFECTA**
- **Fix:** `pnpm update axios @nestjs/axios`. Si el transitivo no sube, añadir en `package.json` `"pnpm": { "overrides": { "follow-redirects": ">=1.16.1" } }` y luego `pnpm install` (lo ejecuta el usuario).
- **Esfuerzo:** S · **Riesgo del fix:** bajo (patch).
- **Verificación:** `pnpm audit --prod --audit-level=high` sale con exit 0, y el job CI "pnpm audit — bloquea high/critical" queda en verde.

### R-09 · SCA del frontend y hacer bloqueante el audit en CI (F-09) — **INDEPENDIENTE**
- **Fix:**
  1. Subir `@angular/*` a ≥ 20.3.34.
  2. Añadir overrides para `proxy-addr >=2.0.8` (o subir `express`) y para `@grpc/grpc-js >=1.13.6` (o subir `firebase`).
  3. En `frontend .github/workflows/ci.yml:56-59`, separar el audit en un paso bloqueante `--audit-level=high` y otro informativo `moderate`, igual que en el backend.
- **Esfuerzo:** S-M (el bump de Angular puede requerir `ng update`).
- **Verificación:** `pnpm audit --prod --audit-level=high` sale con exit 0, y `pnpm run build` + `ng test` en verde.

## Fase 3 — P3 (lote)

| ID | Fix | Esfuerzo | Verificación | Integración |
|---|---|---|---|---|
| F-10 | Validador `@IsCalendarYmd()` en `common/validators` (parsear y comparar el round-trip) para `paymentDate`/`referenceMonth`. `bcv.controller` responde 400 ante una fecha inválida. Validar el MIME del comprobante por magic bytes (`file-type`). | S | Spec DTO: `2026-02-31` → error de validación; e2e `POST /me/expenses` con `2026-13-01` → 400 (no 500) | AFECTA |
| F-11 | Capturar un payload real de `/v1/dolares/oficial` y `/v1/dolares/paralelo` como fixture. Usar `fechaActualizacion` para decidir el `rateDate` y guardar `fetchedAt`. Para paralelo, que cambia intradía, no congelar el valor del día: TTL corto (p. ej. 15-30 min) y guardar la instantánea en el propio gasto. | M | Spec con fixture: tasa publicada a las 16:00 para el día siguiente → no se guarda como la de hoy | AFECTA |
| F-12 | Tomar el histórico en un job programado (`@nestjs/schedule`), no en el request. Envolver las llamadas a DolarAPI con `withRetry` (2 intentos, backoff) y bajar el timeout a ~5 s. Si se ingiere en batch, usar `createMany({ skipDuplicates })`. | M | Spec: miss histórico no llama más de N upserts en el request; prueba de timeout → fallback < 6 s | AFECTA |
| F-13 | Extraer un `ExpenseAmountService` (o `resolveExpenseAmount()` en `common/utils`) que encapsule tasa → conversión → redondeo y que lo usen las 5 rutas y la calculadora. En el front, mover la vista previa Bs→USD a un util compartido por `expense-modal`/`income-modal`/calculadora. | M | jscpd frontend TS < 3 %; `rg "Number\(vesPerUsd" src/me` → 0 | AFECTA (hacerlo junto con R-02/R-03) |
| F-14 | Documentar que `X-API-KEY` es identificación de cliente, no un secreto. Las llamadas a DolarAPI (oficial/paralelo) deben ir **solo** por el backend; no añadir credenciales de terceros a `environment*.ts`. Añadir un spec de `ApiKeyGuard` (falta header, longitud distinta, OK). | S | `rg -n "dolarapi" src` en el frontend → 0; spec del guard en verde | AFECTA (diseño) |
| F-15 | Decidir el producto: ¿un colaborador puede crear gastos en un perfil compartido? Si sí, usar `ProfileAccessService` en `resolveProfileId`/`updateExpenseFields`. Si no, filtrar el selector de perfiles en el front. | S | Spec: colaborador → 201 o 403 explícito, según la decisión | AFECTA |

## Orden sugerido para desbloquear la integración

1. R-00a → R-06 → R-00b (entorno y gate en verde).
2. R-07 parte 1-2 (tests de `BcvRateService` y fixtures) → R-01.
3. R-03 → R-02 + F-13 (fuente única de conversión con Decimal).
4. R-04 (idempotencia; incluye la migración que **aplica el usuario**, junto con las columnas nuevas de la feature: `paymentMethod`, `commissionPct`, `sellingRate`, `rateSource`, `amountOriginal`, `currencyOriginal`, `bcvEquivalentUsd`).
5. R-05, R-08, y luego la construcción de la calculadora.
6. R-09 y el resto de P3 en paralelo.

## Seguimiento

| Ítem | Owner | Verificación | Estado |
|---|---|---|---|
| R-00a node_modules | usuario | `pnpm exec eslint src/bcv` corre | pendiente |
| R-00b hooks | dev | `pre-commit run --all-files` | pendiente |
| R-01 caché fallback | dev | spec de regresión en verde | pendiente |
| R-02 conversión en backend | dev | spec BS → amount/bcvRateApplied coherentes | pendiente |
| R-03 Decimal + redondeo | dev | spec de bordes de redondeo | pendiente |
| R-04 idempotencia | dev + usuario (migración) | e2e misma clave → 1 fila | pendiente |
| R-05 tasa al editar | dev | spec con paymentDate | pendiente |
| R-06 test determinista | dev | `pnpm test` en verde | pendiente |
| R-07 tests tasas/creación | dev | cobertura bcv ≥ 85 % | pendiente |
| R-08 follow-redirects | dev + usuario (install) | `pnpm audit --prod --audit-level=high` exit 0 | pendiente |
| R-09 SCA frontend | dev + usuario (install) | `pnpm audit --prod --audit-level=high` exit 0 | pendiente |
