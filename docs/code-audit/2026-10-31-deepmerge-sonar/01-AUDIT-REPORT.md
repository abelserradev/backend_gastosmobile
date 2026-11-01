# Code and security audit — deepmerge + Sonar posture

**Date:** 2026-10-31 · **Stack:** NestJS · **Commit:** `develop` (post-sync deps)  
**Tools:** `detect_stack.py`, `pnpm audit`, `pnpm why deepmerge`, `npm view deepmerge`, ESLint CI, Jest+cov, `dep_graph.py`, `arch_signals.py`, Dependabot API alert #99

## Executive summary

La alerta Dependabot **#99 (`deepmerge@4.3.1`, GHSA-gcqx-w48m-w2h4)** es **severidad low**, **alcance development/transitive** (Jest, `@nestjs/cli`) y **sin versión parcheada en npm** (`first_patched_version: null`). No hay import de `deepmerge` en `src/`. El riesgo en runtime de producción es **negligible**; el repo ya alinea `pnpm audit` y OSV con ignore documentado. Prioridad real para calidad: **`MeService` (~1740 LOC)** y acoplamiento `me` ↔ `common/utils` (SonarCloud + extracción guiada por `openspec/changes/payment-comparison`).

## Scorecard (8 dimensiones)

| # | Dimensión | Veredicto | Evidencia |
|---|-----------|-----------|-----------|
| 1 | DRY | 🟢 | [TOOL: jscpd histórico ~0,77%] guards compartidos vía `profile-route-auth.util.ts` |
| 2 | SOLID | 🟡 | [METRIC: dep_graph] ciclo módulos `me`↔`common/utils`↔`audit`↔…; god-module `src/me` 2634 LOC |
| 3 | Unit tests | 🟢 | [TOOL: jest] 228 tests OK |
| 4 | Integration | 🟡 | e2e configurado; no ejecutado hoy |
| 5 | SAST | 🟢 (baseline) | Semgrep 0 findings (2026-10-28); ESLint CI clean hoy |
| 6 | SCA | 🟡 | [TOOL: `analysis/sca-audit-2026-10-31.txt`] 0 high; deepmerge ignorado; 2 moderate dev (`glob`, `minimatch`) |
| 7 | Secrets | 🟢 | gitleaks en pre-commit [GAP: gaps.md] |
| 8 | Containers | ⚪ | Hadolint/Trivy no ejecutados |

## Alerta #99 — deepmerge (veredicto)

| Campo | Valor |
|-------|--------|
| GHSA | GHSA-gcqx-w48m-w2h4 / CVE-2026-93753 |
| Severidad GitHub | **low** (dev transitive) |
| Versión lock | 4.3.1 [TOOL: `pnpm why deepmerge`] |
| Parche npm | **No existe** 4.3.2+ [TOOL: `npm view deepmerge versions`] |
| Runtime | [VERIFY: grep `src/`] 0 referencias a `deepmerge` |
| Mitigación repo | [VERIFY: `pnpm-workspace.yaml` auditConfig ignore] + [VERIFY: `osv-scanner.toml` IgnoredVulns] |

**Conclusión Gentle AI:** no es P1; **riesgo aceptado documentado** hasta publicación de parche. Acción: dismiss Dependabot #99 + vigilar npm.

## Strengths

- ValidationPipe global whitelist/forbidNonWhitelisted. [VERIFY: `src/main.ts:41-46`]
- Overrides SCA centralizados y comentados (`pnpm-workspace.yaml`, `docs/ci-seguridad-github.md`).
- CI: audit high/critical, security-audit (OSV + Semgrep), SonarCloud workflow listo (falta secret).
- Spec-anchored: `openspec/changes/payment-comparison/` define dominio antes de más lógica en `MeService`.

## Findings (severidad)

### P1 — Ninguno en código aplicación por deepmerge

Prototype pollution en `mergeObject()` no es alcanzable desde el binario Nest desplegado.

### P2 — Complejidad / mantenibilidad (Sonar + arquitectura)

| ID | Hallazgo | Evidencia |
|----|----------|-----------|
| ARCH-1 | `me.service.ts` ~1740 LOC, hotspot #1 | [METRIC: arch_signals] score 480; [VERIFY: line count] |
| ARCH-2 | Ciclo de imports entre módulos `me`, `auth`, `audit`, `bcv`, `email`, `common/utils` | [METRIC: dep_graph.md] SCC |
| ARCH-3 | `telegram-mutation.service.ts` 0% cobertura | [TOOL: test:cov] líneas 1-854 sin cubrir |
| SONAR-1 | SonarCloud omitido si falta `SONAR_TOKEN` | [VERIFY: `sonarcloud.yml` + `docs/ci-sonarcloud.md`] |
| ESLINT-1 | Sin `eslint-plugin-sonarjs` (complejidad cognitiva en pre-commit) | [GAP: `eslint.config.mjs`] |

### P3 — SCA dev residual

| ID | Hallazgo | Evidencia |
|----|----------|-----------|
| SCA-2 | `glob` / `minimatch` moderate vía Jest/ESLint CLI | [TOOL: sca-audit-2026-10-31.txt] |

## Discarded

| Item | Motivo |
|------|--------|
| deepmerge como explotable en prod | Dev-only, sin import en `src/` |
| Microservicios para bajar complejidad | [arch-patterns] Modular monolith + extraer servicios de dominio dentro de `me` |

## Graph-first / SDD (estado)

- **CodeGraph / lat.md:** no indexados — exploración vía grep/arch-scripts.
- **SDD:** usar `openspec/changes/payment-comparison/tasks.md` como cola de implementación antes de refactor grande en `MeService`.
