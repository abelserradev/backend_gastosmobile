import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { BcvRateService } from '../bcv/bcv-rate.service';
import {
  formatYmdInCaracas,
  getBudgetPeriodForCutoffDay,
  isCutoffDay,
  parseYmdToUtcNoon,
  startOfMonthYmdInCaracas,
  type BudgetPeriod,
} from '../common/utils/caracas-date';
import type { AuthUserPayload } from '../common/types/auth-user.payload';
import { type Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  incomeDb,
  type IncomeEntryWithSourceRow,
  type IncomeSourceRow,
} from '../prisma/prisma-income.accessor';
import {
  preferenceReadDb,
  preferenceWriteDb,
  type PreferenceCutoffFields,
} from '../prisma/prisma-user-preference.accessor';
import { expenseReceiptDb } from '../prisma/prisma-expense-receipt.accessor';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateExpenseWithReceiptDto } from './dto/create-expense-with-receipt.dto';
import { CreateProfileDto } from './dto/create-profile.dto';
import { DeleteExpensesDto } from './dto/delete-expenses.dto';
import { MarkExpensesPaidDto } from './dto/mark-expenses-paid.dto';
import { PatchExpenseDto } from './dto/patch-expense.dto';
import { ReplaceCategoriesDto } from './dto/replace-categories.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { MonthRolloverDto } from './dto/month-rollover.dto';
import { CreateProfileMemberDto } from './dto/create-profile-member.dto';
import {
  SubmitOcrFeedbackDto,
  type InvoiceOcrSnapshotDto,
} from './dto/submit-ocr-feedback.dto';
import {
  buildBsIncomeNarrativeLine,
  mapExpenseToResponse,
  type MePreferencesResponse,
  toReferenceMonthDate,
} from './me.mappers';
import { enmascararCorreo } from '../common/utils/mask-correo-for-log.util';
import { ResendEmailService } from '../email/resend-email.service';
import { ProfileCollaboratorService } from '../profile-collaborators/profile-collaborator.service';
import { resolveActiveBudgetContext } from '../common/utils/active-budget-context.util';
import { CreateIncomeDto } from './dto/create-income.dto';
import { DeleteIncomesDto } from './dto/delete-income.dto';
import { UpdateExpenseFieldsDto } from './dto/update-expense-fields.dto';
import { UpdateIncomeFieldsDto } from './dto/update-income-fields.dto';
import { mapIncomeToResponse } from './me.mappers';
import { DEFAULT_INCOME_SOURCES_NAMES } from './income-source.default';

/** Tasa BCV ligada al registro de ingreso en Bs. */
type IncomeRegisteredBcvRateRow = Readonly<{
  id: string;
  rateDate: Date;
  vesPerUsd: Prisma.Decimal;
  fetchedAt: Date;
}>;

/**
 * Preferencia con tasa de registro incluida.
 * Tipo estable: el analyzer a veces no enlaza campos nuevos del codegen de Prisma.
 */
type UserPreferenceWithRegRate = Readonly<{
  id: string;
  userId: string;
  updatedAt: Date;
  defaultCurrency: 'BS' | 'USD';
  monthlyIncome: Prisma.Decimal;
  incomeFixedBs: Prisma.Decimal | null;
  incomeRegisteredBcvRateId: string | null;
  incomeRegisteredBcvRate: IncomeRegisteredBcvRateRow | null;
  incomeReferenceMonth: Date | null;
  carryoverUsd: Prisma.Decimal;
  budgetCycleMode: string;
  budgetCutoffDay: number;
}>;

type PreferenceRenewalFields = Readonly<{
  incomeReferenceMonth: Date | null;
  budgetCycleMode: string | null;
  budgetCutoffDay: number | null;
}>;

function asUserPreferenceWithRegRate(
  row: unknown,
): UserPreferenceWithRegRate | null {
  return (row ?? null) as UserPreferenceWithRegRate | null;
}

/** Alineado con `OcrCorrectionSample`; evita cascadas `no-unsafe-*` cuando el proyecto TS del IDE no levanta el delegate Prisma fresco. */
type OcrCorrectionSampleInsertData = Readonly<{
  userId: string;
  expenseId: string | null;
  source: string;
  submissionVariant: string | null;
  documentKindGuess: string | null;
  parseSnapshot: Prisma.InputJsonValue;
  corrected: Prisma.InputJsonValue;
}>;

/** Firma reducida de `ocrCorrectionSample.create` para crear filas sin enlazar contra tipos codegen frágiles en el analyzer. */
type OcrCorrectionSampleCreateOp = (
  args: Readonly<{ data: OcrCorrectionSampleInsertData; select: { id: true } }>,
) => Promise<{ id: string }>;

type PrismaOcrCorrectionSubset = Readonly<{
  ocrCorrectionSample: Readonly<{ create: OcrCorrectionSampleCreateOp }>;
}>;

@Injectable()
export class MeService {
  private readonly logger = new Logger(MeService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly bcv: BcvRateService,
    private readonly resendEmail: ResendEmailService,
    private readonly profileCollaborators: ProfileCollaboratorService,
  ) {}

  /** Delegates de ingreso cuando el analyzer no enlaza el codegen de PrismaService. */
  private get incomePrisma() {
    return incomeDb(this.prisma);
  }

  private get preferencePrisma() {
    return preferenceWriteDb(this.prisma);
  }

  private get preferenceReadPrisma() {
    return preferenceReadDb(this.prisma);
  }

  private get expenseReceiptPrisma() {
    return expenseReceiptDb(this.prisma);
  }

  /**
   * Determina si el periodo de ingreso necesita renovación.
   * FEAT-001: Soporta ciclos calendario o corte configurable.
   *
   * Lógica:
   * - Calendar month: compara con inicio del mes calendario (comportamiento legacy).
   * - Monthly cutoff: el periodo actual cierra en `budgetCutoffDay` del mes.
   */
  private incomeMonthNeedsRefresh(
    pref: PreferenceRenewalFields | null,
  ): boolean {
    if (!pref?.incomeReferenceMonth) {
      return true;
    }

    const todayYmd = formatYmdInCaracas();
    const mode = pref.budgetCycleMode ?? 'calendar_month';
    const cutoffDay = pref.budgetCutoffDay ?? 1;

    if (mode === 'calendar_month') {
      // Comportamiento legacy: el periodo sigue el mes calendario
      const esperado = startOfMonthYmdInCaracas();
      const guardado = pref.incomeReferenceMonth.toISOString().slice(0, 10);
      return guardado !== esperado;
    }

    // FEAT-001: Lógica de corte mensual
    // El periodo activo se calcula con getBudgetPeriodForCutoffDay
    // Si el periodo actual (calculado) tiene un periodStart diferente al guardado,
    // significa que el corte pasó y el periodo cambió
    const period = getBudgetPeriodForCutoffDay(todayYmd, cutoffDay);
    const periodStartGuardado = pref.incomeReferenceMonth
      .toISOString()
      .slice(0, 10);

    return period.periodStart !== periodStartGuardado;
  }

  /**
   * Determina si hoy es día de corte (para mostrar renovación en UI).
   * FEAT-001: Usa el día de corte configurado o default 1.
   */
  private isCutoffDayForPreferences(
    pref: PreferenceCutoffFields | null,
  ): boolean {
    if (!pref) return false;

    const todayYmd = formatYmdInCaracas();
    const mode = pref.budgetCycleMode ?? 'calendar_month';

    if (mode === 'calendar_month') {
      // En modo calendario, el "corte" es el último día del mes calendario
      // Detectamos si mañana es el primero del mes siguiente
      const today = parseYmdToUtcNoon(todayYmd);
      const tomorrow = new Date(today);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      return tomorrow.getUTCDate() === 1;
    }

    const cutoffDay = pref.budgetCutoffDay ?? 1;
    return isCutoffDay(todayYmd, cutoffDay);
  }

  async getState(user: AuthUserPayload) {
    const userId = user.userId;

    // FEAT-001: Obtener preferencias para determinar modo de cálculo de periodo
    const pref = asUserPreferenceWithRegRate(
      await this.prisma.userPreference.findUnique({
        where: { userId },
        include: { incomeRegisteredBcvRate: true },
      }),
    );

    const budget = resolveActiveBudgetContext(pref);
    const { activeReferenceMonth, activeMonthDate, activePeriod } = budget;

    await this.ensureDefaultIncomeSources(userId);

    const [categories, profiles, expenses, incomeSources, incomes] =
      await Promise.all([
        this.prisma.category.findMany({
          where: { userId },
          orderBy: { name: 'asc' },
        }),
        this.prisma.profile.findMany({
          where: { userId },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.expense.findMany({
          where: {
            profile: { userId },
            referenceMonth: activeMonthDate,
          },
          include: { category: true, profile: true },
          orderBy: { createdAt: 'desc' },
        }),
        this.incomePrisma.incomeSource.findMany({
          where: { userId },
          orderBy: { name: 'asc' },
        }) as Promise<IncomeSourceRow[]>,
        this.incomePrisma.incomeEntry.findMany({
          where: { userId, referenceMonth: activeMonthDate },
          include: { source: true },
          orderBy: { createdAt: 'desc' },
        }) as Promise<IncomeEntryWithSourceRow[]>,
      ]);

    const needsMonthlyIncomeSetup = !pref || this.incomeMonthNeedsRefresh(pref);

    // FEAT-001: Incluir info de periodo activo en renewal si aplica
    const monthRenewal =
      pref && this.incomeMonthNeedsRefresh(pref)
        ? await this.buildMonthRenewalContext(userId, pref, activePeriod)
        : null;

    return {
      preferences: await this.mapPreferencesToResponse(pref, activePeriod),
      categories: categories.map((c) => ({ id: c.id, name: c.name })),
      profiles: profiles.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
      })),
      expenses: expenses.map((e) => mapExpenseToResponse(e)),
      incomeSources: incomeSources.map((s) => ({ id: s.id, name: s.name })),
      incomes: incomes.map((i) => mapIncomeToResponse(i)),
      activeReferenceMonth,
      activePeriod: {
        periodStart: activePeriod.periodStart,
        cutoffDate: activePeriod.cutoffDate,
        nextPeriodStart: activePeriod.nextPeriodStart,
        label: activePeriod.label,
        isCutoffToday: activePeriod.isCutoffToday,
      },
      needsMonthlyIncomeSetup,
      monthRenewal,
    };
  }

  /**
   * Cierra el periodo anterior y avanza al nuevo (renovación mensual).
   * FEAT-001: Soporta ciclos calendario y corte configurable.
   */
  async rolloverMonth(user: AuthUserPayload, dto: MonthRolloverDto) {
    const pref = asUserPreferenceWithRegRate(
      await this.prisma.userPreference.findUnique({
        where: { userId: user.userId },
        include: { incomeRegisteredBcvRate: true },
      }),
    );
    if (!pref || !this.incomeMonthNeedsRefresh(pref)) {
      throw new BadRequestException('No hay cambio de mes pendiente');
    }

    // FEAT-001: Calcular periodo activo para el contexto de renovación
    const todayYmd = formatYmdInCaracas();
    const mode = pref.budgetCycleMode ?? 'calendar_month';
    const cutoffDay = pref.budgetCutoffDay ?? 1;

    const activePeriod =
      mode === 'calendar_month'
        ? getBudgetPeriodForCutoffDay(todayYmd, 1)
        : getBudgetPeriodForCutoffDay(todayYmd, cutoffDay);

    const renewal = await this.buildMonthRenewalContext(
      user.userId,
      pref,
      activePeriod,
    );
    if (renewal.requiresSurplusPrompt && dto.applySurplus === undefined) {
      throw new BadRequestException(
        'Indica si deseas sumar el saldo sobrante al mes entrante',
      );
    }
    const carryoverUsd =
      renewal.requiresSurplusPrompt && dto.applySurplus === true
        ? renewal.surplusUsd
        : 0;

    // FEAT-001: Pasar preferencias para determinar el nuevo periodo correctamente
    await this.advanceIncomeReferenceMonth(user.userId, carryoverUsd, pref);

    const fresh = asUserPreferenceWithRegRate(
      await this.prisma.userPreference.findUnique({
        where: { userId: user.userId },
        include: { incomeRegisteredBcvRate: true },
      }),
    );

    // Recalcular periodo activo con las nuevas preferencias
    const newPeriod =
      mode === 'calendar_month'
        ? getBudgetPeriodForCutoffDay(todayYmd, 1)
        : getBudgetPeriodForCutoffDay(todayYmd, cutoffDay);

    const mapped = await this.mapPreferencesToResponse(fresh, newPeriod);
    if (!mapped) {
      throw new BadRequestException('No se pudieron leer las preferencias');
    }
    return mapped;
  }

  /**
   * Actualiza las preferencias del usuario, incluyando configuración de ciclo presupuestario.
   * FEAT-001: Soporta cambio de modo de ciclo y día de corte.
   */
  async updatePreferences(user: AuthUserPayload, dto: UpdatePreferencesDto) {
    const uid = user.userId;
    const prefBefore = await this.loadUserPreference(uid);

    const currentMode = prefBefore?.budgetCycleMode ?? 'calendar_month';
    const currentCutoff = prefBefore?.budgetCutoffDay ?? 1;
    const newMode = dto.budgetCycle?.mode ?? currentMode;
    const newCutoff = dto.budgetCycle?.cutoffDay ?? currentCutoff;
    const monthStale = this.incomeMonthNeedsRefresh(prefBefore);
    const todayYmd = formatYmdInCaracas();

    const activePeriodBefore = this.budgetPeriodForMode(
      currentMode,
      currentCutoff,
      todayYmd,
    );
    const renewal =
      prefBefore && monthStale
        ? await this.buildMonthRenewalContext(
            uid,
            prefBefore,
            activePeriodBefore,
          )
        : null;

    this.assertApplySurplusProvidedWhenRequired(renewal, dto.applySurplus);

    const incomeRef = toReferenceMonthDate(
      this.incomeRefYmdForMode(newMode, newCutoff, todayYmd),
    );
    const carryoverUsd = this.resolveCarryoverUsdOnPreferenceUpdate(
      renewal,
      monthStale,
      prefBefore,
      dto.applySurplus,
    );
    const budgetCycle = dto.budgetCycle
      ? { mode: dto.budgetCycle.mode, cutoffDay: dto.budgetCycle.cutoffDay }
      : undefined;

    await this.persistPreferenceByCurrency(
      uid,
      dto,
      incomeRef,
      carryoverUsd,
      budgetCycle,
    );

    const fresh = await this.loadUserPreference(uid);
    const activePeriodAfter = this.budgetPeriodForMode(
      newMode,
      newCutoff,
      todayYmd,
    );
    const mapped = await this.mapPreferencesToResponse(
      fresh,
      activePeriodAfter,
    );
    if (!mapped) {
      throw new BadRequestException('No se pudieron leer las preferencias');
    }
    return mapped;
  }

  private async loadUserPreference(
    userId: string,
  ): Promise<UserPreferenceWithRegRate | null> {
    return asUserPreferenceWithRegRate(
      await this.prisma.userPreference.findUnique({
        where: { userId },
        include: { incomeRegisteredBcvRate: true },
      }),
    );
  }

  private budgetPeriodForMode(
    mode: string,
    cutoffDay: number,
    todayYmd: string,
  ): BudgetPeriod {
    if (mode === 'calendar_month') {
      return getBudgetPeriodForCutoffDay(todayYmd, 1);
    }
    return getBudgetPeriodForCutoffDay(todayYmd, cutoffDay);
  }

  private incomeRefYmdForMode(
    mode: string,
    cutoffDay: number,
    todayYmd: string,
  ): string {
    if (mode === 'calendar_month') {
      return startOfMonthYmdInCaracas();
    }
    return getBudgetPeriodForCutoffDay(todayYmd, cutoffDay).periodStart;
  }

  private assertApplySurplusProvidedWhenRequired(
    renewal: { requiresSurplusPrompt: boolean } | null,
    applySurplus: boolean | undefined,
  ): void {
    if (renewal?.requiresSurplusPrompt && applySurplus === undefined) {
      throw new BadRequestException(
        'Indica si deseas sumar el saldo sobrante al mes entrante',
      );
    }
  }

  private resolveCarryoverUsdOnPreferenceUpdate(
    renewal: { requiresSurplusPrompt: boolean; surplusUsd: number } | null,
    monthStale: boolean,
    prefBefore: UserPreferenceWithRegRate | null,
    applySurplus: boolean | undefined,
  ): number {
    if (renewal?.requiresSurplusPrompt && applySurplus === true) {
      return renewal.surplusUsd;
    }
    if (monthStale) {
      return 0;
    }
    return Number(prefBefore?.carryoverUsd?.toString() ?? 0);
  }

  private async persistPreferenceByCurrency(
    uid: string,
    dto: UpdatePreferencesDto,
    incomeRef: Date,
    carryoverUsd: number,
    budgetCycle?: {
      mode: 'calendar_month' | 'monthly_cutoff';
      cutoffDay: number;
    },
  ): Promise<void> {
    if (dto.defaultCurrency === 'USD') {
      if (dto.monthlyIncome == null) {
        throw new BadRequestException('Indica el ingreso en USD');
      }
      await this.saveUserPreference(
        uid,
        incomeRef,
        carryoverUsd,
        {
          defaultCurrency: 'USD',
          monthlyIncome: dto.monthlyIncome,
          incomeFixedBs: null,
          incomeRegisteredBcvRateId: null,
        },
        budgetCycle,
      );
      return;
    }
    await this.updateBsPreferences(
      uid,
      incomeRef,
      carryoverUsd,
      dto,
      budgetCycle,
    );
  }

  /**
   * Maneja el flujo BS: nominal en Bs (nuevo) o equivalente USD heredado (cliente antiguo).
   * FEAT-001: Incluye configuración del ciclo presupuestario.
   */
  private async updateBsPreferences(
    uid: string,
    incomeRef: Date,
    carryoverUsd: number,
    dto: UpdatePreferencesDto,
    budgetCycle?: {
      mode: 'calendar_month' | 'monthly_cutoff';
      cutoffDay: number;
    },
  ) {
    const tieneBsNominal =
      dto.monthlyIncomeBs != null && dto.monthlyIncomeBs > 0;
    if (tieneBsNominal) {
      const ymd = formatYmdInCaracas();
      const { vesPerUsd, rateDate } =
        await this.bcv.getVesPerUsdForCalendarDay(ymd);
      const rateRow = await this.prisma.bcVOfficialRate.findUnique({
        where: { rateDate },
      });
      if (!rateRow) {
        throw new ServiceUnavailableException(
          'No se pudo registrar la tasa del día',
        );
      }
      const usdCaptura = dto.monthlyIncomeBs! / Number(vesPerUsd.toString());
      await this.saveUserPreference(
        uid,
        incomeRef,
        carryoverUsd,
        {
          defaultCurrency: 'BS',
          monthlyIncome: usdCaptura,
          incomeFixedBs: dto.monthlyIncomeBs!,
          incomeRegisteredBcvRateId: rateRow.id,
        },
        budgetCycle,
      );
      return;
    }

    if (dto.monthlyIncome != null) {
      // Cliente antiguo: solo guardaba USD equivalente; sin monto fijo en Bs.
      await this.saveUserPreference(
        uid,
        incomeRef,
        carryoverUsd,
        {
          defaultCurrency: 'BS',
          monthlyIncome: dto.monthlyIncome,
          incomeFixedBs: null,
          incomeRegisteredBcvRateId: null,
        },
        budgetCycle,
      );
      return;
    }

    throw new BadRequestException(
      'Indica el ingreso en bolívares (monthlyIncomeBs) o el equivalente (formato anterior)',
    );
  }

  /**
   * Upsert unificado para preferencias del usuario.
   * FEAT-001: Incluye campos de configuración del ciclo presupuestario.
   */
  private async saveUserPreference(
    uid: string,
    incomeRef: Date,
    carryoverUsd: number,
    data: {
      defaultCurrency: 'USD' | 'BS';
      monthlyIncome: number;
      incomeFixedBs: number | null;
      incomeRegisteredBcvRateId: string | null;
    },
    budgetCycle?: {
      mode: 'calendar_month' | 'monthly_cutoff';
      cutoffDay: number;
    },
  ) {
    // Preparar datos de ciclo presupuestario si se proporcionan
    const cycleData = budgetCycle
      ? {
          budgetCycleMode: budgetCycle.mode,
          budgetCutoffDay: budgetCycle.cutoffDay,
        }
      : {};

    await this.preferencePrisma.upsert({
      where: { userId: uid },
      create: {
        userId: uid,
        incomeReferenceMonth: incomeRef,
        carryoverUsd,
        budgetCycleMode: budgetCycle?.mode ?? 'calendar_month',
        budgetCutoffDay: budgetCycle?.cutoffDay ?? 1,
        ...data,
      },
      update: {
        incomeReferenceMonth: incomeRef,
        carryoverUsd,
        ...data,
        ...cycleData,
      },
    });
  }

  /**
   * Avanza el mes/periodo de referencia de ingreso al nuevo periodo.
   * FEAT-001: Soporta tanto mes calendario como corte configurable.
   */
  private async advanceIncomeReferenceMonth(
    userId: string,
    carryoverUsd: number,
    pref?: PreferenceCutoffFields | null,
  ): Promise<void> {
    const todayYmd = formatYmdInCaracas();
    const mode = pref?.budgetCycleMode ?? 'calendar_month';
    const cutoffDay = pref?.budgetCutoffDay ?? 1;

    let incomeRefYmd: string;

    if (mode === 'calendar_month') {
      // Legacy: primer día del mes calendario actual
      incomeRefYmd = startOfMonthYmdInCaracas();
    } else {
      // FEAT-001: Inicio del periodo actual (día después del corte)
      const period = getBudgetPeriodForCutoffDay(todayYmd, cutoffDay);
      incomeRefYmd = period.periodStart;
    }

    const incomeRef = toReferenceMonthDate(incomeRefYmd);
    await this.preferencePrisma.update({
      where: { userId },
      data: { incomeReferenceMonth: incomeRef, carryoverUsd },
    });
  }

  /**
   * Construye el contexto de renovación mensual (cierre de periodo + sobrante).
   * FEAT-001: Usa el periodo activo calculado para determinar el cierre.
   *
   * @param activePeriod - Periodo activo calculado (con cutoffDate como fin del periodo)
   */
  private async buildMonthRenewalContext(
    userId: string,
    pref: UserPreferenceWithRegRate,
    activePeriod?: BudgetPeriod,
  ): Promise<{
    closingMonthYmd: string;
    surplusUsd: number;
    requiresSurplusPrompt: boolean;
  }> {
    // FEAT-001: El periodo que cierra es el anterior al activo
    // Si hay activePeriod, el cierre fue en cutoffDate del periodo anterior
    let closingMonthYmd: string;

    if (activePeriod) {
      // El periodo activo va desde periodStart hasta cutoffDate
      // El periodo que cierra terminó el día antes del periodStart actual
      const periodStart = parseYmdToUtcNoon(activePeriod.periodStart);
      const closingDate = new Date(periodStart);
      closingDate.setUTCDate(closingDate.getUTCDate() - 1);
      closingMonthYmd = formatYmdInCaracas(closingDate);
    } else {
      // Fallback legacy
      closingMonthYmd = pref.incomeReferenceMonth!.toISOString().slice(0, 10);
    }

    const closingMonthDate = toReferenceMonthDate(closingMonthYmd);
    const surplusUsd = await this.computeClosingMonthSurplusUsd(
      userId,
      pref,
      closingMonthDate,
    );
    return {
      closingMonthYmd,
      surplusUsd,
      requiresSurplusPrompt: surplusUsd > 0,
    };
  }

  private async computeClosingMonthSurplusUsd(
    userId: string,
    pref: UserPreferenceWithRegRate,
    closingMonthDate: Date,
  ): Promise<number> {
    const mapped = await this.mapPreferencesToResponse(pref);
    if (!mapped) {
      return 0;
    }
    const effectiveIncome = mapped.effectiveMonthlyIncomeUsd;
    const [paidAgg, incomeAgg] = await Promise.all([
      this.prisma.expense.aggregate({
        where: {
          profile: { userId },
          referenceMonth: closingMonthDate,
          isPaid: true,
        },
        _sum: { amount: true },
      }),
      this.incomePrisma.incomeEntry.aggregate({
        where: { userId, referenceMonth: closingMonthDate },
        _sum: { amount: true },
      }),
    ]);
    const paidUsd = Number(paidAgg._sum.amount?.toString() ?? 0);
    const loggedIncomeUsd = Number(incomeAgg._sum.amount?.toString() ?? 0);
    const surplus = effectiveIncome + loggedIncomeUsd - paidUsd;
    if (surplus <= 0) {
      return 0;
    }
    return Math.round(surplus * 100) / 100;
  }

  private withEffectiveIncome(
    base: MePreferencesResponse,
    carryoverUsd: number,
  ): MePreferencesResponse {
    return {
      ...base,
      carryoverUsd,
      effectiveMonthlyIncomeUsd:
        Math.round((base.monthlyIncome + carryoverUsd) * 100) / 100,
    };
  }

  async replaceCategories(user: AuthUserPayload, dto: ReplaceCategoriesDto) {
    const userId = user.userId;
    const names = [...new Set(dto.names.map((n) => n.trim()).filter(Boolean))];
    if (names.length === 0) {
      throw new BadRequestException('Se requiere al menos una categoría');
    }
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.category.findMany({ where: { userId } });
      const nameSet = new Set(names);
      for (const cat of existing) {
        if (!nameSet.has(cat.name)) {
          const cnt = await tx.expense.count({
            where: { categoryId: cat.id },
          });
          if (cnt > 0) {
            throw new BadRequestException(
              `No se puede quitar la categoría "${cat.name}" porque tiene gastos asociados`,
            );
          }
          await tx.category.delete({ where: { id: cat.id } });
        }
      }
      for (const name of names) {
        await tx.category.upsert({
          where: { userId_name: { userId, name } },
          create: { userId, name },
          update: {},
        });
      }
    });
    return this.prisma.category.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }

  listProfiles(user: AuthUserPayload) {
    return this.profileCollaborators.listProfilesForUser(user.userId);
  }

  async createProfile(user: AuthUserPayload, dto: CreateProfileDto) {
    const created = await this.prisma.profile.create({
      data: {
        userId: user.userId,
        name: dto.name.trim(),
        type: dto.type,
      },
      select: { id: true, name: true, type: true },
    });
    return { ...created, access: 'owner' as const };
  }

  async deleteProfile(user: AuthUserPayload, profileId: string) {
    const row = await this.prisma.profile.findFirst({
      where: { id: profileId, userId: user.userId },
    });
    if (!row) {
      throw new NotFoundException('Perfil no encontrado');
    }
    await this.prisma.profile.delete({ where: { id: profileId } });
  }

  async listProfileMembers(user: AuthUserPayload, profileId: string) {
    const p = await this.prisma.profile.findFirst({
      where: { id: profileId, userId: user.userId },
      select: { id: true },
    });
    if (!p) {
      throw new NotFoundException('Perfil no encontrado');
    }
    return this.prisma.profileMember.findMany({
      where: { profileId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, displayName: true, createdAt: true },
    });
  }

  async createProfileMember(
    user: AuthUserPayload,
    profileId: string,
    dto: CreateProfileMemberDto,
  ) {
    const p = await this.prisma.profile.findFirst({
      where: { id: profileId, userId: user.userId },
      select: { id: true },
    });
    if (!p) {
      throw new NotFoundException('Perfil no encontrado');
    }
    const displayName = dto.displayName.trim();
    return this.prisma.profileMember.create({
      data: { profileId, displayName },
      select: { id: true, displayName: true, createdAt: true },
    });
  }

  async deleteProfileMember(
    user: AuthUserPayload,
    profileId: string,
    memberId: string,
  ) {
    const p = await this.prisma.profile.findFirst({
      where: { id: profileId, userId: user.userId },
      select: { id: true },
    });
    if (!p) {
      throw new NotFoundException('Perfil no encontrado');
    }
    const row = await this.prisma.profileMember.findFirst({
      where: { id: memberId, profileId },
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException('Integrante no encontrado');
    }
    await this.prisma.profileMember.delete({ where: { id: memberId } });
  }

  async listExpenses(user: AuthUserPayload) {
    const { activeMonthDate } = await this.getActiveBudgetContextForUser(
      user.userId,
    );
    const rows = await this.prisma.expense.findMany({
      where: {
        profile: { userId: user.userId },
        referenceMonth: activeMonthDate,
      },
      include: { category: true, profile: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((e) => mapExpenseToResponse(e));
  }

  async listExpenseHistoryMonths(user: AuthUserPayload) {
    const userId = user.userId;
    const groups = await this.prisma.expense.groupBy({
      by: ['referenceMonth'],
      where: { profile: { userId } },
      _count: { _all: true },
      _sum: { amount: true },
      orderBy: { referenceMonth: 'desc' },
    });
    return groups.map((g) => ({
      month: g.referenceMonth.toISOString().slice(0, 10),
      expenseCount: g._count._all,
      totalAmountUsd: Number(g._sum.amount?.toString() ?? '0'),
    }));
  }

  async listExpenseHistoryForMonth(user: AuthUserPayload, ym: string) {
    if (!/^\d{4}-\d{2}$/.test(ym)) {
      throw new BadRequestException('Mes inválido (formato YYYY-MM)');
    }
    const ref = toReferenceMonthDate(`${ym}-01`);
    const rows = await this.prisma.expense.findMany({
      where: { profile: { userId: user.userId }, referenceMonth: ref },
      include: { category: true, profile: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((e) => mapExpenseToResponse(e));
  }

  async createExpense(user: AuthUserPayload, dto: CreateExpenseDto) {
    const userId = user.userId;
    const categoryId = await this.findCategoryOrThrow(userId, {
      id: dto.categoryId,
      name: dto.categoryName,
    });
    const profileId = await this.resolveProfileId(userId, dto.profileId);
    const budget = await this.getActiveBudgetContextForUser(userId);
    const refStr = dto.referenceMonth ?? budget.activeReferenceMonth;
    const rateYmd = dto.paymentDate ?? formatYmdInCaracas();
    const { vesPerUsd, rateDate } =
      await this.bcv.getVesPerUsdForCalendarDay(rateYmd);
    const paymentDate = parseYmdToUtcNoon(rateYmd);
    const row = await this.prisma.expense.create({
      data: {
        profileId,
        categoryId,
        title: dto.title.trim(),
        description: dto.description?.trim() ?? '',
        amount: dto.amount,
        referenceMonth: toReferenceMonthDate(refStr),
        paymentDate,
        bcvRateApplied: vesPerUsd,
        bcvRateDate: rateDate,
      },
      include: { category: true, profile: true },
    });
    return mapExpenseToResponse(row);
  }

  /**
   * Crea un gasto con el comprobante/factura adjunto en la misma operación.
   * El amount puede llegar en BS o USD; si es BS se convierte con la tasa BCV del día indicado.
   */
  async createExpenseWithReceipt(
    user: AuthUserPayload,
    dto: CreateExpenseWithReceiptDto,
    imageBuffer: Buffer,
    imageMime: string,
  ) {
    const userId = user.userId;
    const categoryId = await this.findCategoryOrThrow(userId, {
      name: dto.categoryName,
    });
    const profileId = await this.resolveProfileId(userId, undefined);
    const rateYmd = dto.paymentDate ?? formatYmdInCaracas();
    const { vesPerUsd, rateDate } =
      await this.bcv.getVesPerUsdForCalendarDay(rateYmd);
    const paymentDate = parseYmdToUtcNoon(rateYmd);
    const budget = await this.getActiveBudgetContextForUser(userId);
    const refStr = budget.activeReferenceMonth;

    const vesPerUsdNum = Number(vesPerUsd.toString());
    const amountUsd =
      dto.amountCurrency === 'BS' ? dto.amount / vesPerUsdNum : dto.amount;

    // Título autogenerado si no viene del frontend: "Factura · YYYY-MM-DD" o "Pago · ..."
    const title = dto.title?.trim() || `Comprobante · ${rateYmd}`;

    const row = await this.expenseReceiptPrisma.create({
      data: {
        profileId,
        categoryId,
        title,
        description: '',
        amount: amountUsd,
        referenceMonth: toReferenceMonthDate(refStr),
        paymentDate,
        bcvRateApplied: vesPerUsd,
        bcvRateDate: rateDate,
        receiptImage: new Uint8Array(imageBuffer),
        receiptMime: imageMime,
      },
      include: { category: true, profile: true },
    });
    return mapExpenseToResponse(row);
  }

  /**
   * Devuelve los bytes de la imagen del comprobante.
   * Lanza 404 si el gasto no existe, no pertenece al usuario, o no tiene imagen.
   */
  async getExpenseReceipt(
    user: AuthUserPayload,
    expenseId: string,
  ): Promise<{ buffer: Buffer; mime: string }> {
    const row = await this.expenseReceiptPrisma.findFirst({
      where: { id: expenseId, profile: { userId: user.userId } },
      select: { receiptImage: true, receiptMime: true },
    });
    if (!row?.receiptImage) {
      throw new NotFoundException('Este gasto no tiene imagen adjunta');
    }
    return {
      buffer: Buffer.from(row.receiptImage),
      mime: row.receiptMime ?? 'image/jpeg',
    };
  }

  async patchExpense(
    user: AuthUserPayload,
    expenseId: string,
    dto: PatchExpenseDto,
  ) {
    const row = await this.prisma.expense.findFirst({
      where: { id: expenseId, profile: { userId: user.userId } },
      include: { category: true, profile: true },
    });
    if (!row) throw new NotFoundException('Gasto no encontrado');

    if (!dto.isPaid) {
      const updated = await this.prisma.expense.update({
        where: { id: expenseId },
        data: {
          isPaid: false,
          paidByDisplayName: null,
          paidByMemberId: null,
          paidAt: null,
        },
        include: { category: true, profile: true },
      });
      return mapExpenseToResponse(updated);
    }

    const paidByMemberId = dto.paidByMemberId?.trim();
    const fallback = dto.paidByDisplayName?.trim();
    if (!paidByMemberId && !fallback) {
      throw new BadRequestException('Indica quién pagó');
    }
    const paidByDisplayName = await this.resolvePaidByDisplayName(
      user.userId,
      paidByMemberId,
      fallback ?? '',
    );

    const updated = await this.prisma.expense.update({
      where: { id: expenseId },
      data: {
        isPaid: true,
        paidByDisplayName,
        paidByMemberId: paidByMemberId ?? null,
        paidAt: new Date(),
      },
      include: { category: true, profile: true },
    });
    // La app usa POST /me/expenses/mark-paid; este path cubre marcado vía PATCH directo.
    this.logger.log(
      `[Pago gastos] Un gasto marcado pagado (PATCH), avisando por correo a ${enmascararCorreo(user.email)}`,
    );
    this.firePaidEmailSilently(user.email, paidByDisplayName, [
      {
        expenseTitle: updated.title,
        categoryName: updated.category.name,
        amountUsd: Number(updated.amount),
        profileName: paidByDisplayName, // consistente con el flujo bulk
      },
    ]);
    return mapExpenseToResponse(updated);
  }

  async markExpensesPaid(user: AuthUserPayload, dto: MarkExpensesPaidDto) {
    const uniqueIds = [...new Set(dto.ids)];
    this.logger.log(
      `[Pago gastos] Pedido bulk: ${uniqueIds.length} gasto(s), user=${user.userId}`,
    );
    const rows = await this.prisma.expense.findMany({
      where: { id: { in: uniqueIds }, profile: { userId: user.userId } },
      include: { category: true, profile: true },
    });
    if (rows.length !== uniqueIds.length) {
      throw new BadRequestException(
        'Uno o más gastos no existen o no pertenecen a tu cuenta',
      );
    }
    if (rows.some((r) => r.isPaid)) {
      throw new BadRequestException(
        'Solo se pueden marcar gastos pendientes; quitá los ya pagados de la selección',
      );
    }

    const paidByMemberId = dto.paidByMemberId?.trim();
    let paidByDisplayName = dto.paidByDisplayName.trim();
    if (paidByMemberId) {
      // El integrante pertenece al perfil del PAGADOR, no al perfil del gasto.
      // Validamos contra userId para cubrir gastos de distintos perfiles en un solo bulk.
      paidByDisplayName = await this.resolvePaidByDisplayName(
        user.userId,
        paidByMemberId,
        paidByDisplayName,
      );
    }

    await this.prisma.expense.updateMany({
      where: { id: { in: uniqueIds } },
      data: {
        isPaid: true,
        paidByDisplayName,
        paidByMemberId: paidByMemberId ?? null,
        paidAt: new Date(),
      },
    });

    const updated = await this.prisma.expense.findMany({
      where: { id: { in: uniqueIds } },
      include: { category: true, profile: true },
    });
    const orderMap = new Map(uniqueIds.map((id, idx) => [id, idx]));
    updated.sort(
      (a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0),
    );

    this.logger.log(
      `[Pago gastos] BD actualizada; mandando resumen por correo a ${enmascararCorreo(user.email)} (${uniqueIds.length} ítem(s))`,
    );
    this.firePaidEmailSilently(
      user.email,
      paidByDisplayName,
      updated.map((e) => ({
        expenseTitle: e.title,
        categoryName: e.category.name,
        amountUsd: Number(e.amount),
        // El perfil del correo debe ser quien pagó, no el perfil propietario
        // del gasto (e.profile.name), que puede ser un grupo distinto y confunde.
        profileName: paidByDisplayName,
      })),
    );
    return updated.map((e) => mapExpenseToResponse(e));
  }

  async deleteExpenses(user: AuthUserPayload, dto: DeleteExpensesDto) {
    const userId = user.userId;
    const deletable = await this.prisma.expense.findMany({
      where: {
        id: { in: dto.ids },
        profile: { userId },
      },
      select: { id: true },
    });
    const allowed = new Set(deletable.map((d) => d.id));
    if (allowed.size === 0) {
      return { deleted: 0 };
    }
    await this.prisma.expense.deleteMany({
      where: { id: { in: [...allowed] } },
    });
    return { deleted: allowed.size };
  }

  /**
   * Mapea preferencias de Prisma a respuesta de API.
   * FEAT-001: Incluye información del ciclo presupuestario.
   */
  private async mapPreferencesToResponse(
    pref: UserPreferenceWithRegRate | null,
    activePeriod?: BudgetPeriod,
  ): Promise<MePreferencesResponse | null> {
    if (!pref) {
      return null;
    }
    const monthlyStored = Number(pref.monthlyIncome.toString());
    const carryoverUsd = Number(pref.carryoverUsd?.toString() ?? 0);

    // FEAT-001: Incluir configuración del ciclo presupuestario
    const budgetCycle = {
      mode: (pref.budgetCycleMode ?? 'calendar_month') as
        | 'calendar_month'
        | 'monthly_cutoff',
      cutoffDay: pref.budgetCutoffDay ?? 1,
    };

    const base: MePreferencesResponse = {
      defaultCurrency: pref.defaultCurrency,
      monthlyIncome: monthlyStored,
      incomeFixedBs: null,
      incomeReferenceMonth: pref.incomeReferenceMonth
        ? pref.incomeReferenceMonth.toISOString().slice(0, 10)
        : null,
      monthlyIncomeUsdAtRegistration: null,
      bcvVesPerUsdNow: null,
      bcvRateDateNow: null,
      bcvVesPerUsdAtRegistration: null,
      bcvRateDateAtRegistration: null,
      usdEquivalentDelta: null,
      bsIncomeNarrative: null,
      bcvQuoteIsStale: false,
      carryoverUsd,
      effectiveMonthlyIncomeUsd: monthlyStored + carryoverUsd,
      budgetCycle,
    };
    if (pref.defaultCurrency !== 'BS') {
      return this.withEffectiveIncome(base, carryoverUsd);
    }
    const nominalBs =
      pref.incomeFixedBs == null ? null : Number(pref.incomeFixedBs.toString());
    if (nominalBs == null) {
      return this.withEffectiveIncome(
        {
          ...base,
          defaultCurrency: 'BS',
          monthlyIncome: monthlyStored,
        },
        carryoverUsd,
      );
    }
    const reg = pref.incomeRegisteredBcvRate;
    const vesReg = reg ? Number(reg.vesPerUsd.toString()) : null;
    const dateReg = reg ? reg.rateDate.toISOString().slice(0, 10) : null;
    if (vesReg == null || vesReg <= 0 || dateReg == null) {
      return this.withEffectiveIncome(
        {
          ...base,
          defaultCurrency: 'BS',
          monthlyIncome: monthlyStored,
          incomeFixedBs: nominalBs,
        },
        carryoverUsd,
      );
    }
    const usdAlRegistrar = nominalBs / vesReg;
    let latest: {
      vesPerUsd: Prisma.Decimal;
      rateDate: Date;
      usedFallback: boolean;
    };
    try {
      latest = await this.bcv.getLatestVesPerUsdPreferToday();
    } catch {
      return this.withEffectiveIncome(
        {
          ...base,
          defaultCurrency: 'BS',
          monthlyIncome: monthlyStored,
          incomeFixedBs: nominalBs,
          monthlyIncomeUsdAtRegistration: usdAlRegistrar,
          bcvVesPerUsdAtRegistration: vesReg,
          bcvRateDateAtRegistration: dateReg,
          bcvQuoteIsStale: true,
        },
        carryoverUsd,
      );
    }
    const vesAhora = Number(latest.vesPerUsd.toString());
    const dateNow = latest.rateDate.toISOString().slice(0, 10);
    const usdAhora = nominalBs / vesAhora;
    const delta = usdAhora - usdAlRegistrar;
    return this.withEffectiveIncome(
      {
        ...base,
        defaultCurrency: 'BS',
        monthlyIncome: usdAhora,
        incomeFixedBs: nominalBs,
        monthlyIncomeUsdAtRegistration: usdAlRegistrar,
        bcvVesPerUsdNow: vesAhora,
        bcvRateDateNow: dateNow,
        bcvVesPerUsdAtRegistration: vesReg,
        bcvRateDateAtRegistration: dateReg,
        usdEquivalentDelta: delta,
        bsIncomeNarrative: buildBsIncomeNarrativeLine({
          nominalBs,
          usdNow: usdAhora,
          usdAtReg: usdAlRegistrar,
          vesNow: vesAhora,
          vesReg,
          dateRegYmd: dateReg,
          dateNowYmd: dateNow,
          stale: latest.usedFallback,
        }),
        bcvQuoteIsStale: latest.usedFallback,
      },
      carryoverUsd,
    );
  }

  /** Lookup unificado de categoría por id o nombre; evita duplicar la misma query en dos métodos. */
  private async findCategoryOrThrow(
    userId: string,
    opts: { id?: string; name?: string },
  ): Promise<string> {
    if (opts.id) {
      const cat = await this.prisma.category.findFirst({
        where: { id: opts.id, userId },
      });
      if (!cat) throw new BadRequestException('Categoría inválida');
      return cat.id;
    }
    const name = opts.name?.trim();
    if (!name)
      throw new BadRequestException('Indica categoría por id o nombre');
    const cat = await this.prisma.category.findFirst({
      where: { userId, name },
    });
    if (!cat) throw new BadRequestException(`No existe la categoría "${name}"`);
    return cat.id;
  }

  /**
   * Resuelve el nombre de quien pagó.
   * Si hay memberId lo busca en cualquier perfil del usuario (no del gasto)
   * y devuelve "Nombre (Perfil)" para que el correo sea explícito.
   */
  private async resolvePaidByDisplayName(
    userId: string,
    memberId: string | undefined,
    fallbackName: string,
  ): Promise<string> {
    if (!memberId) return fallbackName;
    const member = await this.prisma.profileMember.findFirst({
      where: { id: memberId, profile: { userId } },
      include: { profile: { select: { name: true } } },
    });
    if (!member) throw new BadRequestException('Integrante inválido');
    return `${member.displayName} (${member.profile.name})`;
  }

  /** Fire-and-forget: el correo de resumen nunca debe romper el flujo principal. */
  private firePaidEmailSilently(
    to: string,
    paidByDisplayName: string,
    items: Array<{
      expenseTitle: string;
      categoryName: string;
      amountUsd: number;
      profileName: string;
    }>,
  ): void {
    const destino = enmascararCorreo(to);
    this.logger.log(
      `[Pago gastos] Encolando correo de resumen (${items.length} gasto(s)) → ${destino}`,
    );
    this.resendEmail
      .sendExpensesPaidSummaryEmail({ to, paidByDisplayName, items })
      .catch((err: unknown) => {
        this.logger.warn(
          `[Pago gastos] El correo de pagos se fue en la olla (${destino}): ${String(err)}`,
        );
      });
  }

  private snapshotDtoToJson(
    snapshot: InvoiceOcrSnapshotDto,
  ): Prisma.InputJsonValue {
    const rt = snapshot.rawText ?? '';
    const maxChars = 8192;
    const clipped = rt.length <= maxChars ? rt : rt.slice(0, maxChars);
    const j: Prisma.JsonObject = {
      rawText: clipped,
      confidence: snapshot.confidence,
      currency: snapshot.currency,
    };
    if (snapshot.amount !== undefined) j.amount = snapshot.amount;
    if (snapshot.date !== undefined) j.date = snapshot.date;
    if (snapshot.merchant !== undefined) j.merchant = snapshot.merchant;
    if (snapshot.description !== undefined) {
      j.description = snapshot.description;
    }
    return j;
  }

  private correctedDtoToJson(
    corrected: SubmitOcrFeedbackDto['corrected'],
  ): Prisma.InputJsonValue {
    const j: Prisma.JsonObject = {
      title: corrected.title,
      amountUsd: corrected.amountUsd,
    };
    if (corrected.description !== undefined) {
      j.description = corrected.description;
    }
    if (corrected.paymentDate !== undefined) {
      j.paymentDate = corrected.paymentDate;
    }
    if (corrected.currencyCapture !== undefined) {
      j.currencyCapture = corrected.currencyCapture;
    }
    if (corrected.categoryName !== undefined) {
      j.categoryName = corrected.categoryName;
    }
    if (corrected.bankLabel !== undefined) {
      j.bankLabel = corrected.bankLabel;
    }
    return j;
  }

  /**
   * Almacena predicción vs corrección humana sin bloquear el flujo gasto/OCR (v1.3 FEAT-OCR-FB).
   */
  async submitOcrFeedback(
    user: AuthUserPayload,
    dto: SubmitOcrFeedbackDto,
  ): Promise<{ id: string }> {
    if (dto.expenseId) {
      const ok = await this.prisma.expense.findFirst({
        where: {
          id: dto.expenseId,
          profile: { userId: user.userId },
        },
        select: { id: true },
      });
      if (!ok) {
        throw new BadRequestException(
          'Gasto inválido o no pertenece a tu cuenta',
        );
      }
    }
    const insertPayload: OcrCorrectionSampleInsertData = {
      userId: user.userId,
      expenseId: dto.expenseId ?? null,
      source: dto.source,
      submissionVariant: dto.submissionVariant ?? null,
      documentKindGuess: dto.documentKindGuess ?? null,
      parseSnapshot: this.snapshotDtoToJson(dto.parseSnapshot),
      corrected: this.correctedDtoToJson(dto.corrected),
    };
    // El runtime es PrismaService; el analyzer a veces no enlaza codegen → subset explícito
    const prismaOcrSubset = this.prisma as unknown as PrismaOcrCorrectionSubset;
    const row = await prismaOcrSubset.ocrCorrectionSample.create({
      data: insertPayload,
      select: { id: true },
    });
    return { id: row.id };
  }

  private async resolveProfileId(
    userId: string,
    profileId: string | undefined,
  ): Promise<string> {
    if (profileId) {
      const p = await this.prisma.profile.findFirst({
        where: { id: profileId, userId },
      });
      if (!p) {
        throw new BadRequestException('Perfil inválido');
      }
      return p.id;
    }
    const first = await this.prisma.profile.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    if (!first) {
      throw new BadRequestException(
        'Crea al menos un perfil antes de registrar gastos',
      );
    }
    return first.id;
  }

  private async ensureDefaultIncomeSources(userId: string): Promise<void> {
    const count = await this.incomePrisma.incomeSource.count({
      where: { userId },
    });
    if (count > 0) return;

    await this.incomePrisma.incomeSource.createMany({
      data: DEFAULT_INCOME_SOURCES_NAMES.map((name) => ({ userId, name })),
      skipDuplicates: true,
    });
  }

  private async findIncomeSourceOrThrow(
    userId: string,
    opts: { id?: string; name?: string },
  ): Promise<string> {
    await this.ensureDefaultIncomeSources(userId);
    if (opts.id) {
      const row = await this.incomePrisma.incomeSource.findFirst({
        where: { id: opts.id, userId },
      });
      if (!row) throw new BadRequestException('Fuente de ingreso inválida');
      return row.id;
    }
    const name = opts.name?.trim();
    if (!name) {
      throw new BadRequestException('Indica fuente por id o nombre');
    }
    const row = await this.incomePrisma.incomeSource.findFirst({
      where: { userId, name },
    });
    if (!row) {
      throw new BadRequestException(`No existe la fuente "${name}"`);
    }
    return row.id;
  }

  private async getActiveBudgetContextForUser(userId: string) {
    const pref = await this.preferenceReadPrisma.findUnique({
      where: { userId },
      select: { budgetCycleMode: true, budgetCutoffDay: true },
    });
    return resolveActiveBudgetContext(pref);
  }
  async listIncomeSources(user: AuthUserPayload) {
    await this.ensureDefaultIncomeSources(user.userId);
    const rows = (await this.incomePrisma.incomeSource.findMany({
      where: { userId: user.userId },
      orderBy: { name: 'asc' },
    })) as IncomeSourceRow[];
    return rows.map((s) => ({ id: s.id, name: s.name }));
  }
  async listIncomes(user: AuthUserPayload) {
    const { activeMonthDate } = await this.getActiveBudgetContextForUser(
      user.userId,
    );
    const rows = (await this.incomePrisma.incomeEntry.findMany({
      where: { userId: user.userId, referenceMonth: activeMonthDate },
      include: { source: true },
      orderBy: { createdAt: 'desc' },
    })) as IncomeEntryWithSourceRow[];
    return rows.map((r) => mapIncomeToResponse(r));
  }
  async createIncome(user: AuthUserPayload, dto: CreateIncomeDto) {
    const userId = user.userId;
    const sourceId = await this.findIncomeSourceOrThrow(userId, {
      id: dto.sourceId,
      name: dto.sourceName,
    });
    const budget = await this.getActiveBudgetContextForUser(userId);
    const refStr = dto.referenceMonth ?? budget.activeReferenceMonth;
    const rateYmd = dto.receivedDate ?? formatYmdInCaracas();
    const { vesPerUsd, rateDate } =
      await this.bcv.getVesPerUsdForCalendarDay(rateYmd);
    const row = (await this.incomePrisma.incomeEntry.create({
      data: {
        userId,
        sourceId,
        title: dto.title.trim(),
        description: dto.description?.trim() ?? '',
        amount: dto.amount,
        referenceMonth: toReferenceMonthDate(refStr),
        receivedDate: parseYmdToUtcNoon(rateYmd),
        bcvRateApplied: vesPerUsd,
        bcvRateDate: rateDate,
      },
      include: { source: true },
    })) as IncomeEntryWithSourceRow;
    return mapIncomeToResponse(row);
  }
  async deleteIncomes(user: AuthUserPayload, dto: DeleteIncomesDto) {
    const result = await this.incomePrisma.incomeEntry.deleteMany({
      where: { id: { in: dto.ids }, userId: user.userId },
    });
    return { deleted: result.count };
  }

  async updateExpenseFields(
    user: AuthUserPayload,
    expenseId: string,
    dto: UpdateExpenseFieldsDto,
  ) {
    const row = await this.prisma.expense.findFirst({
      where: { id: expenseId, profile: { userId: user.userId } },
    });
    if (!row) {
      throw new NotFoundException('Gasto no encontrado');
    }
    const data: Prisma.ExpenseUpdateInput = {};
    if (dto.title?.trim()) {
      data.title = dto.title.trim();
    }
    if (dto.amount != null) {
      data.amount = dto.amount;
    }
    if (dto.categoryName?.trim()) {
      const categoryId = await this.findCategoryOrThrow(user.userId, {
        name: dto.categoryName,
      });
      data.category = { connect: { id: categoryId } };
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Indica qué cambiar (monto, título o categoría)');
    }
    const updated = await this.prisma.expense.update({
      where: { id: expenseId },
      data,
      include: { category: true, profile: true },
    });
    return mapExpenseToResponse(updated);
  }

  async updateIncomeFields(
    user: AuthUserPayload,
    incomeId: string,
    dto: UpdateIncomeFieldsDto,
  ) {
    const row = (await this.incomePrisma.incomeEntry.findFirst({
      where: { id: incomeId, userId: user.userId },
    })) as IncomeEntryWithSourceRow | null;
    if (!row) {
      throw new NotFoundException('Ingreso no encontrado');
    }
    const data: Prisma.IncomeEntryUpdateInput = {};
    if (dto.title?.trim()) {
      data.title = dto.title.trim();
    }
    if (dto.amount != null) {
      data.amount = dto.amount;
    }
    if (dto.sourceName?.trim()) {
      const sourceId = await this.findIncomeSourceOrThrow(user.userId, {
        name: dto.sourceName,
      });
      data.source = { connect: { id: sourceId } };
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Indica qué cambiar (monto, título o fuente)');
    }
    const updated = (await this.incomePrisma.incomeEntry.update({
      where: { id: incomeId },
      data,
      include: { source: true },
    })) as IncomeEntryWithSourceRow;
    return mapIncomeToResponse(updated);
  }
}
