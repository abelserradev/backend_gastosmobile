# Code and security audit — backend_gastosmobile

**Date:** 2026-10-31 · **Stack:** NestJS (pnpm) · **Audited commit:** `8c67cf9` (`develop`)  
**Tools executed:** `detect_stack.py`, `pnpm audit`, `tsc --noEmit`, `jest`, análisis previos (`jscpd`, Semgrep en `analysis/`)  
**Not executed (tooling):** Gitleaks en esta pasada, Hadolint/Trivy imagen, jscpd/Semgrep re-run hoy

## Executive summary

El backend mantiene buenas defensas (ValidationPipe global, CI con audit high, overrides pnpm, pre-commit con gitleaks). En `develop` aparece un **HIGH nuevo en `joi@18.2.9`** (dependencia directa de validación de env) que conviene cerrar antes del próximo deploy. Los PR abiertos **#232** (Prisma prod) y **#234** (dev-deps) pasan CI en GitHub, no introducen regresiones de código y se **aprueban**; el parche de Prisma en #232 es deseable aunque `main` aún arrastra overrides más débiles que `develop` en `follow-redirects`.

## Scorecard

| # | Dimension | Verdict | Evidence |
|---|-----------|---------|----------|
| 1 | DRY | 🟢 | [TOOL: jscpd → `analysis/jscpd-report.json`] ~0,77% líneas duplicadas |
| 2 | SOLID | 🟢 (muestra) | [VERIFY: `src/main.ts`] ValidationPipe whitelist + forbidNonWhitelisted |
| 3 | Unit tests | 🟢 | [TOOL: jest → `analysis/jest-2026-10-31.txt`] 29 suites, 228 tests OK |
| 4 | Integration | 🟡 | e2e configurado; no ejecutado en esta pasada |
| 5 | SAST | 🟢 (baseline) | [TOOL: `analysis/semgrep-summary.txt`] 0 findings (2026-10-28) |
| 6 | SCA | 🟡 | [TOOL: `analysis/pnpm-audit-2026-10-31.txt`] 1 high (`joi`), 2 moderate en `develop` |
| 7 | Secrets | 🟢 (config) | [GAP: `analysis/gaps.md`] gitleaks en pre-commit |
| 8 | Containers | ⚪ | Hadolint/Trivy no ejecutados |

## Strengths

- CI bloquea `pnpm audit --audit-level=high` en cada PR. [VERIFY: `.github/workflows/ci.yml:49-50`]
- Overrides y parches documentados en `pnpm-workspace.yaml` (axios, handlebars, follow-redirects en `develop`).
- Validación de entorno con Joi al arranque (`src/config/env.validation.ts`).
- Workflow `security-audit.yml` (OSV + Semgrep) en PR recientes de Dependabot.
- Cobertura de tests unitarios amplia en dominios críticos (auth, me, inventory, OCR).

## Findings

### P1 — Ninguno bloqueante en el diff de PR #232 / #234

Los cambios de Dependabot no abren superficie nueva; el HIGH de `joi` ya existe en la base (`develop` / `main`), no lo introducen estos PR.

### P2 — `joi` HIGH en runtime (validación env)

- **Evidence:** [TOOL: `pnpm audit` → `analysis/pnpm-audit-2026-10-31.txt`] GHSA-4528-x5fx-h6hg; resuelto `joi@18.2.9` [VERIFY: `package.json`]
- **Impact:** DoS teórico vía `string().email({ multiple: true })`; el schema actual no usa ese patrón, pero la dependencia directa sigue en advisory HIGH.
- **Fix:** → REMEDIATION-PLAN R-01

### P2 — Deriva `main` vs `develop` en overrides SCA

- **Evidence:** [VERIFY: `origin/main` vs `develop` en `pnpm-workspace.yaml`] `follow-redirects: '>=1.16.1'` en `main` vs `>=1.16.2` en `develop`; [TOOL: `analysis/pnpm-audit-pr232.txt`] 2 HIGH en head de #232 (follow-redirects + joi)
- **Impact:** merges a `main` sin cherry-pick de overrides dejan axios chain en versión advisory.
- **Fix:** → REMEDIATION-PLAN R-02

### P3 — DRY en guards de perfil

- **Evidence:** [TOOL: jscpd → `analysis/jscpd-report.json`] clones entre `profile-access.guard.ts` y similares

## Gestión de PR (Gentle AI)

| PR | Decisión | Motivo |
|----|----------|--------|
| [#232](https://github.com/abelserradev/backend_gastosmobile/pull/232) | **Aprobar** | Parche Prisma 7.10.1 (prod); CI Backend + Dependencias OK; alcance lockfile only |
| [#234](https://github.com/abelserradev/backend_gastosmobile/pull/234) | **Aprobar** | Dev-deps; CI completo (incl. OSV + Semgrep); sin impacto runtime |

## Discarded findings

| Report | Reason |
|--------|--------|
| joi DoS como P1 explotable | Schema no expone `email({ multiple: true })` a input HTTP; riesgo acotado al arranque/config |

## Artifacts

- `docs/code-audit/analysis/pnpm-audit-2026-10-31.txt`, `pnpm-audit-pr232.txt`, `pnpm-audit-pr234.txt`, `jest-2026-10-31.txt`, `tsc-2026-10-31.txt`
- `docs/code-audit/analysis/stack.json`, `gaps.md`
