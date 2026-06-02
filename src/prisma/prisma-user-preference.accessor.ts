import type { PrismaService } from './prisma.service';

/** Payload completo al crear/actualizar preferencias (schema actual). */
export type UserPreferenceWritableRow = Readonly<{
  userId: string;
  incomeReferenceMonth: Date;
  carryoverUsd: number;
  budgetCycleMode: string;
  budgetCutoffDay: number;
  defaultCurrency: 'BS' | 'USD';
  monthlyIncome: number;
  incomeFixedBs: number | null;
  incomeRegisteredBcvRateId: string | null;
}>;

export type UserPreferencePartialUpdate = Readonly<
  Partial<
    Omit<UserPreferenceWritableRow, 'userId' | 'budgetCycleMode' | 'budgetCutoffDay'>
  > &
    Partial<Pick<UserPreferenceWritableRow, 'budgetCycleMode' | 'budgetCutoffDay'>>
>;

type PreferenceWriteDelegate = Readonly<{
  upsert: (args: {
    where: { userId: string };
    create: UserPreferenceWritableRow;
    update: UserPreferencePartialUpdate;
  }) => Promise<unknown>;
  update: (args: {
    where: { userId: string };
    data: Pick<UserPreferenceWritableRow, 'incomeReferenceMonth' | 'carryoverUsd'>;
  }) => Promise<unknown>;
}>;

/** Campos de corte para calcular el periodo presupuestario activo. */
export type PreferenceCutoffFields = Readonly<{
  budgetCycleMode: string | null;
  budgetCutoffDay: number | null;
}>;

type PreferenceReadDelegate = Readonly<{
  findUnique: (args: {
    where: { userId: string };
    select: { budgetCycleMode: true; budgetCutoffDay: true };
  }) => Promise<PreferenceCutoffFields | null>;
}>;

/** Escrituras de UserPreference cuando el analyzer no enlaza el codegen de Prisma. */
export function preferenceWriteDb(prisma: PrismaService): PreferenceWriteDelegate {
  return (prisma as unknown as { userPreference: PreferenceWriteDelegate })
    .userPreference;
}

/** Lecturas parciales de UserPreference (ciclo/corte). */
export function preferenceReadDb(prisma: PrismaService): PreferenceReadDelegate {
  return (prisma as unknown as { userPreference: PreferenceReadDelegate })
    .userPreference;
}
