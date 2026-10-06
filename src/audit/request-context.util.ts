import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import {
  GASTOS_CLIENT_CAPACITOR,
  GASTOS_CLIENT_HEADER,
} from '../auth/auth.constants';
import type { AuditRequestContext } from './audit.types';

/**
 * Extrae contexto de auditoría de un request HTTP:
 * - requestId: header x-request-id o UUID generado.
 * - ip: req.ip o primer valor de x-forwarded-for (Coolify/nginx).
 * - userAgent: string plano.
 * - channel: capacitor si x-gastos-client lo indica, web por defecto.
 */
export function extractAuditContext(req: Request): AuditRequestContext {
  const rawRequestId = req.headers['x-request-id'];
  const requestId =
    typeof rawRequestId === 'string' && rawRequestId.trim().length > 0
      ? rawRequestId.trim()
      : randomUUID();

  const rawIp =
    typeof req.headers['x-forwarded-for'] === 'string'
      ? req.headers['x-forwarded-for'].split(',')[0]?.trim()
      : req.ip;

  const rawClient = req.headers[GASTOS_CLIENT_HEADER];
  const channel: AuditRequestContext['channel'] =
    typeof rawClient === 'string' &&
    rawClient.trim().toLowerCase() === GASTOS_CLIENT_CAPACITOR
      ? 'capacitor'
      : 'web';

  return {
    requestId,
    ip: rawIp,
    userAgent: req.headers['user-agent'],
    channel,
  };
}
