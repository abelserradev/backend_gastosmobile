# Architecture signals from git

**Repo:** `C:\Users\aserra\OneDrive - VENEMERGENCIA AG, C.A\Documentos\buildforge\gastos\backend_gastosmobile` · 240 commits (2026-04-16 → 2026-10-31)

## 🔴 Temporal coupling across modules — P1 evidence

Pairs of files in different modules that change together: the boundary between those modules is fictitious or leaky.

| File A | File B | Co-changes | Confidence |
|---|---|---|---|
| `docs/ci-seguridad-github.md` | `pnpm-workspace.yaml` | 9 | 0.53 |
| `src/common/utils/active-budget-context.util.spec.ts` | `src/me/me.service.ts` | 8 | 0.67 |
| `.env.example` | `src/config/env.validation.ts` | 8 | 0.62 |
| `src/common/utils/active-budget-context.util.ts` | `src/me/me.service.ts` | 7 | 0.7 |
| `src/common/constants/deploy-capabilities.const.ts` | `src/common/utils/active-budget-context.util.spec.ts` | 6 | 0.75 |
| `src/common/constants/deploy-capabilities.const.ts` | `src/common/utils/active-budget-context.util.ts` | 6 | 0.75 |
| `src/config/env.validation.ts` | `src/ocr/ocr.service.ts` | 6 | 0.67 |
| `prisma/schema.prisma` | `src/me/me.mappers.ts` | 6 | 0.5 |
| `src/me/dto/create-expense.dto.ts` | `src/me/me.service.ts` | 5 | 0.71 |
| `src/config/env.validation.ts` | `src/ocr/ocr.module.ts` | 4 | 1.0 |
| `docker-compose.yml` | `src/ocr/services/ollama-glm-ocr.service.ts` | 4 | 0.8 |
| `src/me/dto/create-income.dto.ts` | `src/me/me.service.ts` | 4 | 0.67 |
| `src/me/dto/update-preferences.dto.ts` | `src/me/me.service.ts` | 4 | 0.67 |
| `.github/dependabot.yml` | `package.json` | 4 | 0.57 |
| `src/common/constants/deploy-capabilities.const.ts` | `src/me/me.service.ts` | 4 | 0.5 |

## Hotspots (touches × (1+fixes))

| File | Touches | Fixes | Churn | Score |
|---|---|---|---|---|
| `pnpm-workspace.yaml` | 33 | 15 | 192 | 528 |
| `src/me/me.service.ts` | 48 | 9 | 4059 | 480 |
| `package.json` | 83 | 4 | 423 | 415 |
| `docs/ci-seguridad-github.md` | 17 | 7 | 220 | 136 |
| `.github/workflows/security-audit.yml` | 18 | 4 | 188 | 90 |
| `src/common/utils/active-budget-context.util.spec.ts` | 12 | 6 | 339 | 84 |
| `src/common/utils/active-budget-context.util.ts` | 10 | 5 | 306 | 60 |
| `README.md` | 17 | 1 | 379 | 34 |
| `src/common/constants/deploy-capabilities.const.ts` | 8 | 3 | 30 | 32 |
| `Dockerfile` | 10 | 2 | 97 | 30 |
| `src/auth/auth.service.ts` | 13 | 1 | 921 | 26 |
| `src/bcv/bcv-rate.service.ts` | 8 | 2 | 597 | 24 |
| `src/me/me.mappers.ts` | 12 | 1 | 298 | 24 |
| `src/auth/auth.controller.ts` | 12 | 1 | 233 | 24 |
| `prisma/schema.prisma` | 21 | 0 | 652 | 21 |

## Files with recurring fixes

| File | Fixes |
|---|---|
| `pnpm-workspace.yaml` | 15 |
| `src/me/me.service.ts` | 9 |
| `docs/ci-seguridad-github.md` | 7 |
| `src/common/utils/active-budget-context.util.spec.ts` | 6 |
| `src/common/utils/active-budget-context.util.ts` | 5 |
| `.github/workflows/security-audit.yml` | 4 |
| `package.json` | 4 |
| `src/common/constants/deploy-capabilities.const.ts` | 3 |
| `src/bcv/bcv-rate.service.ts` | 2 |
| `Dockerfile` | 2 |
| `docs/code-audit/SCA-2026-10-07-package-lock-removal.md` | 2 |
| `.github/dependabot.yml` | 2 |
| `src/me/dto/update-preferences.dto.ts` | 2 |

## Knowledge concentration per module (bus factor)

| Module | Commits | Authors | Dominant author | % |
|---|---|---|---|---|
| `src/ocr/engines` | 3 | 1 | aserra | 100.0% |
| `src/inventory/entities` | 2 | 1 | aserra | 100.0% |
| `patches` | 1 | 1 | Abel Serra | 100.0% |
| `src/profile-collaborators/dto` | 1 | 1 | aserra | 100.0% |
| `src/ocr/dto` | 1 | 1 | aserra | 100.0% |
| `src/common/types` | 1 | 1 | aserra | 100.0% |
| `src/ocr` | 10 | 2 | aserra | 90.0% ⚠️ |
| `openspec/changes` | 8 | 2 | aserra | 87.5% |
| `src/ocr/parsing` | 13 | 3 | aserra | 84.6% |
| `src/me/utils` | 5 | 2 | aserra | 80.0% |
| `src/profile-collaborators` | 4 | 2 | Abel Serra | 75.0% |
| `src/ocr/services` | 10 | 2 | aserra | 70.0% |
