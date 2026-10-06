-- Auditoría y logs en PostgreSQL (misma instancia que el dominio Prisma).
-- Ver obsidian-vault/04-Especificaciones/features/FEAT-audit-events-postgres.md

CREATE TYPE "LogLevel" AS ENUM ('debug', 'info', 'warn', 'error');

CREATE TYPE "AuditStream" AS ENUM ('expense', 'inventory', 'error', 'system');

CREATE TABLE "backend_logs" (
    "id" TEXT NOT NULL,
    "level" "LogLevel" NOT NULL,
    "message" TEXT NOT NULL,
    "context" JSONB,
    "requestId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backend_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "backend_logs_createdAt_idx" ON "backend_logs"("createdAt" DESC);
CREATE INDEX "backend_logs_level_createdAt_idx" ON "backend_logs"("level", "createdAt" DESC);

CREATE TABLE "domain_audit_events" (
    "id" TEXT NOT NULL,
    "stream" "AuditStream" NOT NULL,
    "eventType" TEXT NOT NULL,
    "entityId" TEXT,
    "profileId" TEXT,
    "userId" TEXT,
    "payload" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "domain_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "domain_audit_events_stream_occurredAt_idx" ON "domain_audit_events"("stream", "occurredAt" DESC);
CREATE INDEX "domain_audit_events_profileId_occurredAt_idx" ON "domain_audit_events"("profileId", "occurredAt" DESC);
CREATE INDEX "domain_audit_events_entityId_occurredAt_idx" ON "domain_audit_events"("entityId", "occurredAt" DESC);
