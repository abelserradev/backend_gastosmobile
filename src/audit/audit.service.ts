import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { BackendLogInput, DomainAuditEventInput } from './audit.types';

/**
 * Servicio de auditoría append-only en PostgreSQL.
 *
 * Principio clave: fail-open. Si la escritura de audit falla, la operación de
 * negocio no debe fallar. Por eso todos los métodos capturan errores y solo
 * emiten un warn en logs de servidor.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async logBackend(input: BackendLogInput): Promise<void> {
    try {
      await this.prisma.backendLog.create({
        data: {
          level: input.level,
          message: input.message,
          context: (input.context ?? {}) as Prisma.InputJsonValue,
          requestId: input.requestId,
          userId: input.userId,
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`No se pudo escribir backend_log: ${msg}`);
    }
  }

  async recordDomainEvent(input: DomainAuditEventInput): Promise<void> {
    try {
      await this.prisma.domainAuditEvent.create({
        data: {
          stream: input.stream,
          eventType: input.eventType,
          entityId: input.entityId,
          profileId: input.profileId,
          userId: input.userId,
          payload: (input.payload ?? {}) as Prisma.InputJsonValue,
          occurredAt: input.occurredAt ?? new Date(),
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`No se pudo escribir domain_audit_event: ${msg}`);
    }
  }
}
