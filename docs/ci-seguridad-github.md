# CI y seguridad en GitHub (backend)

## Workflows

| Workflow | Cuándo corre | Qué hace |
|----------|--------------|----------|
| **CI** | Push y PR a `develop`, `main`, `master`, `backend` | `pnpm install --frozen-lockfile`, audit (high+), Prisma validate, tests, build |
| **Security audit** | Mismo + lunes 06:00 UTC + manual | `pnpm install --frozen-lockfile`, audit, listado de dependencias |
| **Dependabot auto-merge** | PR de Dependabot hacia `develop` | Auto-merge squash si es patch o security y CI pasa |
| **Dependabot batch merge** | Lunes 10:00 UTC + manual | Merge de respaldo de PRs Dependabot con checks verdes hacia `develop` |
| **Deploy Coolify** | Solo manual | Webhook de deploy (no sustituye CI) |

## Bloqueo por vulnerabilidades

- **Fallan el pipeline:** vulnerabilidades **high** y **critical** (`pnpm audit --audit-level=high`).
- **Solo aviso:** **moderate** (siguen visibles en logs; conviene corregir con overrides o actualizar Dependabot).

## Overrides pnpm (CVEs transitivas)

Cuando Dependabot no puede actualizar una dependencia transitiva (p. ej. *"cannot update to non-vulnerable version"*), se fuerzan versiones parcheadas en [`pnpm-workspace.yaml`](../pnpm-workspace.yaml) bajo `overrides`:

| Paquete | Versión mínima | Motivo típico |
|---------|----------------|---------------|
| `websocket-driver` | `>=0.7.5` | `firebase-admin` |
| `axios` | `1.18.1` | `@nestjs/axios` |
| `js-yaml@3` / `js-yaml@4` | `3.15.0` / `4.2.0` | Jest, ESLint, Nest CLI |
| `protobufjs` | `>=7.6.3` | Firebase / Google Cloud |
| `@babel/core` | `>=7.29.6` | Jest (dev) |

Tras cambiar overrides: `pnpm install`, `pnpm audit --audit-level=moderate`, y validar build/tests antes de mergear.

## Branch protection (configurar en GitHub)

Repo → **Settings** → **Branches** → **Add rule** (o editar regla de `develop`):

1. **Branch name pattern:** `develop` (repetir para `main` si aplica).
2. Activar:
   - **Require a pull request before merging** (recomendado: al menos 1 approval si hay varios devs).
   - **Require status checks to pass before merging**
3. Buscar y marcar estos checks:
   - `Backend (Nest + Prisma)` (workflow CI)
   - `Dependencias (pnpm audit)` (workflow Security audit)
4. Opcional: **Require branches to be up to date before merging**.
5. Opcional: **Do not allow bypassing the above settings**.

Para que Dependabot auto-merge funcione en `develop`:

- **Settings → General → Pull Requests** → activar **Allow auto-merge**.
- En la regla de `develop`, no exigir approval en PRs del bot (o configurar bypass para `dependabot[bot]`).

Sin branch protection, los workflows corren pero **no impiden** merge o push directo con checks en rojo.

## Flujo recomendado para el equipo

1. Trabajar en rama feature → abrir **PR hacia `develop`**.
2. Esperar CI y Security audit en verde.
3. Merge solo tras revisión (y approval si está configurado).
4. Deploy a Coolify con el workflow manual o el flujo que uses en producción.

## Dependabot

[`/.github/dependabot.yml`](../.github/dependabot.yml) abre PRs **agrupados** (máx. 5 npm + 3 Actions):

| Grupo | Contenido | Auto-merge |
|-------|-----------|--------------|
| `security-updates` | CVEs | Sí (hacia `develop`, CI verde) |
| `production-patches` | Parches prod | Sí |
| `production-minors` | Minors prod | No — revisión manual |
| `dev-dependencies` | Dev deps | No (salvo patch vía grupo security) |
| `github-actions` | Actions | Batch lunes si CI verde |

**Minors y majors** de producción requieren revisión humana. El workflow **Dependabot batch merge** (lunes 10:00 UTC) mergea PRs que quedaron pendientes con checks en SUCCESS.

## Secretos

No commitear `.env`. Los workflows no necesitan secretos para CI; el deploy usa `COOLIFY_WEBHOOK_BACKEND` en repository secrets.
