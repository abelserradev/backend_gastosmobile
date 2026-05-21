# CI y seguridad en GitHub (backend)

## Workflows

| Workflow | Cuándo corre | Qué hace |
|----------|--------------|----------|
| **CI** | Push y PR a `develop`, `main`, `master`, `backend` | `npm ci`, audit (high+), Prisma validate, tests, build |
| **Security audit** | Mismo + lunes 06:00 UTC + manual | `npm ci`, audit, listado de dependencias |
| **Deploy Coolify** | Solo manual | Webhook de deploy (no sustituye CI) |

## Bloqueo por vulnerabilidades

- **Fallan el pipeline:** vulnerabilidades **high** y **critical** (`npm audit --audit-level=high`).
- **Solo aviso:** **moderate** (siguen visibles en logs; conviene corregir con `npm audit fix` o actualizar Dependabot).

## Branch protection (configurar en GitHub)

Repo → **Settings** → **Branches** → **Add rule** (o editar regla de `develop`):

1. **Branch name pattern:** `develop` (repetir para `main` si aplica).
2. Activar:
   - **Require a pull request before merging** (recomendado: al menos 1 approval si hay varios devs).
   - **Require status checks to pass before merging**
3. Buscar y marcar estos checks:
   - `Backend (Nest + Prisma)` (workflow CI)
   - `Dependencias (npm audit)` (workflow Security audit)
4. Opcional: **Require branches to be up to date before merging**.
5. Opcional: **Do not allow bypassing the above settings**.

Sin branch protection, los workflows corren pero **no impiden** merge o push directo con checks en rojo.

## Flujo recomendado para el equipo

1. Trabajar en rama feature → abrir **PR hacia `develop`**.
2. Esperar CI y Security audit en verde.
3. Merge solo tras revisión (y approval si está configurado).
4. Deploy a Coolify con el workflow manual o el flujo que uses en producción.

## Dependabot

`/.github/dependabot.yml` abre PRs semanales de npm y GitHub Actions. Revisar y mergear con CI verde.

## Secretos

No commitear `.env`. Los workflows no necesitan secretos para CI; el deploy usa `COOLIFY_WEBHOOK_BACKEND` en repository secrets.
