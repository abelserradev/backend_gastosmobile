-- Purga registros de auditoría mayores a 90 días.
-- Ejecutar contra la misma base de datos del backend (DATABASE_URL).
-- Recomendado: cron semanal en Coolify o job programado.
--
-- psql "$DATABASE_URL" -f scripts/purge-audit-logs-90d.sql

DELETE FROM "backend_logs"
WHERE "createdAt" < NOW() - INTERVAL '90 days';

DELETE FROM "domain_audit_events"
WHERE "occurredAt" < NOW() - INTERVAL '90 days';
