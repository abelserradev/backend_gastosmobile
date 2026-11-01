import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MeService } from '../me/me.service';
import { ComparisonExpiredException } from './comparison-expired.exception';
import { ExchangeClient } from './exchange.client';
import { PaymentComparisonService } from './payment-comparison.service';
import { hashConvertRequest } from './mappers/comparison-expense.mapper';
import { PrismaService } from '../prisma/prisma.service';

const comparacionV1 = {
  version: 'v1' as const,
  computedAt: '2026-10-21T18:57:50.037Z',
  producto: 'TV',
  tasas: {
    oficial: { valor: '883', fechaFuente: '2026-10-21T13:00:00.000Z' },
    paralelo: { valor: '1100', fechaFuente: '2026-10-21T13:05:00.000Z' },
    desactualizado: false,
  },
  tasaVenta: { valor: '1100', origen: 'paralelo' as const },
  precioBs: null,
  opciones: [
    {
      id: 'bs',
      moneda: 'BS' as const,
      montoCobrado: '1',
      equivalenteBcvUsd: '1',
      comisionPct: null,
      comisionUsd: null,
      costoRealUsd: '1',
      costoRealBs: '1',
      diferenciaVsMejorUsd: '0',
      esMejor: true,
    },
  ],
  mejores: ['bs'],
  empateTotal: false,
  ahorroUsd: '0',
  tasaEquilibrio: null,
  recargoBsPct: null,
};

describe('PaymentComparisonService (GC-002/003)', () => {
  let service: PaymentComparisonService;
  const prisma = {
    paymentComparison: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    expense: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const exchange = { postComparacion: jest.fn() };
  const me = {
    resolveExpenseContext: jest.fn(),
    logExpenseCreatedFromComparison: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentComparisonService,
        { provide: PrismaService, useValue: prisma },
        { provide: ExchangeClient, useValue: exchange },
        { provide: MeService, useValue: me },
      ],
    }).compile();
    service = module.get(PaymentComparisonService);
  });

  it('create persiste PENDING con resultado Exchange', async () => {
    exchange.postComparacion.mockResolvedValue(comparacionV1);
    prisma.paymentComparison.create.mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'cmp-1',
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
        expenseId: null,
        convertIdempotencyKey: null,
        convertRequestHash: null,
      }),
    );

    const actual = await service.create('u1', {
      metodos: ['bs'],
      precioBs: { modo: 'monto_bs', monto: '100' },
    });

    expect(actual.id).toBe('cmp-1');
    expect(actual.status).toBe('PENDING');
    expect(exchange.postComparacion).toHaveBeenCalled();
  });

  it('getById lanza 410 y borra si expiró', async () => {
    prisma.paymentComparison.findFirst.mockResolvedValue({
      id: 'cmp-1',
      userId: 'u1',
      status: 'PENDING',
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(service.getById('u1', 'cmp-1')).rejects.toBeInstanceOf(
      ComparisonExpiredException,
    );
    expect(prisma.paymentComparison.delete).toHaveBeenCalledWith({
      where: { id: 'cmp-1' },
    });
  });

  it('discard 404 si no es del usuario', async () => {
    prisma.paymentComparison.findFirst.mockResolvedValue(null);
    await expect(service.discard('u1', 'cmp-x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('convertToExpense exige Idempotency-Key', async () => {
    await expect(
      service.convertToExpense('u1', 'cmp-1', undefined, {
        optionId: 'bs',
        title: 'TV',
        categoryName: 'Hogar',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('convertToExpense idempotente devuelve 200 path (created false)', async () => {
    const dto = {
      optionId: 'bs' as const,
      title: 'TV',
      categoryName: 'Hogar',
    };
    const requestHash = hashConvertRequest('cmp-1', dto);
    prisma.paymentComparison.findFirst.mockResolvedValue({
      id: 'cmp-1',
      userId: 'u1',
      status: 'CONVERTED',
      expenseId: 'exp-1',
      convertIdempotencyKey: 'key-1',
      convertRequestHash: requestHash,
      contractVersion: 'v1',
      result: comparacionV1,
    });
    prisma.expense.findUnique.mockResolvedValue({
      id: 'exp-1',
      profileId: 'p1',
      title: 'TV',
      description: '',
      amount: { toString: () => '1' },
      isPaid: false,
      referenceMonth: new Date('2026-10-01T12:00:00.000Z'),
      paymentDate: new Date('2026-10-21T12:00:00.000Z'),
      bcvRateApplied: { toString: () => '883' },
      bcvRateDate: new Date('2026-10-21T12:00:00.000Z'),
      category: { name: 'Hogar' },
      profile: { name: 'Personal' },
      paymentMethod: 'BS',
      nominalAmount: { toString: () => '1' },
      nominalCurrency: 'BS',
      commissionPct: null,
      commissionUsd: null,
      sellRate: { toString: () => '1100' },
      bcvEquivalentUsd: { toString: () => '1' },
      valuationBasis: 'SELL_RATE',
      comparison: { id: 'cmp-1' },
    });

    const { created, expense } = await service.convertToExpense(
      'u1',
      'cmp-1',
      'key-1',
      dto,
    );

    expect(created).toBe(false);
    expect(expense.id).toBe('exp-1');
  });

  it('convertToExpense 409 si ya convertida con otra key', async () => {
    prisma.paymentComparison.findFirst.mockResolvedValue({
      id: 'cmp-1',
      userId: 'u1',
      status: 'CONVERTED',
      expenseId: 'exp-9',
      convertIdempotencyKey: 'otra-key',
      convertRequestHash: 'hash',
      contractVersion: 'v1',
      result: comparacionV1,
    });

    await expect(
      service.convertToExpense('u1', 'cmp-1', 'key-nueva', {
        optionId: 'bs',
        title: 'TV',
        categoryName: 'Hogar',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
