# Gap matrix — code-audit Phase 0

**Repo:** `C:\Users\aserra\OneDrive - VENEMERGENCIA AG, C.A\Documentos\buildforge\gastos\backend_gastosmobile`  
**Stacks:** nestjs  
**Dockerfiles:** 1 · **Lockfiles:** 1 · **pre-commit:** yes

**Tests:** 26 unit (heuristic) · 0 integration

| Dimension | Tooling present? | Tools found |
|---|---|---|
| DRY | ❌ | — |
| SOLID | ❌ | — |
| unit_tests | ✅ | jest |
| integration_tests | ✅ | e2e, supertest |
| SAST | ❌ | — |
| SCA | ✅ | dependabot, npm audit |
| secrets | ✅ | gitleaks |
| containers | ❌ | — |

## Stack details
- **nestjs** in `.` — evidence: package.json:@nestjs/core

## Dockerfiles
- `Dockerfile`

> Note: the matrix detects *configuration*, not execution. A ✅ means the tool appears in the scanned pre-commit/CI/configs; verify in Phase 1 that it actually runs and blocks.
