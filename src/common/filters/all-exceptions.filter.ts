import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuditService } from '../../audit/audit.service';
import { AuditEventTypes } from '../../audit/audit.types';
import { extractAuditContext } from '../../audit/request-context.util';

/**
 * No filtrar detalles de errores no HTTP en producción (menos superficie para reconnaissance).
 * Además, registra errores no controlados en la tabla de auditoría para diagnóstico.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly audit: AuditService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const isProd = process.env.NODE_ENV === 'production';

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      res.status(status).json(exception.getResponse());
      return;
    }

    const err =
      exception instanceof Error ? exception : new Error(String(exception));
    this.logger.error(`${req.method} ${req.url} — ${err.message}`, err.stack);

    const auditCtx = extractAuditContext(req);

    void this.audit
      .logBackend({
        level: 'error',
        message: err.message,
        requestId: auditCtx.requestId,
        userId: (req.user as { userId?: string } | undefined)?.userId,
        context: {
          path: req.url,
          method: req.method,
          stack: isProd ? undefined : err.stack,
          channel: auditCtx.channel,
          ip: auditCtx.ip,
        },
      })
      .catch(() => {
        // Fail-open: si audit también falla, ya loggueamos arriba.
      });

    void this.audit
      .recordDomainEvent({
        stream: 'error',
        eventType: AuditEventTypes.error.unhandled,
        userId: (req.user as { userId?: string } | undefined)?.userId,
        payload: {
          path: req.url,
          method: req.method,
          message: err.message,
          channel: auditCtx.channel,
        },
      })
      .catch(() => {
        // Fail-open.
      });

    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: isProd ? 'Error interno del servidor' : err.message,
    });
  }
}
