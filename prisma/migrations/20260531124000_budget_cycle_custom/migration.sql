-- FEAT-001: Fechas de corte personalizadas para presupuesto
-- Añade soporte para ciclos presupuestarios con día de corte configurable

-- Añadir columna de modo de ciclo presupuestario
ALTER TABLE "UserPreference" ADD COLUMN "budgetCycleMode" TEXT NOT NULL DEFAULT 'calendar_month';

-- Añadir columna de día de corte (fin del periodo)
ALTER TABLE "UserPreference" ADD COLUMN "budgetCutoffDay" INTEGER NOT NULL DEFAULT 1;

-- Comentarios de documentación
COMMENT ON COLUMN "UserPreference"."budgetCycleMode" IS 'Modo de ciclo: calendar_month (mes calendario) o monthly_cutoff (corte configurable)';
COMMENT ON COLUMN "UserPreference"."budgetCutoffDay" IS 'Día del mes que CIERRA el periodo (corte). Default 1 = comportamiento calendario. Recomendado: 1-28';
