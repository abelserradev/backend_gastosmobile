import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { MeService } from './me.service';
import { mapExpenseToResponse } from './me.mappers';
import { PrismaService } from '../prisma/prisma.service';
import { BcvRateService } from '../bcv/bcv-rate.service';
import { ResendEmailService } from '../email/resend-email.service';
import { ProfileCollaboratorService } from '../profile-collaborators/profile-collaborator.service';
import { AuditService } from '../audit/audit.service';

jest.mock('../common/utils/caracas-date', () => {
  const actual = jest.requireActual('../common/utils/caracas-date');
  return {
    ...actual,
    formatYmdInCaracas: () => '2026-10-21',
  };
});

const dec = (v: string) => ({ toString: () => v });

const baseExpenseRow = {
  id: 'e1',
  profileId: 'p1',
  profile: { name: 'Fam' },
  title: 'Nevera',
  description: '',
  amount: dec('480.50'),
  isPaid: false,
  referenceMonth: new Date('2026-10-06T12:00:00.000Z'),
  paymentDate: new Date('2026-10-21T12:00:00.000Z'),
  bcvRateApplied: dec('883.396300'),
  bcvRateDate: new Date('2026-10-21T12:00:00.000Z'),
  paidByDisplayName: null,
  paidAt: null,
  paidByMemberId: null,
  category: { name: 'Hogar' },
  receiptImage: null,
};

describe('mapExpenseToResponse — metadata de comparación (EXP-001)', () => {
  it('gasto previo al cambio: campos nuevos en null y valuationBasis BCV', () => {
    const actual = mapExpenseToResponse(baseExpenseRow);

    expect(actual).toMatchObject({
      amount: 480.5,
      bcvRateApplied: 883.3963,
      paymentMethod: null,
      nominalAmount: null,
      nominalCurrency: null,
      commissionPct: null,
      commissionUsd: null,
      sellRate: null,
      bcvEquivalentUsd: null,
      valuationBasis: 'BCV',
      comparisonId: null,
    });
  });

  it('gasto de comparación electrónica expone nominal, comisión y comparisonId', () => {
    const actual = mapExpenseToResponse({
      ...baseExpenseRow,
      paymentMethod: 'ELECTRONIC',
      nominalAmount: dec('450.00'),
      nominalCurrency: 'USD',
      commissionPct: dec('6.78'),
      commissionUsd: dec('30.51'),
      sellRate: dec('1004.168050'),
      bcvEquivalentUsd: null,
      valuationBasis: 'SELL_RATE',
      comparison: { id: 'cmp-1' },
    });

    expect(actual).toMatchObject({
      paymentMethod: 'ELECTRONIC',
      nominalAmount: 450,
      nominalCurrency: 'USD',
      commissionPct: 6.78,
      commissionUsd: 30.51,
      sellRate: 1004.16805,
      bcvEquivalentUsd: null,
      valuationBasis: 'SELL_RATE',
      comparisonId: 'cmp-1',
    });
  });
});

describe('MeService — gastos de comparación (TD-4, EXP-003)', () => {
  let service: MeService;
  const prisma = {
    userPreference: { findUnique: jest.fn() },
    profile: { findFirst: jest.fn() },
    category: { upsert: jest.fn(), findFirst: jest.fn() },
    expense: { findFirst: jest.fn(), update: jest.fn() },
  };
  const bcv = { getVesPerUsdForCalendarDay: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MeService,
        { provide: PrismaService, useValue: prisma },
        { provide: BcvRateService, useValue: bcv },
        { provide: ResendEmailService, useValue: {} },
        { provide: ProfileCollaboratorService, useValue: {} },
        {
          provide: AuditService,
          useValue: {
            logBackend: jest.fn(),
            recordDomainEvent: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();
    service = module.get(MeService);

    prisma.userPreference.findUnique.mockResolvedValue({
      budgetCycleMode: 'monthly_cutoff',
      budgetCutoffDay: 5,
    });
    prisma.profile.findFirst.mockResolvedValue({ id: 'p1' });
    prisma.category.upsert.mockResolvedValue({ id: 'c1', name: 'Hogar' });
    prisma.expense.update.mockImplementation(({ data }) =>
      Promise.resolve({ ...baseExpenseRow, ...data }),
    );
  });

  it('resolveExpenseContext aplica perfil por defecto y el periodo de corte activo', async () => {
    const actual = await service.resolveExpenseContext('u1', {
      categoryName: 'Hogar',
    });

    expect(actual).toEqual({
      profileId: 'p1',
      categoryId: 'c1',
      referenceMonth: new Date('2026-10-06T12:00:00.000Z'),
    });
  });

  it('rechaza con 409 editar el monto de un gasto SELL_RATE sin consultar BCV', async () => {
    prisma.expense.findFirst.mockResolvedValue({
      ...baseExpenseRow,
      valuationBasis: 'SELL_RATE',
    });

    await expect(
      service.updateExpenseFields({ userId: 'u1', email: 'u@test.com' }, 'e1', {
        amount: 500,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(bcv.getVesPerUsdForCalendarDay).not.toHaveBeenCalled();
    expect(prisma.expense.update).not.toHaveBeenCalled();
  });

  it('permite cambiar el título de un gasto SELL_RATE sin tocar el monto', async () => {
    prisma.expense.findFirst.mockResolvedValue({
      ...baseExpenseRow,
      valuationBasis: 'SELL_RATE',
    });

    await service.updateExpenseFields(
      { userId: 'u1', email: 'u@test.com' },
      'e1',
      { title: 'Nevera cocina' },
    );

    const updateArgs = prisma.expense.update.mock.calls[0][0];
    expect(updateArgs.data).toEqual({ title: 'Nevera cocina' });
  });

  it('un gasto BCV sigue permitiendo editar el monto', async () => {
    prisma.expense.findFirst.mockResolvedValue({
      ...baseExpenseRow,
      valuationBasis: 'BCV',
    });
    bcv.getVesPerUsdForCalendarDay.mockResolvedValue({
      vesPerUsd: dec('883.396300'),
      rateDate: new Date('2026-10-21T12:00:00.000Z'),
    });

    await service.updateExpenseFields(
      { userId: 'u1', email: 'u@test.com' },
      'e1',
      { amount: 500, amountCurrency: 'USD' },
    );

    expect(prisma.expense.update).toHaveBeenCalledTimes(1);
  });
});
