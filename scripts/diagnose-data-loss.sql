-- Diagnóstico read-only: ¿pérdida real de filas o gastos "ocultos" por periodo?
-- Ejecutar en el contenedor Postgres de producción (Coolify → Terminal):
--   psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f diagnose-data-loss.sql
-- o pegar bloques en psql interactivo.

\echo '=== Totales globales ==='
SELECT COUNT(*) AS users FROM "User";
SELECT COUNT(*) AS profiles FROM "Profile";
SELECT COUNT(*) AS expenses FROM "Expense";
SELECT MIN("createdAt") AS oldest_user FROM "User";
SELECT MAX("createdAt") AS newest_expense FROM "Expense";

\echo '=== Migraciones Prisma aplicadas (últimas 5) ==='
SELECT migration_name, finished_at
FROM "_prisma_migrations"
ORDER BY finished_at DESC NULLS LAST
LIMIT 5;

\echo '=== Gastos por mes de referencia (toda la BD) ==='
SELECT "referenceMonth"::date AS ref_month, COUNT(*) AS cnt
FROM "Expense"
GROUP BY 1
ORDER BY 1 DESC
LIMIT 24;

\echo '=== Usuarios con gastos pero 0 en el mes calendario actual (Caracas ~ UTC-4) ==='
-- Ajusta la fecha si hace falta; en oct 2026 el mes activo calendario es 2026-10-01
WITH current_cal AS (SELECT DATE '2026-10-01' AS ref)
SELECT u.id, u.email, COUNT(e.*) AS total_expenses,
  COUNT(e.*) FILTER (WHERE e."referenceMonth" = (SELECT ref FROM current_cal)) AS in_oct_2026_calendar
FROM "User" u
JOIN "Profile" p ON p."userId" = u.id
JOIN "Expense" e ON e."profileId" = p.id
GROUP BY u.id, u.email
HAVING COUNT(e.*) > 0
   AND COUNT(e.*) FILTER (WHERE e."referenceMonth" = (SELECT ref FROM current_cal)) = 0
ORDER BY total_expenses DESC
LIMIT 30;

\echo '=== referenceMonth NO alineado a YYYY-MM-01 (modo corte FEAT-001) ==='
SELECT "referenceMonth"::date AS ref, COUNT(*) AS cnt
FROM "Expense"
WHERE EXTRACT(DAY FROM "referenceMonth") <> 1
GROUP BY 1
ORDER BY cnt DESC
LIMIT 20;

\echo '=== Chismógrafo: borrados auditados recientes ==='
SELECT "occurredAt", "eventType", "userId", "entityId", payload
FROM domain_audit_events
WHERE stream = 'expense' AND "eventType" = 'deleted'
ORDER BY "occurredAt" DESC
LIMIT 30;
