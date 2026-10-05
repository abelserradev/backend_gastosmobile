export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type AuditStream = 'expense' | 'inventory' | 'error' | 'system';

export interface AuditRequestContext {
  requestId: string;
  ip?: string;
  userAgent?: string;
  channel: 'web' | 'capacitor' | 'unknown';
}

export interface BackendLogInput {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  requestId?: string;
  userId?: string;
}

export interface DomainAuditEventInput {
  stream: AuditStream;
  eventType: string;
  entityId?: string;
  profileId?: string;
  userId?: string;
  payload?: Record<string, unknown>;
  occurredAt?: Date;
}

export const AuditEventTypes = {
  system: {
    authLoginSuccess: 'auth.login.success',
    authLoginFailed: 'auth.login.failed',
    authRegister: 'auth.register',
    authFirebase: 'auth.firebase',
  },
  expense: {
    created: 'created',
    updated: 'updated',
    deleted: 'deleted',
  },
  inventory: {
    itemCreated: 'item_created',
    itemUpdated: 'item_updated',
    itemDeleted: 'item_deleted',
    movement: 'movement',
    adjustment: 'adjustment',
    transfer: 'transfer',
  },
  error: {
    httpException: 'http_exception',
    unhandled: 'unhandled',
  },
} as const;
