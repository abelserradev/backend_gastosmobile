import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

/**
 * Módulo global de auditoría. Expone AuditService para ser usado por cualquier
 * dominio sin importar el módulo audit explícitamente.
 */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
