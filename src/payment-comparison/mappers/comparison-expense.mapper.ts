import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { ComparacionV1, OpcionV1 } from '../exchange-contract';
import type { ConvertComparisonExpenseDto } from '../dto/convert-comparison-expense.dto';
import { parseYmdToUtcNoon } from '../../common/utils/caracas-date';

const METODO_POR_OPCION: Record<OpcionV1['id'], 'CASH' | 'ELECTRONIC' | 'BS'> =
  {
    efectivo: 'CASH',
    electronico: 'ELECTRONIC',
    bs: 'BS',
  };

/** Hash estable para idempotencia en la fila PaymentComparison (TD-5). */
export function hashConvertRequest(
  comparisonId: string,
  dto: ConvertComparisonExpenseDto,
): string {
  const canonical = JSON.stringify({
    comparisonId,
    optionId: dto.optionId,
    title: dto.title.trim(),
    categoryId: dto.categoryId ?? null,
    categoryName: dto.categoryName?.trim() ?? null,
    profileId: dto.profileId ?? null,
    paymentDate: dto.paymentDate ?? null,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export function resolvePaymentMethodForOption(
  optionId: string,
): 'CASH' | 'ELECTRONIC' | 'BS' | null {
  return METODO_POR_OPCION[optionId] ?? null;
}

export function buildExpenseDataFromComparisonOption(input: {
  option: OpcionV1;
  result: ComparacionV1;
  title: string;
  profileId: string;
  categoryId: string;
  referenceMonth: Date;
  paymentDateYmd: string;
}): Prisma.ExpenseCreateInput {
  const paymentMethod = resolvePaymentMethodForOption(input.option.id);
  if (!paymentMethod) {
    throw new Error(`Opción de pago desconocida: ${input.option.id}`);
  }
  const oficialYmd = input.result.tasas.oficial.fechaFuente.slice(0, 10);

  return {
    profile: { connect: { id: input.profileId } },
    category: { connect: { id: input.categoryId } },
    title: input.title.trim(),
    description: '',
    amount: new Prisma.Decimal(input.option.costoRealUsd),
    isPaid: false,
    referenceMonth: input.referenceMonth,
    paymentDate: parseYmdToUtcNoon(input.paymentDateYmd),
    bcvRateApplied: new Prisma.Decimal(input.result.tasas.oficial.valor),
    bcvRateDate: parseYmdToUtcNoon(oficialYmd),
    paymentMethod,
    nominalAmount: new Prisma.Decimal(input.option.montoCobrado),
    nominalCurrency: input.option.moneda,
    commissionPct:
      input.option.comisionPct != null
        ? new Prisma.Decimal(input.option.comisionPct)
        : null,
    commissionUsd:
      input.option.comisionUsd != null
        ? new Prisma.Decimal(input.option.comisionUsd)
        : null,
    sellRate: new Prisma.Decimal(input.result.tasaVenta.valor),
    bcvEquivalentUsd: new Prisma.Decimal(input.option.equivalenteBcvUsd),
    valuationBasis: 'SELL_RATE',
  };
}
