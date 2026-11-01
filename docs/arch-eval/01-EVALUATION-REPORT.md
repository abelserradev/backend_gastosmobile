# Architecture evaluation — backend_gastosmobile

**Date:** 2026-10-31 · **Evidence:** `docs/arch-eval/analysis/dep_graph.md`, `arch_signals.md`

## Recommendation (arch-patterns)

```
Recommendation: Modular Monolith + Hexagonal (por bounded context) (+ ESLint/Sonar en CI)
Why: un equipo, dominio rico en `me`/inventory, sin señales de escala multi-equipo
Not microservices because: ops cost sin beneficio; hotspot es un god-service, no límites de deploy
Risks: refactor MeService sin spec → regresiones; mitigar con OpenSpec payment-comparison + tests
Revisit when: equipos separados front/back/telegram o release cadence independiente
```

## Scorecard (atributos — muestra)

| Atributo | Veredicto | Evidencia |
|----------|-----------|-----------|
| Mantenibilidad | 🔴 | `me.service.ts` 1740 LOC [METRIC: arch_signals hotspot] |
| Modularidad | 🟡 | Ciclo SCC 7 módulos [METRIC: dep_graph] |
| Testabilidad | 🟡 | Telegram mutation 0% cov [TOOL: test:cov] |
| Seguridad | 🟢 | Guards + ValidationPipe + audit module |
| Evolución | 🟢 | OpenSpec activo para payment-comparison |

## P1 weaknesses

Ninguno de arquitectura que bloquee deploy (deepmerge es SCA dev, ver code-audit).

## P2 weaknesses

1. **God service `MeService`** — fan-out 10, 2634 LOC módulo [METRIC: dep_graph]
2. **Ciclo import modules** audit↔auth↔…↔me [METRIC: dep_graph] — confirmar en Phase 1 leyendo imports type-only vs runtime
3. **Acoplamiento temporal** `active-budget-context.util.ts` ↔ `me.service.ts` [METRIC: arch_signals co-change 0.7]

## Strengths

- `src/prisma` fan-in 10, fan-out 0 — capa de persistencia estable.
- `common/guards` y `common/cache` baja inestabilidad.
- Auditoría (`src/audit`) fan-in 5 — cross-cutting bien ubicado.

## Dismissed

- **DOMA / microservices:** sin evidencia organizacional.

Ver plan: `docs/code-audit/2026-10-31-deepmerge-sonar/02-REMEDIATION-PLAN.md`.
