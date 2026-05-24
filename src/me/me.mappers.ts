
export function toReferenceMonthDate(isoDay: string): Date {
  return new Date(`${isoDay}T12:00:00.000Z`);
}

export function mapExpenseToResponse(e: {
  id: string;
  profileId: string;
  profile?: { name: string };
  title: string;
  description: string;
  amount: { toString(): string };
  isPaid: boolean;
  referenceMonth: Date;
  paymentDate: Date | null;
  bcvRateApplied: { toString(): string } | null;
  bcvRateDate: Date | null;
  paidByDisplayName?: string | null;
  paidAt?: Date | null;
  paidByMemberId?: string | null;
  category: { name: string };
  receiptImage?: Uint8Array | null;
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
  };
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
