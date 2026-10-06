import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from './audit.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuditService', () => {
  let service: AuditService;
  let prisma: {
    backendLog: { create: jest.Mock };
    domainAuditEvent: { create: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      backendLog: { create: jest.fn() },
      domainAuditEvent: { create: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  describe('logBackend', () => {
    it('debe insertar un log cuando Prisma responde', async () => {
      prisma.backendLog.create.mockResolvedValue({ id: 'log-1' });

      await service.logBackend({
        level: 'info',
        message: 'auth.login.success',
        requestId: 'req-1',
        userId: 'user-1',
        context: { channel: 'web' },
      });

      expect(prisma.backendLog.create).toHaveBeenCalledWith({
        data: {
          level: 'info',
          message: 'auth.login.success',
          context: { channel: 'web' },
          requestId: 'req-1',
          userId: 'user-1',
        },
      });
    });

    it('no debe propagar error si Prisma falla', async () => {
      prisma.backendLog.create.mockRejectedValue(new Error('DB down'));

      await expect(
        service.logBackend({ level: 'warn', message: 'fail' }),
      ).resolves.toBeUndefined();

      expect(prisma.backendLog.create).toHaveBeenCalled();
    });
  });

  describe('recordDomainEvent', () => {
    it('debe insertar un evento de dominio', async () => {
      prisma.domainAuditEvent.create.mockResolvedValue({ id: 'evt-1' });
      const now = new Date();

      await service.recordDomainEvent({
        stream: 'expense',
        eventType: 'created',
        entityId: 'exp-1',
        profileId: 'prof-1',
        userId: 'user-1',
        payload: { amount: 10 },
        occurredAt: now,
      });

      expect(prisma.domainAuditEvent.create).toHaveBeenCalledWith({
        data: {
          stream: 'expense',
          eventType: 'created',
          entityId: 'exp-1',
          profileId: 'prof-1',
          userId: 'user-1',
          payload: { amount: 10 },
          occurredAt: now,
        },
      });
    });

    it('no debe propagar error si Prisma falla', async () => {
      prisma.domainAuditEvent.create.mockRejectedValue(new Error('DB down'));

      await expect(
        service.recordDomainEvent({ stream: 'error', eventType: 'unhandled' }),
      ).resolves.toBeUndefined();
    });
  });
});
