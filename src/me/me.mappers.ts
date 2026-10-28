export function toReferenceMonthDate(isoDay: string): Date {
  return new Date(`${isoDay}T12:00:00.000Z`);
}

/**
 * Include estándar para gastos que salen por la API: con `comparison.id` el cliente sabe si
 * puede pedir la tabla de comparación sin una llamada extra por gasto.
 */
export const EXPENSE_RESPONSE_INCLUDE = {
  category: true,
  profile: true,
  comparison: { select: { id: true } },
} as const;

type DecimalLike = { toString(): string };

const decimalToNumber = (v: DecimalLike | null | undefined): number | null =>
  v == null ? null : Number(v.toString());

export function mapExpenseToResponse(e: {
  id: string;
  profileId: string;
  profile?: { name: string };
  title: string;
  description: string;
  amount: DecimalLike;
  isPaid: boolean;
  referenceMonth: Date;
  paymentDate: Date | null;
  bcvRateApplied: DecimalLike | null;
  bcvRateDate: Date | null;
  paidByDisplayName?: string | null;
  paidAt?: Date | null;
  paidByMemberId?: string | null;
  category: { name: string };
  receiptImage?: Uint8Array | null;
  // Opcionales: el accessor de comprobantes no los trae y esos gastos nunca vienen de una comparación
  paymentMethod?: 'CASH' | 'ELECTRONIC' | 'BS' | null;
  nominalAmount?: DecimalLike | null;
  nominalCurrency?: 'BS' | 'USD' | null;
  commissionPct?: DecimalLike | null;
  commissionUsd?: DecimalLike | null;
  sellRate?: DecimalLike | null;
  bcvEquivalentUsd?: DecimalLike | null;
  valuationBasis?: 'BCV' | 'SELL_RATE';
  comparison?: { id: string } | null;
}): {
  id: string;
  profileId: string;
  profileName: string | null;
  title: string;
  description: string;
  amount: number;
  category: string;
  isPaid: boolean;
  referenceMonth: string;
  paymentDate: string | null;
  bcvRateApplied: number | null;
  bcvRateDate: string | null;
  paidByDisplayName: string | null;
  paidAt: string | null;
  paidByMemberId: string | null;
  hasReceipt: boolean;
  paymentMethod: 'CASH' | 'ELECTRONIC' | 'BS' | null;
  nominalAmount: number | null;
  nominalCurrency: 'BS' | 'USD' | null;
  commissionPct: number | null;
  commissionUsd: number | null;
  sellRate: number | null;
  bcvEquivalentUsd: number | null;
  valuationBasis: 'BCV' | 'SELL_RATE';
  comparisonId: string | null;
} {
  return {
    id: e.id,
    profileId: e.profileId,
    profileName: e.profile?.name ?? null,
    title: e.title,
    description: e.description,
    amount: Number(e.amount.toString()),
    category: e.category.name,
    isPaid: e.isPaid,
    referenceMonth: e.referenceMonth.toISOString().slice(0, 10),
    paymentDate: e.paymentDate
      ? e.paymentDate.toISOString().slice(0, 10)
      : null,
    bcvRateApplied: e.bcvRateApplied
      ? Number(e.bcvRateApplied.toString())
      : null,
    bcvRateDate: e.bcvRateDate
      ? e.bcvRateDate.toISOString().slice(0, 10)
      : null,
    paidByDisplayName: e.paidByDisplayName ?? null,
    paidAt: e.paidAt ? e.paidAt.toISOString() : null,
    paidByMemberId: e.paidByMemberId ?? null,
    hasReceipt: e.receiptImage != null && e.receiptImage.length > 0,
    paymentMethod: e.paymentMethod ?? null,
    nominalAmount: decimalToNumber(e.nominalAmount),
    nominalCurrency: e.nominalCurrency ?? null,
    commissionPct: decimalToNumber(e.commissionPct),
    commissionUsd: decimalToNumber(e.commissionUsd),
    sellRate: decimalToNumber(e.sellRate),
    bcvEquivalentUsd: decimalToNumber(e.bcvEquivalentUsd),
    valuationBasis: e.valuationBasis ?? 'BCV',
    comparisonId: e.comparison?.id ?? null,
  };
}

/** Configuración del ciclo presupuestario (FEAT-001). */
export interface BudgetCycleResponse {
  mode: 'calendar_month' | 'monthly_cutoff';
  cutoffDay: number;
}

/** Periodo presupuestario activo calculado (FEAT-001). */
export interface ActivePeriodResponse {
  /** YYYY-MM-DD del inicio del periodo (día después del corte anterior). */
  periodStart: string;
  /** YYYY-MM-DD de la fecha de corte (fin del periodo). */
  cutoffDate: string;
  /** YYYY-MM-DD del inicio del siguiente periodo (día después del corte). */
  nextPeriodStart: string;
  /** Etiqueta legible para UI (ej: "16 May - 15 Jun"). */
  label: string;
  /** Si hoy es día de corte (mostrar renovación). */
  isCutoffToday: boolean;
}

/** Respuesta enriquecida de preferencias (ingreso en Bs. con recálculo de USD). */
export interface MePreferencesResponse {
  defaultCurrency: 'USD' | 'BS';
  monthlyIncome: number;
  incomeFixedBs: number | null;
  /** Primer día del mes en que se confirmó el ingreso (YYYY-MM-DD). */
  incomeReferenceMonth: string | null;
  monthlyIncomeUsdAtRegistration: number | null;
  bcvVesPerUsdNow: number | null;
  bcvRateDateNow: string | null;
  bcvVesPerUsdAtRegistration: number | null;
  bcvRateDateAtRegistration: string | null;
  usdEquivalentDelta: number | null;
  bsIncomeNarrative: string | null;
  bcvQuoteIsStale: boolean;
  /** USD arrastrados del mes anterior al presupuesto vigente. */
  carryoverUsd: number;
  /** Presupuesto efectivo del mes (ingreso base + arrastre). */
  effectiveMonthlyIncomeUsd: number;
  /** Configuración del ciclo presupuestario (FEAT-001). */
  budgetCycle: BudgetCycleResponse;
}

/** Texto para la UI / asistentes: mismo nominal en Bs., distinto poder en USD por la tasa. */
export function buildBsIncomeNarrativeLine(p: {
  nominalBs: number;
  usdNow: number;
  usdAtReg: number;
  vesNow: number;
  vesReg: number;
  dateRegYmd: string;
  dateNowYmd: string;
  stale: boolean;
}): string {
  const delta = p.usdNow - p.usdAtReg;
  const sign = delta > 0 ? '+' : '';
  let tasaFragmento: string;
  if (p.vesNow > p.vesReg) {
    tasaFragmento = `subió de ${p.vesReg.toFixed(2)} a ${p.vesNow.toFixed(2)} Bs/USD`;
  } else if (p.vesNow < p.vesReg) {
    tasaFragmento = `bajó de ${p.vesReg.toFixed(2)} a ${p.vesNow.toFixed(2)} Bs/USD`;
  } else {
    tasaFragmento = `se mantiene en ${p.vesNow.toFixed(2)} Bs/USD`;
  }
  const bsTxt = p.nominalBs.toLocaleString('es-VE', {
    maximumFractionDigits: 2,
  });
  let texto =
    `Sigues teniendo ${bsTxt} BsD., pero como la tasa oficial ${tasaFragmento}, ` +
    `ahora equivalen a unos $${p.usdNow.toFixed(2)} USD ` +
    `(el ${p.dateRegYmd} equivalían a $${p.usdAtReg.toFixed(2)} USD; diferencia ${sign}${delta.toFixed(2)} USD).`;
  if (p.stale) {
    texto +=
      ' Se muestra la última tasa guardada en caché porque no hubo cotización en vivo.';
  }
  return texto;
}

export function mapIncomeToResponse(e: {
  id: string;
  title: string;
  description: string;
  amount: { toString(): string };
  referenceMonth: Date;
  receivedDate: Date | null;
  bcvRateApplied: { toString(): string } | null;
  bcvRateDate: Date | null;
  source: { name: string };
}): {
  id: string;
  title: string;
  description: string;
  amount: number;
  source: string;
  referenceMonth: string;
  receivedDate: string | null;
  bcvRateApplied: number | null;
  bcvRateDate: string | null;
} {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    amount: Number(e.amount.toString()),
    source: e.source.name,
    referenceMonth: e.referenceMonth.toISOString().slice(0, 10),
    receivedDate: e.receivedDate
      ? e.receivedDate.toISOString().slice(0, 10)
      : null,
    bcvRateApplied: e.bcvRateApplied
      ? Number(e.bcvRateApplied.toString())
      : null,
    bcvRateDate: e.bcvRateDate
      ? e.bcvRateDate.toISOString().slice(0, 10)
      : null,
  };
}
