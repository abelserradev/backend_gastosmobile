import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import {
  AUTH_ERROR_ACCOUNT_LOCKED,
  MAX_FAILED_LOGIN_ATTEMPTS,
} from './auth.constants';
import { AuthCookieService } from './auth-cookie.service';
import { FirebaseAdminService } from './firebase-admin.service';
import { ResendEmailService } from '../email/resend-email.service';
import { AuditService } from '../audit/audit.service';

const auditMock = {
  logBackend: jest.fn().mockResolvedValue(undefined),
  recordDomainEvent: jest.fn().mockResolvedValue(undefined),
} as unknown as AuditService;

const auditCtxMock = {
  requestId: 'req-test',
  ip: '127.0.0.1',
  userAgent: 'jest',
  channel: 'web' as const,
};

describe('AuthService login lockout', () => {
  const resMock = {} as import('express').Response;
  let service: AuthService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new AuthService(
      prisma as never,
      { sign: jest.fn() } as unknown as JwtService,
      { setAccessJwt: jest.fn() } as unknown as AuthCookieService,
      {} as FirebaseAdminService,
      {
        isConfigured: jest.fn().mockReturnValue(false),
      } as unknown as ResendEmailService,
      {} as never,
      auditMock,
    );
  });

  it('should reject login when account is already locked', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@test.com',
      passwordHash: 'hash',
      name: 'A',
      failedLoginAttempts: 4,
      lockedAt: new Date(),
    });
    await expect(
      service.login({ email: 'a@test.com', password: 'x' }, resMock, auditCtxMock),
    ).rejects.toMatchObject({
      response: { code: AUTH_ERROR_ACCOUNT_LOCKED },
    });
  });

  it('should lock account on the fourth failed password attempt', async () => {
    const hash = await bcrypt.hash('correct', 10);
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@test.com',
      passwordHash: hash,
      name: 'A',
      failedLoginAttempts: 3,
      lockedAt: null,
    });
    prisma.user.update
      .mockResolvedValueOnce({
        id: 'u1',
        failedLoginAttempts: MAX_FAILED_LOGIN_ATTEMPTS,
        lockedAt: null,
      })
      .mockResolvedValueOnce({ id: 'u1', lockedAt: new Date() });
    await expect(
      service.login(
        { email: 'a@test.com', password: 'wrong' },
        resMock,
        auditCtxMock,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.update).toHaveBeenCalledTimes(2);
  });

  it('should reset failed attempts after successful login', async () => {
    const hash = await bcrypt.hash('secret', 10);
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@test.com',
      passwordHash: hash,
      name: 'A',
      failedLoginAttempts: 2,
      lockedAt: null,
    });
    prisma.user.update.mockResolvedValue({});
    await service.login(
      { email: 'a@test.com', password: 'secret' },
      resMock,
      auditCtxMock,
    );
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { failedLoginAttempts: 0 },
    });
  });

  it('should not increment attempts when user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(
      service.login(
        { email: 'ghost@test.com', password: 'x' },
        resMock,
        auditCtxMock,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
