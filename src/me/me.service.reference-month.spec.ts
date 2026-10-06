import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { MeService } from './me.service';
import { PrismaService } from '../prisma/prisma.service';
import { BcvRateService } from '../bcv/bcv-rate.service';
import { ResendEmailService } from '../email/resend-email.service';
import { ProfileCollaboratorService } from '../profile-collaborators/profile-collaborator.service';
import { AuditService } from '../audit/audit.service';

jest.mock('../common/utils/caracas-date', () => {
  const actual = jest.requireActual('../common/utils/caracas-date');
  return {
    ...actual,
    formatYmdInCaracas: () => '2026-10-06',
  };
});

const mockPrisma = () => ({
  userPreference: { findUnique: jest.fn() },
  profile: { findFirst: jest.fn() },
  category: { upsert: jest.fn(), findFirst: jest.fn() },
  expense: { create: jest.fn() },
});

const mockBcv = () => ({
  getVesPerUsdForCalendarDay: jest.fn().mockResolvedValue({
    vesPerUsd: { toString: () => '40' },
    rateDate: new Date('2026-10-04T12:00:00.000Z'),
  }),
});

describe('MeService — referenceMonth al registrar (REQ-REG)', () => {
  let service: MeService;
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MeService,
        { provide: PrismaService, useValue: mockPrisma() },
        { provide: BcvRateService, useValue: mockBcv() },
        {
          provide: ResendEmailService,
          useValue: { sendWelcomeEmail: jest.fn() },
        },
        {
          provide: ProfileCollaboratorService,
          useValue: { listProfilesForUser: jest.fn() },
        },
        {
          provide: AuditService,
          useValue: {
            logBackend: jest.fn(),
            recordDomainEvent: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<MeService>(MeService);
    prisma = module.get(PrismaService);
    jest.clearAllMocks();

    prisma.userPreference.findUnique.mockResolvedValue({
      budgetCycleMode: 'monthly_cutoff',
      budgetCutoffDay: 5,
    });
    prisma.profile.findFirst.mockResolvedValue({ id: 'p1' });
    prisma.category.upsert.mockResolvedValue({ id: 'c1', name: 'Varios' });
  });

  it('createExpense con paymentDate anterior usa periodStart del registro (2026-10-06)', async () => {
    prisma.expense.create.mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'e1',
        ...data,
        category: { name: 'Varios' },
        profile: { name: 'Fam' },
        isPaid: false,
        paidByDisplayName: null,
        paidAt: null,
        paidByMemberId: null,
        receiptImage: null,
        amount: { toString: () => String(data.amount) },
        bcvRateApplied: data.bcvRateApplied,
      }),
    );

    await service.createExpense(
      { userId: 'u1', email: 'u@test.com' },
      {
        title: 'Deuda',
        amount: 10,
        categoryName: 'Varios',
        paymentDate: '2026-10-04',
      },
    );

    expect(prisma.expense.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          referenceMonth: new Date('2026-10-06T12:00:00.000Z'),
          paymentDate: new Date('2026-10-04T12:00:00.000Z'),
        }),
      }),
    );
  });

  it('createExpense rechaza referenceMonth del periodo anterior', async () => {
    await expect(
      service.createExpense(
        { userId: 'u1', email: 'u@test.com' },
        {
          title: 'Deuda',
          amount: 10,
          categoryName: 'Varios',
          referenceMonth: '2026-09-06',
          paymentDate: '2026-10-04',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.expense.create).not.toHaveBeenCalled();
  });
});
