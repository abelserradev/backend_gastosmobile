# Code audit — backend_gastosmobile (2026-10-28)

**Scope:** Dependabot alerts (#94–#98), SCA, quick SAST/DRY smoke.  
**Repo:** `gastos/backend_gastosmobile` (NestJS 11, pnpm 11.3)

## Executive summary

The five open Dependabot issues on `pnpm-lock.yaml` map to **transitive** `handlebars` (dev via `ts-jest`) and **runtime** `follow-redirects` (via `axios` → `@nestjs/axios`). Local resolution now pins **handlebars@4.7.10** and **follow-redirects@1.16.2**. Runtime exploitability for handlebars is **negligible** (no Handlebars usage in application code). `follow-redirects` affects outbound HTTP redirects from Axios; upgrading closes credential-leak advisories on cross-origin redirects.

One **low** dev-only finding remains: `deepmerge@4.3.1` (GHSA-gcqx-w48m-w2h4) — patched version **4.3.2 is not published on npm** at audit time.

## Scorecard (8 dimensions)

| # | Dimension | Status | Evidence |
|---|-----------|--------|----------|
| 1 | DRY | Amber | [TOOL: jscpd → `analysis/jscpd-report.json`] ~2.8% duplicated lines; guards share profile-access boilerplate |
| 2 | SOLID | Green (sample) | [VERIFY: `src/main.ts:41-46`] global ValidationPipe whitelist/forbidNonWhitelisted |
| 3 | Unit tests | Green | [TOOL: jest → `analysis/jest.txt`] 26 suites, 220 tests passed |
| 4 | Integration | Amber | e2e configured; not run in this pass (needs isolated DB) |
| 5 | SAST (code) | Not evaluated | No Semgrep/eslint-security run in this pass |
| 6 | SCA | Green (target alerts) | [TOOL: pnpm audit → `analysis/pnpm-audit.txt`] 0 high/critical after lock refresh; Dependabot targets addressed |
| 7 | Secrets | Green (config) | [GAP: gaps.md] gitleaks in pre-commit |
| 8 | Containers | Not evaluated | Hadolint/Trivy not run |

## Strengths

- CI blocks **high/critical** `pnpm audit` on every push/PR. [VERIFY: `.github/workflows/ci.yml:49-50`]
- Centralized **pnpm overrides** for supply-chain fixes (`pnpm-workspace.yaml`).
- Global **ValidationPipe** with whitelist and forbidNonWhitelisted. [VERIFY: `src/main.ts:41-46`]
- **Helmet** + CORS from env; request ID middleware for audit correlation.

## Findings (by severity)

### P1 — None open after dependency refresh

Previously open Dependabot **critical/high** on handlebars and follow-redirects are addressed by lock resolution (see remediation plan).

### P2 — SCA residual (dev)

| ID | Finding | Evidence | Runtime? |
|----|---------|----------|----------|
| SCA-1 | `deepmerge` prototype pollution (low) | [TOOL: `analysis/pnpm-audit.txt`] GHSA-gcqx-w48m-w2h4; patched `>=4.3.2` unavailable on npm | No — Jest / `@nestjs/cli` only |

### P3 — Quality / maintainability

| ID | Finding | Evidence |
|----|---------|----------|
| DRY-1 | Duplicated guard logic (`profile-access` vs similar) | [TOOL: jscpd → `analysis/jscpd-report.json`] |
| TS-1 | Strict `ConfigService` stubs in OCR quota spec broke `tsc --noEmit` | [VERIFY: fixed in `google-vision-quota.service.spec.ts`] |

## Discarded / accepted risk

- **Handlebars CVEs in production:** handlebars is not imported in `src/`; only devDependency chain. Risk accepted for local test tooling once version is 4.7.10.

## Artifacts

- `docs/code-audit/analysis/stack.json`, `gaps.md`, `pnpm-audit.txt`, `jscpd-report.json`, `jest.txt`, `eslint-ci.txt`, `tsc.txt`
