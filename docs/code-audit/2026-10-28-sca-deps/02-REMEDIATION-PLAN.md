# Remediation plan — 2026-10-28 (SCA + quick fixes)

Work in **commits** (not PR slices). Keep each commit under ~500 lines where possible.

## Phase 0 — Done in this session

| Commit (proposed) | Change | Verify |
|-------------------|--------|--------|
| `fix(deps): resolve Dependabot handlebars and follow-redirects` | `pnpm-workspace.yaml`: pin `handlebars@4.7.10`, `follow-redirects>=1.16.2`; refresh `pnpm-lock.yaml` | `pnpm why handlebars` → 4.7.10; `pnpm why follow-redirects` → 1.16.2; `pnpm audit --audit-level=high` → exit 0 |
| `fix(test): tsc-safe ConfigService stubs in vision quota spec` | `google-vision-quota.service.spec.ts` `as unknown as ConfigService` | `pnpm exec tsc --noEmit` |
| `docs(code-audit): 2026-10-28 SCA report` | This folder + `analysis/*` tool outputs | — |

### Dependabot mapping

| Alert | Package | Fix |
|-------|---------|-----|
| #94 Moderate | handlebars precompile XSS | 4.7.10 |
| #95 Critical | handlebars AST confusion | 4.7.10 |
| #96 Critical | handlebars own-property bypass | 4.7.10 |
| #97 High | follow-redirects sensitiveHeaders regex | 1.16.2 |
| #98 High | follow-redirects array-form headers | 1.16.1+ (1.16.2 recommended) |

After push, **re-run Dependabot** or wait for rescan; close alerts when lockfile on default branch matches.

## Phase 1 — Guardrails (next commit batch)

| Task | Effort | Verify |
|------|--------|--------|
| Add `pnpm audit` output to CI artifact on failure (optional) | S | CI logs |
| Run **Semgrep** `p/typescript` + `p/nodejs` in CI (slow job) | M | Done 2026-10-28 — 0 findings baseline; CI blocking |
| **osv-scanner** on lockfile in CI (GitHub Action) | S | Done 2026-10-28 — job `OSV-Scanner (lockfile)` |
| DRY profile guards | S | Done 2026-10-28 — `profile-route-auth.util.ts` |

## Phase 2 — deepmerge (watch)

| Task | Effort | Verify |
|------|--------|--------|
| When `deepmerge@4.3.2+` publishes, add override `deepmerge: '>=4.3.2'` | S | `pnpm audit` → 0 vulnerabilities |
| Alternatively track upstream Jest/Nest CLI bumps | M | Same |

## Phase 3 — DRY (optional, separate commits)

| Task | Effort | Verify |
|------|--------|--------|
| Extract shared profile-id guard helper used by inventory/profile guards | M | jscpd duplication % drops; tests green |

## Phase 4 — axios (optional)

| Task | Effort | Verify |
|------|--------|--------|
| Evaluate bump `axios` override `1.20.0` → `1.21.0` in isolated commit | S | Done 2026-10-28 — `pnpm test` 223 OK, audit high clean |

**Note:** Agent must not `git push`. User publishes commits to trigger Dependabot refresh.
