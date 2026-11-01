# Remediation plan — deepmerge #99 + Sonar/complejidad

## Phase 0 — Guardrails (esta semana)

### R-00 · Cerrar alerta Dependabot #99 (sin mentir al SCA)

- **Fix:** Dismiss en GitHub con `risk_accepted` y enlace a este informe; mantener ignore en `pnpm-workspace.yaml` + `osv-scanner.toml`.
- **Verification:** Alert #99 `state=dismissed`; `pnpm audit --audit-level=high` sigue en verde.

### R-01 · Activar SonarCloud

- **Fix:** Configurar secret `SONAR_TOKEN` ([docs/ci-sonarcloud.md](../../ci-sonarcloud.md)).
- **Verification:** Workflow SonarCloud verde; revisar Issues → Cognitive Complexity en `me.service.ts`.

### R-02 · ESLint sonarjs (local ≈ Sonar rules)

- **Fix:** Añadir `eslint-plugin-sonarjs`: `sonarjs/cognitive-complexity: ['warn', 15]` y `complexity: ['warn', 10]` en `eslint.config.mjs`; subir a `error` cuando `MeService` esté partido.
- **Effort:** S · **Verification:** `pnpm lint:ci` sin nuevos errors (warnings permitidos fase 1).

## Phase 1 — deepmerge (watch)

| Trigger | Acción | Verification |
|---------|--------|--------------|
| `deepmerge@4.3.2+` en npm | `overrides: deepmerge: '>=4.3.2'` + lockfile | `pnpm audit` sin GHSA-gcqx; reabrir si Dependabot re-alerta |

## Phase 2 — Arquitectura (modular monolith + hexagonal lite)

**Recomendación:** Modular Monolith; interior **Hexagonal** en dominio `me` — no extraer microservicio.

### R-03 · Partir `MeService` (seam confirmado)

- **Evidencia seam:** [METRIC: arch_signals] co-change `me.service.ts` ↔ DTOs ↔ `active-budget-context.util.ts`.
- **Fix:** Extraer servicios cohesivos alineados a OpenSpec:
  - `ExpenseCommandService` / `IncomeCommandService` (mutaciones)
  - `PaymentComparisonService` (spec `payment-comparison`)
  - Mantener `MeService` como fachada delgada
- **Effort:** L · **Verification:** `dep_graph` sin ciclo `me`↔`common/utils`; Sonar complexity ↓ en archivo principal.

### R-04 · Romper ciclo `common/utils` ↔ `me`

- **Fix:** Mover reglas de presupuesto activo a `src/me/domain/` o `shared-kernel` sin importar `MeService` desde utils.
- **Verification:** [METRIC: dep_graph.py] cycles 1→0.

### R-05 · Cobertura Telegram mutation

- **Fix:** Tests mínimos en flujos críticos de borrado/confirmación (`telegram-mutation.service.ts`).
- **Verification:** `test:cov` > 40% en módulo telegram.

## Phase 3 — P3 dev SCA

- Overrides `glob>=14.0.2`, `minimatch>=11.0.1` cuando Jest/ESLint lo permitan sin romper lockfile.

## Follow-up

| Item | Owner | Status |
|------|-------|--------|
| Dismiss #99 | agente / tech lead | pendiente → ejecutar |
| SONAR_TOKEN | DevOps | pendiente |
| MeService split | feature owner + OpenSpec tasks | pendiente |
