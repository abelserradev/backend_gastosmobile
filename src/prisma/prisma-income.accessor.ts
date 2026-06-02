import type { Prisma } from '@prisma/client';
import type { PrismaService } from './prisma.service';

/** Subset de delegates de ingreso; el analyzer a veces no enlaza codegen fresco en PrismaService. */
export type PrismaIncomeDb = Readonly<{
  incomeSource: Prisma.IncomeSourceDelegate;
  incomeEntry: Prisma.IncomeEntryDelegate;
}>;

/** Filas mínimas devueltas por listados de fuentes de ingreso. */
export type IncomeSourceRow = Readonly<{
  id: string;
  name: string;
}>;

/** Ingreso con fuente incluida (include: { source: true }). */
export type IncomeEntryWithSourceRow = Readonly<{
  id: string;
  title: string;
  description: string;
  amount: Prisma.Decimal;
  referenceMonth: Date;
  receivedDate: Date | null;
  bcvRateApplied: Prisma.Decimal | null;
  bcvRateDate: Date | null;
  source: Readonly<{ name: string }>;
}>;

export function incomeDb(prisma: PrismaService): PrismaIncomeDb {
  return prisma;
}
