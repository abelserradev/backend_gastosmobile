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
    '• listar mis gastos / mis ingresos\n' +
    '• eliminar gasto (elige de la lista y confirma)\n' +
    '• eliminar gasto comida (filtra y luego eliges)\n' +
    '• cambiar gasto comida a 30\n' +
    '• inventario / eliminar producto leche\n\n' +
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

export function formatExpensesList(
  periodLabel: string,
  items: { title: string; amount: number; categoryName: string; isPaid: boolean }[],
  total: number,
): string {
  if (items.length === 0) {
    return `Sin gastos en ${periodLabel}.`;
  }
  const lines = items.slice(0, 8).map(
    (e) =>
      `• ${fmtUsd(e.amount)} ${e.categoryName}${e.isPaid ? ' ✓' : ''} — ${e.title}`,
  );
  const more = items.length > 8 ? `\n… y ${items.length - 8} más` : '';
  return (
    `Gastos · ${periodLabel}\n` +
    lines.join('\n') +
    more +
    `\n\nTotal: ${fmtUsd(total)}`
  );
}

export function formatInventoryList(
  profileName: string,
  items: { name: string; currentStock: number; unit?: string }[],
): string {
  if (items.length === 0) {
    return `Inventario vacío (${profileName}).`;
  }
  const lines = items.slice(0, 10).map(
    (i) => `• ${i.name}: ${i.currentStock}${i.unit ? ` ${i.unit}` : ''}`,
  );
  const more = items.length > 10 ? `\n… y ${items.length - 10} más` : '';
  return `Inventario · ${profileName}\n${lines.join('\n')}${more}`;
}

export function formatDeleted(kind: string, label: string): string {
  return `${kind} eliminado\n${label}`;
}

export function formatUpdated(kind: string, label: string): string {
  return `${kind} actualizado\n${label}`;
}

export function formatNoMatches(kind: string): string {
  return `No encontré ${kind} que coincidan. Prueba "listar mis gastos" o sé más específico.`;
}

export interface DeleteExpenseListOptions {
  filtered?: boolean;
  fallbackFull?: boolean;
}

export function formatDeleteExpenseList(
  periodLabel: string,
  picks: { label: string }[],
  totalInPeriod: number,
  options?: DeleteExpenseListOptions,
): string {
  if (picks.length === 0) {
    return `Sin gastos en ${periodLabel}.`;
  }
  let header: string;
  if (options?.fallbackFull) {
    header = `No encontré coincidencias. Elige de tus gastos (${periodLabel}):`;
  } else if (options?.filtered) {
    header = `Gastos que coinciden · ${periodLabel}`;
  } else {
    header = `Elige el gasto a eliminar · ${periodLabel}`;
  }
  const lines = picks.map((p, i) => `${i + 1}. ${p.label}`);
  const hidden = totalInPeriod - picks.length;
  const more = hidden > 0 ? `\n… y ${hidden} más en este periodo` : '';
  return (
    `${header}\n${lines.join('\n')}${more}\n\nToca el botón del gasto que quieres eliminar.`
  );
}

export function formatDeleteConfirm(label: string): string {
  return `¿Eliminar este gasto?\n${label}`;
}

export function formatPickPrompt(action: string): string {
  return `${action}. Elige cuál:`;
}

export function formatNeedNewAmount(kind: string): string {
  return `¿A qué monto quieres cambiar el ${kind}? Ejemplo: 35`;
}

export function formatNoInventoryProfile(): string {
  return 'No tienes un perfil tipo comercio con inventario. Créalo en la app web.';
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
