import type { AuthUserPayload } from '../common/types/auth-user.payload';

interface ExpenseCreatedPayload {
  title: string;
  amount: number;
  categoryName: string;
  periodLabel: string;
  remainingUsd: number | null;
}

interface IncomeCreatedPayload {
  title: string;
  amount: number;
  sourceName: string;
}

interface SummaryPayload {
  periodLabel: string;
  totalExpensesUsd: number;
  totalIncomesUsd: number;
  budgetUsd: number | null;
  remainingUsd: number | null;
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function formatHelpMessage(botUsername: string | null): string {
  const linkHint = botUsername
    ? `\nVincula tu cuenta en la app y envía el código con /vincular CODIGO o abre t.me/${botUsername}?start=CODIGO`
    : '\nGenera un código en la app web (Conectar Telegram).';
  return (
    'Spend$ave por Telegram\n\n' +
    'Ejemplos:\n' +
    '• gasté 25 en comida almuerzo\n' +
    '• recibí 800 de freelance\n' +
    '• cuánto llevo gastado este mes\n' +
    '• mis ingresos\n\n' +
    'Comandos: /vincular CODIGO, /ayuda' +
    linkHint
  );
}

export function formatUnlinkedMessage(): string {
  return (
    'Tu Telegram no está vinculado a Spend$ave.\n' +
    'Abre la app → Conectar Telegram → genera un código → envía /vincular CODIGO aquí.'
  );
}

export function formatLinkSuccess(): string {
  return 'Cuenta vinculada. Ya puedes registrar gastos e ingresos con mensajes naturales.';
}

export function formatExpenseCreated(p: ExpenseCreatedPayload): string {
  const remaining =
    p.remainingUsd != null
      ? `\nDisponible en el periodo: ${fmtUsd(p.remainingUsd)}`
      : '';
  return (
    `Gasto registrado\n` +
    `${fmtUsd(p.amount)} · ${p.categoryName}\n` +
    `${p.title}\n` +
    `Periodo: ${p.periodLabel}` +
    remaining
  );
}

export function formatIncomeCreated(p: IncomeCreatedPayload): string {
  return (
    `Ingreso registrado\n` +
    `${fmtUsd(p.amount)} · ${p.sourceName}\n` +
    `${p.title}`
  );
}

export function formatSummary(p: SummaryPayload): string {
  const budgetLine =
    p.budgetUsd != null ? `\nPresupuesto: ${fmtUsd(p.budgetUsd)}` : '';
  const remainingLine =
    p.remainingUsd != null
      ? `\nDisponible: ${fmtUsd(p.remainingUsd)}`
      : '';
  return (
    `Resumen · ${p.periodLabel}\n` +
    `Gastos: ${fmtUsd(p.totalExpensesUsd)}\n` +
    `Ingresos: ${fmtUsd(p.totalIncomesUsd)}` +
    budgetLine +
    remainingLine
  );
}

export function formatIncomesList(
  periodLabel: string,
  items: { title: string; amount: number; sourceName: string }[],
  total: number,
): string {
  if (items.length === 0) {
    return `Sin ingresos en ${periodLabel}.`;
  }
  const lines = items.slice(0, 8).map(
    (i) => `• ${fmtUsd(i.amount)} ${i.sourceName} — ${i.title}`,
  );
  const more =
    items.length > 8 ? `\n… y ${items.length - 8} más` : '';
  return (
    `Ingresos · ${periodLabel}\n` +
    lines.join('\n') +
    more +
    `\n\nTotal: ${fmtUsd(total)}`
  );
}

export function formatSetupRequired(): string {
  return (
    'Completa la configuración inicial en la app (ingreso, categorías y al menos un perfil) ' +
    'antes de registrar movimientos desde Telegram.'
  );
}

export function formatErrorMessage(message: string): string {
  return `No se pudo completar la acción: ${message}`;
}

export function buildAuthPayload(
  userId: string,
  email: string | null | undefined,
): AuthUserPayload {
  return { userId, email: email ?? '' };
}

export type {
  ExpenseCreatedPayload,
  IncomeCreatedPayload,
  SummaryPayload,
};
