# SCA backend — 2026-10-07

## Cambio

- Eliminado `package-lock.json` del repositorio (Dependabot lo escaneaba desactualizado v1.5.2).
- Fuente de verdad: `pnpm-lock.yaml` + `overrides` en `pnpm-workspace.yaml`.
- CI: `pnpm audit --prod --audit-level=high` + guardia anti `package-lock.json` trackeado.

## Evidencia

- `[TOOL]` `docs/code-audit/analysis/backend-pnpm-audit-prod-2026-10-07.txt` → 0 high/critical prod.
- `[TOOL]` `docs/code-audit/analysis/backend-pnpm-audit-full-2026-10-07.txt` → 1 moderate dev (`sprintf-js`); advisory pide >=1.1.4 pero npm solo publica 1.1.3 (Jest).

## sprintf-js (#93 Dependabot)

- **Cadena:** Jest → `babel-plugin-istanbul` → `js-yaml@3` → `argparse@1` → `sprintf-js`.
- **Alcance:** solo **Development**; no va al contenedor prod (`pnpm prune --prod`).
- **Mitigación:** override `1.1.3` + parche pnpm [`patches/sprintf-js@1.1.3.patch`](../../patches/sprintf-js@1.1.3.patch) (tope de precision en specs).
- **npm:** no existe `1.1.4`; `pnpm-workspace.yaml` → `auditConfig.ignoreGhsas` excluye GHSA en `pnpm audit` local/CI.
- **Dependabot:** si la alerta persiste tras merge, cerrar manualmente: *Dismiss* → «Fix not available» / dev-only, enlace a este doc.

## Riesgo aceptado (temporal)

| CVE / GHSA | Paquete | Alcance | Revisar |
|------------|---------|---------|---------|
| GHSA-hp3w-g68c-fv3c | sprintf-js | dev (Jest) | Retirar patch + ignore cuando npm publique >=1.1.4 |
