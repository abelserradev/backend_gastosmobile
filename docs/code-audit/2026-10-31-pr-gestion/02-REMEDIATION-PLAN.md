# Remediation plan — backend_gastosmobile (2026-10-31)

## Phase 0 — Guardrails

- Mantener pre-commit existente (gitleaks + hooks locales). Añadir en CI periodicidad: re-ejecutar `pnpm audit` tras advisories nuevos (el HIGH de `joi` apareció después del último green de algunos PR).
- Opcional: hook local `jscpd` / Semgrep como en plantilla `nestjs` de code-audit (ya parcialmente cubierto por `security-audit.yml` en PR).

## Phase 1 — P2

### R-01 · Subir `joi` a >=18.3.1

- **Fix:** En `package.json`, `"joi": "^18.3.1"` (o pin mínimo 18.3.1); `pnpm install`; commit lockfile.
- **Effort:** S · **Risk:** bajo (validación env al bootstrap)
- **Verification:** `pnpm audit --audit-level=high` → 0 high en `develop`

### R-02 · Alinear `main` con overrides de `develop`

- **Fix:** Cherry-pick o PR de `pnpm-workspace.yaml` (`follow-redirects: '>=1.16.2'` y resto de overrides de supply-chain) hacia `main` antes o junto con merges de Dependabot a `main`.
- **Effort:** M · **Risk:** bajo si lockfile se regenera con `--frozen-lockfile` en CI
- **Verification:** checkout `main` + lock → `pnpm audit --audit-level=high` → sin HIGH en follow-redirects

## Phase 2 — P3

| ID | Fix | Verification |
|----|-----|--------------|
| DRY-1 | Extraer helper compartido en guards de perfil (ya iniciado en `profile-route-auth.util.ts`) | jscpd < 3% |

## Follow-up PR Dependabot

| PR | Merge recomendado | Post-merge |
|----|-------------------|------------|
| #232 | Sí (aprobado en review) | Sincronizar overrides con develop en `main` |
| #234 | Sí (aprobado en review) | Ninguno crítico |

## Follow-up

| Item | Owner | Verification | Status |
|------|-------|--------------|--------|
| joi >=18.3.1 | backend | pnpm audit high=0 | pendiente |
| main overrides | backend | audit en main | pendiente |
| PR #232 / #234 | reviewer | gh pr checks green | aprobados en review |
