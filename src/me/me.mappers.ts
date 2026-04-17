/** Mes de referencia por defecto (UTC) para gastos sin fecha explícita. */
export function startOfCurrentMonthUtc(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

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
  paymentDate: Date | null;
  bcvRateApplied: { toString(): string } | null;
  bcvRateDate: Date | null;
  paidByDisplayName?: string | null;
  paidAt?: Date | null;
  paidByMemberId?: string | null;
  category: { name: string };
}): {
  id: string;
  profileId: string;
  profileName: string | null;
  title: string;
  description: string;
  amount: number;
  category: string;
  isPaid: boolean;
  paymentDate: string | null;
  bcvRateApplied: number | null;
  bcvRateDate: string | null;
  paidByDisplayName: string | null;
  paidAt: string | null;
  paidByMemberId: string | null;
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
  };
}
