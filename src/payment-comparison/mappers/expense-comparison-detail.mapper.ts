import type { Expense, PaymentComparison } from '@prisma/client';
import type { ComparacionV1 } from '../exchange-contract';
import { parseComparacionV1 } from '../exchange-contract';

export type ExpenseComparisonDetailResponse = Readonly<{
  comparisonId: string;
  contractVersion: string;
  computedAt: string;
  productName: string | null;
  tasas: ComparacionV1['tasas'];
  tasaVenta: ComparacionV1['tasaVenta'];
  opciones: ComparacionV1['opciones'];
  bestOptionId: string;
  chosenOptionId: string | null;
}>;

const METODO_POR_OPCION: Record<string, Expense['paymentMethod']> = {
  efectivo: 'CASH',
  electronico: 'ELECTRONIC',
  bs: 'BS',
};

function sameUsdAmount(stored: Expense['amount'], opcionUsd: string): boolean {
  return Number(stored.toString()) === Number(opcionUsd);
}

/** Sin columna chosenOptionId: inferimos por método + costo real USD guardado en el gasto. */
export function inferChosenOptionId(
  expense: Pick<Expense, 'amount' | 'paymentMethod'>,
  opciones: ComparacionV1['opciones'],
): string | null {
  const byMethod = opciones.find((o) => {
    const metodo = METODO_POR_OPCION[o.id];
    return (
      metodo === expense.paymentMethod &&
      sameUsdAmount(expense.amount, o.costoRealUsd)
    );
  });
  if (byMethod) {
    return byMethod.id;
  }
  const byAmount = opciones.filter((o) =>
    sameUsdAmount(expense.amount, o.costoRealUsd),
  );
  return byAmount.length === 1 ? byAmount[0].id : null;
}

export function mapExpenseComparisonDetail(
  comparison: PaymentComparison,
  expense: Pick<Expense, 'amount' | 'paymentMethod'>,
): ExpenseComparisonDetailResponse {
  const result = parseComparacionV1(comparison.result);
  return {
    comparisonId: comparison.id,
    contractVersion: comparison.contractVersion,
    computedAt: comparison.computedAt.toISOString(),
    productName: comparison.productName,
    tasas: result.tasas,
    tasaVenta: result.tasaVenta,
    opciones: result.opciones,
    bestOptionId: comparison.bestOptionId,
    chosenOptionId: inferChosenOptionId(expense, result.opciones),
  };
}
