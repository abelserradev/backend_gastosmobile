# Auditoría acotada + code review — integración calculadora de métodos de pago (exchange)

**Fecha:** 2026-10-21 · **Rama:** `develop` en ambos repos
**Commits auditados:** backend `eb15af7` · frontend `7f4c2f0`
**Stack:** NestJS 11 + Prisma 7 + Jest (backend) · Angular 20 + Karma (frontend)

**Alcance (no es una auditoría completa del repo):** el código que tocará la feature *"calculadora de método de pago (USD efectivo / USD electrónico con % de comisión / Bs) con tasas BCV oficial y paralelo de DolarAPI → creación automática del gasto (pendiente, monto = costo real en USD a la tasa de venta del usuario incl. comisión, equivalente BCV como referencia)"*.

- Backend: `src/bcv/**`, `src/me/**` (endpoints de gastos, `createExpense`, `createExpenseWithReceipt`, `updateExpenseFields`, DTOs, `me.mappers.ts`), `src/common/utils/**`, `src/common/cache/**`, `src/common/guards/api-key.guard.ts`, `src/auth/jwt-auth.guard.ts`, `prisma/schema.prisma` (`Expense`, `BcVOfficialRate`, `UserPreference`).
- Frontend: `core/me-api.service.ts`, `core/bcv-rate-cache.util.ts`, `core/http.interceptors.ts`, `pages/expenses/expense-modal.component.*`, `expense-type-selector.component.*`, `expenses-page.component.ts` (flujo de creación).

**Herramientas ejecutadas (salida cruda en `analysis/`):**

| Herramienta | Versión | Repo | Archivo |
|---|---|---|---|
| ESLint (config del repo, type-aware) | 10.13.0 + typescript-eslint 8.72.0 | backend | `backend-eslint.txt` |
| ESLint complementario sonarjs + security | sonarjs 4.2.2 · security 4.2.0 | backend | `backend-eslint-sonarjs-security.txt` |
| `tsc --noEmit` | 5.9.3 | backend | `backend-tsc.txt` |
| Jest + cobertura (specs en alcance, sin BD) | 30.5.2 | backend | `backend-jest.txt`, `spec-coverage-inventory.txt` |
| `pnpm audit --prod` | pnpm 11.3.0 | ambos | `backend-pnpm-audit.txt`, `frontend-pnpm-audit.txt` |
| jscpd `--min-tokens 50` | 4.3.0 | ambos | `backend-jscpd.txt`, `frontend-jscpd.txt` |
| Repro de fechas y float (node) | node 24.16.0 | backend | `date-and-float-repro.txt` |
| Búsqueda manual de secretos (rg) | — | ambos | `secrets-manual-scan.txt` |

**No ejecutadas:**
- **gitleaks**: no está instalado en la máquina → dimensión 7 "no evaluada (tooling)"; solo hay un escaneo manual complementario.
- **ESLint / `ng test` del frontend**: el repo no tiene `node_modules`, y la regla de la auditoría prohíbe instalar → "no evaluado (tooling)" (`frontend-eslint-ngtest-not-evaluated.txt`).
- **Semgrep / Trivy / Hadolint**: fuera del alcance acordado.

> **Nota de entorno:** los `node_modules` del backend son *junctions* de pnpm que apuntan a la ruta antigua `buildforge\backend_gastosmobile` (el repo se movió a `buildforge\gastos\`). Por eso `pnpm exec` intenta un `pnpm install` implícito (se abortó y no cambió nada). Para no tocar el repo, ESLint, tsc y Jest se ejecutaron con un toolchain temporal en `%TEMP%\gastos-audit-tools`, con las mismas versiones del `package.json` y usando la config de ESLint/Jest del repo (solo se cambiaron las rutas de resolución). El cliente Prisma se generó **solo** en esa carpeta temporal (`prisma generate` no se conecta a la BD).

## Resumen ejecutivo

El código en alcance está limpio a nivel de lint (0 errores y 0 warnings con reglas type-aware), valida DTOs con whitelist global y comprueba la propiedad de perfil y categoría al crear gastos. **No hay hallazgos P1.** Sí hay 9 P2 que importan antes de añadir la calculadora:

- **Lo más grave:** tras un fallo puntual de DolarAPI, la tasa BCV del día anterior queda cacheada hasta 26 h como si fuera la del día y marcada como "no stale" (F-01).
- **Moneda sin una sola fuente de verdad:** el frontend convierte Bs→USD con su propia tasa (posiblemente de otra fecha, sacada de `localStorage`), mientras el backend guarda otra tasa como `bcvRateApplied` (F-04). Todo el cálculo se hace en `number` sin redondeo explícito (F-05).
- **Creación de gastos:** no es idempotente (F-03), y al editar se re-tasa con la tasa de hoy (F-02).
- **Cobertura:** el módulo de tasas tiene 8 % de líneas cubiertas, y un test "bomba de tiempo" rompe hoy `pnpm test` (F-07, F-08).

Primer paso del plan: reparar el entorno (`node_modules`) y el test roto, y luego centralizar la conversión de moneda en el backend con `Prisma.Decimal` e idempotencia antes de construir la calculadora.

## Scorecard (restringido al alcance)

| # | Dimensión | Veredicto | Evidencia |
|---|-----------|-----------|-----------|
| 1 | DRY | 🟡 | [TOOL: jscpd backend → 2.47 % (4 clones, DTO espejo)] · [TOOL: jscpd frontend → 5.26 % total, TS 2.76 %, markup 13.55 %; `expense-modal` ↔ `income-modal` clonan la vista previa Bs→USD] · [VERIFY: me.service.ts:1020-1029, 1076-1088, 1704-1712, 1752-1762, 1813-1821 → mismo patrón tasa+`Number()`+`resolveAmountUsd` 5 veces] |
| 2 | SOLID | 🟡 | S🔴 [TOOL: max-lines → me.service.ts 1638 líneas] · O🟡 [VERIFY: amount-currency.util.ts:8-15 bifurca solo `'USD' \| 'BS'`; añadir métodos de pago hará crecer el if] · L🟢 · I🟢 · D🟡 [VERIFY: expense-modal.component.ts:121,162 calcula moneda en el componente] |
| 3 | Unit tests | 🔴 | [TOOL: jest → 58/59 en verde, 1 falla (active-budget-context.util.spec.ts:37)] · [TOOL: cobertura → bcv-rate.service.ts 8.26 % líneas / 0 % funciones; me.service.ts 15.9 %; me.controller.ts, api-key.guard.ts, jwt-auth.guard.ts 0 %] · [VERIFY: frontend 0/6 unidades en alcance con spec] |
| 4 | Integration tests | 🔴 | [VERIFY: test/app.e2e-spec.ts:24-25 → solo `GET /bcv/oficial-por-dia` → 401] · 0 tests de contrato DolarAPI (timeout, 5xx, payload malformado) · 0 e2e de `POST /me/expenses` |
| 5 | SAST | 🟡 | [TOOL: eslint type-aware → 47 archivos, 0/0] · [TOOL: eslint-plugin-security → 2 avisos, ambos falsos positivos] · hallazgos manuales de validación de entrada (F-10) y API key embebida en el bundle (F-14) · Semgrep no ejecutado |
| 6 | SCA | 🔴 | [TOOL: pnpm audit --prod backend → 2 high `follow-redirects` vía `@nestjs/axios>axios` (cliente de DolarAPI)] · [TOOL: pnpm audit --prod frontend → 1 critical `proxy-addr`, 1 high `@grpc/grpc-js`, 2 moderate (incl. `@angular/common` XSRF), 1 low] |
| 7 | Secrets | ⚪ no evaluado (tooling) | gitleaks no instalado. Complemento: [TOOL: rg patrones de claves → 0 en el código en alcance; solo placeholders `*.example.ts`] · [TOOL: git check-ignore → `api-key.ts` y `firebase-api-key.ts` ignorados; `.env` ignorado; solo `.env.example` versionado] |
| 8 | Containers | fuera de alcance | Existe `Dockerfile` en el backend, pero la feature no lo toca |

## Fortalezas

1. **Validación global estricta:** `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` impide la asignación masiva en todos los DTOs de gastos [VERIFY: src/main.ts:42-44].
2. **Sin IDOR en la creación ni en la edición:** `resolveCategoryId` filtra por `userId` [VERIFY: me.service.ts:1436-1438]. `resolveProfileId` exige que el perfil sea del usuario [VERIFY: me.service.ts:1585-1590]. `updateExpenseFields` y `patchExpense` buscan con `profile: { userId }` [VERIFY: me.service.ts:1741-1743, 1152-1153].
3. **Trazabilidad de tasa ya modelada:** cada gasto guarda `bcvRateApplied` (Decimal 14,6) y `bcvRateDate`, y el histórico BCV es durable en Postgres (Decimal 18,6) [VERIFY: prisma/schema.prisma:245-252, 273-276]. Es la base natural para el "equivalente BCV como referencia".
4. **Resiliencia de tasas bien pensada:** coalescing de peticiones concurrentes por día [VERIFY: bcv-rate.service.ts:36-43, 81-94], fallback a la última tasa conocida con bandera `usedFallback` [VERIFY: bcv-rate.service.ts:101-128], y caché Redis *fail-open* que no rompe el flujo si Redis cae [VERIFY: cache.service.ts:73-110].
5. **Higiene de lint y gates:** 0 errores y 0 warnings type-aware en 47 archivos [TOOL: eslint]. Hay gitleaks + ESLint + Prettier en pre-commit, y en CI `pnpm audit --audit-level=high` es bloqueante con `harden-runner` [VERIFY: .pre-commit-config.yaml:10-39; .github/workflows/ci.yml:28, 49-50].
6. **Comparación de la API key en tiempo constante** (`timingSafeEqual`) [VERIFY: api-key.guard.ts:36-42], y `amount-currency.util.ts` con 100 % de cobertura [TOOL: jest coverage].

## Hallazgos (ordenados por riesgo)

No hay hallazgos **P1**: no se encontró ningún secreto real, inyección ni IDOR en el alcance.

### P2-01 (F-01) — La tasa de respaldo queda cacheada como "tasa del día" y "no stale" hasta 26 h
- **Dimensión:** resiliencia / correctitud monetaria.
- **Evidencia:**
  - [VERIFY: bcv-rate.service.ts:145-146] Si falla `fetchOfficialLive` para hoy, se llama a `fallbackToLastKnownRate(ymd)`.
  - [VERIFY: bcv-rate.service.ts:205-209] Ese método escribe la fila **más reciente** (p. ej. la de ayer) en la clave `bcv:day:<hoy>` y en `bcv:day:latest` con TTL de 26 h (`TTL_TODAY_MS`, :29, :276-279).
  - [VERIFY: bcv-rate.service.ts:65-79] En las peticiones siguientes no hay fila en PG para hoy, la clave de Redis acierta y se devuelve `usedFallback: false`.
- **Impacto:** un corte de segundos en DolarAPI deja todos los gastos y previsualizaciones del día con la tasa de ayer, sin aviso de "stale" (`bcv.controller.ts:24` devuelve `stale: false`), y nunca se reintenta la tasa en vivo hasta que expira el TTL. La calculadora heredaría este error en el equivalente BCV.
- **Integración:** **bloquea** → R-01.

### P2-02 (F-04) — Conversión Bs→USD duplicada en el cliente con una tasa distinta a la que guarda el servidor
- **Dimensión:** correctitud monetaria / contrato API.
- **Evidencia:**
  - [VERIFY: expense-modal.component.ts:162-171] El modal calcula `usd = bs / r.vesPerUsd` y emite USD.
  - [VERIFY: me-api.service.ts:332-340] `createExpense` no expone `amountCurrency`, así que el backend nunca recibe `'BS'`.
  - [VERIFY: me-api.service.ts:409-418 y bcv-rate-cache.util.ts:55-63] Si la petición de tasa falla, se usa la última tasa de `localStorage` **de cualquier fecha** (`readBcvRateCacheOrLatest`), y el componente ignora `stale`/`fromLocalCache`.
  - [VERIFY: me.service.ts:1020-1040] El backend vuelve a pedir la tasa de `paymentDate` y la guarda en `bcvRateApplied`, aunque el `amount` se calculó con otra.
- **Impacto:** `amount` y `bcvRateApplied`/`bcvRateDate` del mismo gasto pueden no cuadrar (un monto en Bs ÷ tasa guardada ≠ amount). Al añadir oficial + paralelo + comisión, este patrón multiplicaría las fuentes de verdad.
- **Integración:** **bloquea** → R-02.

### P2-03 (F-05) — Cálculos de dinero en `number` sin redondeo explícito; DTOs de monto inconsistentes
- **Dimensión:** correctitud monetaria.
- **Evidencia:**
  - [VERIFY: me.service.ts:1024-1029] `Number(vesPerUsd.toString())` + `amount / vesPerUsd` en float.
  - [VERIFY: amount-currency.util.ts:13] Sin redondeo; queda implícito al `Decimal(14,2)` de Postgres [VERIFY: schema.prisma:264].
  - [TOOL: date-and-float-repro.txt → `150/36.5 = 4.109589041095891`].
  - [VERIFY: me.service.ts:1050-1053] El evento de auditoría guarda el `amountUsd` sin redondear, distinto al valor persistido.
  - [VERIFY: create-expense.dto.ts:26-29] `@IsNumber()` sin `maxDecimalPlaces` ni `@Max`, frente a [VERIFY: update-expense-fields.dto.ts:18-20] `maxDecimalPlaces: 2`.
- **Impacto:** diferencias de centavos entre la UI, la auditoría y la BD. La fórmula de la feature (monto × (1 + comisión%) ÷ tasa de venta) acumula error y no tiene una regla de redondeo definida (¿half-up?, ¿en qué paso?).
- **Integración:** **bloquea** → R-03.

### P2-04 (F-03) — La creación de gastos no es idempotente (doble envío = gasto duplicado)
- **Dimensión:** correctitud / UX de dinero.
- **Evidencia:**
  - [VERIFY: expense-modal.component.html:235-240] El botón submit nunca se deshabilita.
  - [VERIFY: expense-modal.component.ts:162-178] En modo Bs el modal sigue abierto mientras espera la tasa, así que un segundo click dispara otra petición.
  - [VERIFY: expenses-page.component.ts:603-637] No hay estado "en curso".
  - [VERIFY: me.service.ts:1030] `prisma.expense.create` sin clave de idempotencia.
  - [VERIFY: schema.prisma:255-287] `Expense` no tiene una columna única de deduplicación.
- **Impacto:** la feature crea el gasto **automáticamente** al elegir el método. Un doble tap, un reintento de red o un *replay* del interceptor generan gastos duplicados que inflan el presupuesto.
- **Integración:** **bloquea** → R-04.

### P2-05 (F-02) — Editar el monto re-tasa con la tasa de HOY, no con la de `paymentDate`
- **Dimensión:** regresión de comportamiento.
- **Evidencia:**
  - [VERIFY: me.service.ts:1751-1762] `updateExpenseFields` usa `formatYmdInCaracas()` y sobrescribe `bcvRateApplied`/`bcvRateDate`, ignorando `row.paymentDate`.
  - Mismo patrón en ingresos [VERIFY: me.service.ts:1813-1824].
  - Sin test [TOOL: cobertura → me.service.ts:1752-1762 no cubiertas].
- **Impacto:** corregir un typo en el monto de un gasto de la semana pasada cambia su tasa y su fecha de tasa. En la feature, editar un gasto creado por la calculadora destruiría el equivalente BCV de referencia.
- **Integración:** **afecta** (el flujo de edición del gasto auto-creado) → R-05.

### P2-06 (F-08) — Test "bomba de tiempo" rompe hoy `pnpm test` (pre-push y CI)
- **Dimensión:** tests (determinismo).
- **Evidencia:**
  - [TOOL: jest → `active-budget-context.util.spec.ts:37` falla: `Expected >= 1792108800000, Received 1790812800000`].
  - [VERIFY: active-budget-context.util.spec.ts:24-38] Usa el reloj real (`resolveActiveBudgetContext(pref)` sin fecha) y fija `2026-10-01`, por lo que falla desde el 16-oct-2026.
  - Rompe [VERIFY: .pre-commit-config.yaml:39] el pre-push (`pnpm test`) y [VERIFY: .github/workflows/ci.yml:60] CI.
- **Impacto:** el gate de tests está en rojo para todos. Invita a usar `--no-verify` y oculta regresiones de la integración.
- **Integración:** **bloquea** (no se puede validar la feature con la suite en rojo) → R-06.

### P2-07 (F-07) — El módulo de tasas y el flujo de creación casi no tienen tests
- **Dimensión:** tests unitarios / integración.
- **Evidencia:**
  - [TOOL: cobertura → `bcv-rate.service.ts` 8.26 % líneas, 14.06 % ramas, 0 % funciones; `bcv.controller.ts` 0 %; `me.controller.ts` 0 %; `api-key.guard.ts` 0 %; `jwt-auth.guard.ts` 0 %].
  - [VERIFY: me.service.reference-month.spec.ts:72,109] `createExpense` solo tiene 2 tests (periodo de referencia); ninguno de conversión Bs, redondeo ni propiedad.
  - [VERIFY: spec-coverage-inventory.txt → frontend 0/6 unidades en alcance con spec].
  - Umbral del skill para módulos de dinero: 85 % + ramas.
- **Impacto:** cualquier cambio en tasas (añadir paralelo, arreglar F-01) se hace sin red de seguridad. Los fallbacks (timeout, 5xx, fin de semana) no están probados.
- **Integración:** **bloquea** (antes de extender `BcvRateService`) → R-07.

### P2-08 (F-06) — SCA backend: 2 CVE high en el cliente HTTP de DolarAPI; CI bloqueante en rojo
- **Dimensión:** SCA.
- **Evidencia:**
  - [TOOL: pnpm audit --prod → `follow-redirects >=1.16.0 <1.16.1` GHSA-q3jh-wrc6-jgq8 y GHSA-8r9p-f939-6h3c, ruta `.>@nestjs/axios>axios>follow-redirects`].
  - [VERIFY: .github/workflows/ci.yml:49-50] Bloquea con high.
- **Alcanzabilidad:** baja hoy, porque `BcvModule` solo envía `Accept` [VERIFY: bcv.module.ts:16-18]. Aun así es exactamente el cliente que usará la integración de paralelo.
- **Integración:** **afecta** (la feature amplía el uso de ese cliente) → R-08.

### P2-09 (F-09) — SCA frontend: 1 critical / 1 high y audit no bloqueante en CI
- **Dimensión:** SCA.
- **Evidencia:**
  - [TOOL: pnpm audit --prod → critical `proxy-addr <2.0.8` (vía `express`), high `@grpc/grpc-js <1.13.6` (vía firebase), moderate `@angular/common <20.3.34` XSRF token leakage].
  - [VERIFY: frontend .github/workflows/ci.yml:56-59] `continue-on-error: true`.
- **Alcanzabilidad:** la XSRF de `@angular/common` afecta al `HttpClient` que usa `me-api.service.ts`. `proxy-addr` solo importa si el server SSR de `express` confía en subredes proxy (no verificado: [GAP]).
- **Integración:** no bloquea; **afecta** la superficie del cliente → R-09.

### P3 — calidad y riesgos menores

| ID | Hallazgo | Evidencia | Integración |
|---|---|---|---|
| F-10 | **Huecos de validación de entrada en la creación.** `paymentDate` solo valida la forma con regex. `2026-02-31` se convierte en silencio en `2026-03-03`, y `2026-13-01` da `Invalid Date` → 500 al consultar Prisma. `amount` sin `@Max` → overflow de `Decimal(14,2)` → 500. `/bcv/oficial-por-dia` reemplaza en silencio una fecha inválida por hoy. El MIME del comprobante se toma del header del cliente, sin magic bytes. | [TOOL: date-and-float-repro.txt] · [VERIFY: create-expense.dto.ts:55-58; caracas-date.ts:25-27; bcv.controller.ts:16-17; me.controller.ts:156-160] | Afecta (la fecha define la tasa) |
| F-11 | **La tasa en vivo ignora `fechaActualizacion`.** Se persiste bajo el día de Caracas del primer request, y esa fila queda congelada todo el día. Si la primera consulta ocurre después de que el BCV publica la tasa "fecha valor" del día siguiente, esa tasa quedaría guardada como la de hoy. Hay que confirmarlo contra un payload real de DolarAPI. | [VERIFY: bcv-rate.service.ts:139-144, 65-73; dolar-api.types.ts:9] · [GAP: sin fixture de respuesta real] | Afecta (aplica igual a paralelo) |
| F-12 | **Un miss histórico ingiere TODO el histórico de DolarAPI** con upserts secuenciales dentro del request (latencia O(n) queries). El cliente tiene timeout de 15 s sin reintentos, aunque existe `retry.util.ts` (0 % cobertura). | [VERIFY: bcv-rate.service.ts:150-152, 283-299; bcv.module.ts:17; retry.util.ts:4-26] | Afecta (latencia de la calculadora) |
| F-13 | **DRY/SRP en el cálculo de montos.** Patrón tasa + `Number()` + `resolveAmountUsd` repetido 5 veces. `MeService` tiene 1638 líneas. La vista previa Bs→USD está clonada entre `expense-modal` e `income-modal`. La calculadora sería la 3ª copia (regla de tres cumplida). | [VERIFY: me.service.ts:1020-1029, 1076-1088, 1704-1712, 1752-1762, 1813-1821] · [TOOL: eslint max-lines → 1638] · [TOOL: jscpd → expense-modal.component.ts:115-134 ↔ income-modal.component.ts:90-109] | Afecta (seam recomendado) |
| F-14 | **`X-API-KEY` va embebida en el bundle del SPA,** así que no es un secreto: solo identifica al cliente y no puede tratarse como autenticación. Riesgo para la feature: no añadir otras credenciales de terceros a `environment*.ts` ni llamar a DolarAPI desde el front con claves. | [VERIFY: environment.prod.ts:1,7; http.interceptors.ts:72-90; api-key.guard.ts:22-44] | Afecta (diseño) |
| F-15 | **Autorización de perfiles inconsistente.** El listado incluye perfiles compartidos (`accessibleProfileIdsForUser`), pero crear o editar exige ser dueño, así que un colaborador ve gastos que no puede crear (400 "Perfil inválido"). No es una fuga: es más restrictivo. | [VERIFY: me.service.ts:159-161, 960-964 vs 1584-1590, 1741-1743] | Afecta (decidir antes de auto-crear en perfiles compartidos) |

## Gaps específicos de la integración (no son defectos, pero son prerrequisitos)

- [GAP: schema.prisma:255-287] `Expense` no tiene columnas para `paymentMethod`, `commissionPct`, `sellingRate`/`rateSource` (oficial | paralelo), `amountOriginal`/`currencyOriginal`, equivalente BCV ni clave de idempotencia. Hará falta una migración, que **debe ejecutar el usuario** (política: el agente no escribe en BD).
- [GAP: dolar-api.types.ts:1-19; bcv-rate.service.ts:335, 353] Solo se consume `/v1/dolares/oficial` y el histórico oficial. No hay tipo, caché ni persistencia para paralelo.
- [GAP: schema.prisma:120-141] `UserPreference` no guarda la "tasa de venta" del usuario ni la comisión por defecto del USD electrónico.

## Hallazgos descartados

| Reporte | Motivo |
|---|---|
| `security/detect-object-injection` api-key.guard.ts:26 | Falso positivo: el índice es la constante `API_KEY_HEADER`, no entrada del usuario |
| `security/detect-object-injection` retry.util.ts:22 | Falso positivo: índice numérico de un array interno |
| `max-lines` bcv-rate.service.ts (330) | Servicio cohesivo (una entidad); ligeramente sobre el umbral; no amerita dividirlo ahora |
| `sonarjs/cognitive-complexity` 22 en `getBudgetPeriodForCutoffDay` (caracas-date.ts:93) | Fuera de la ruta de la feature (ciclo presupuestario); ya cubierto al 90.76 % |
| Complejidad de `updatePreferences` / `mapPreferencesToResponse` (me.service.ts:380, 1311) | Fuera de la ruta de creación de gastos |
| jscpd create-expense ↔ create-income DTO, update-expense ↔ update-income DTO | Duplicación legítima de DTOs espejo (desacople intencional) |
| jscpd profile-access.guard ↔ profile-owner.guard | Fuera de la ruta; solo 2 ocurrencias (no se cumple la regla de tres) |
| tsc TS2352 en `src/ocr/services/google-vision-quota.service.spec.ts` | Fuera de alcance (OCR) |
| `uuid` moderate (frontend, vía `@capacitor/cli>xcode`) | Herramienta de build nativa, no llega al runtime del bundle |
| `@grpc/grpc-js` low (frontend) | Severidad baja; se arregla con el mismo bump que el high (R-09) |
| IDOR en `categoryId`/`profileId` al crear | Verificado que no existe (ver Fortaleza 2) |
| `/bcv/oficial-por-dia` sin auth | Cubierto por el `JwtAuthGuard` global [VERIFY: app.module.ts:65] y por el e2e 401 [VERIFY: test/app.e2e-spec.ts:24-25] |
| Overflow de `bcvRateApplied Decimal(14,6)` vs `BcVOfficialRate Decimal(18,6)` | Admite hasta ~99 999 999 Bs/USD; sin riesgo a la magnitud actual. Revisar solo si hay reconversión |
| Redis caído rompe el flujo | Verificado *fail-open* en get/set/del [VERIFY: cache.service.ts:73-122] |
