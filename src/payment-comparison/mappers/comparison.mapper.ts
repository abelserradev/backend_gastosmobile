import type { PaymentComparison } from '@prisma/client';
import type { ComparacionV1 } from '../exchange-contract';

export type ComparisonResponse = Readonly<{
  id: string;
  status: PaymentComparison['status'];
  productName: string | null;
  offer: unknown;
  result: ComparacionV1;
  contractVersion: string;
  bestOptionId: string;
  computedAt: string;
  expiresAt: string;
  createdAt: string;
  expenseId: string | null;
}>;

export function mapComparisonToResponse(
  row: PaymentComparison,
): ComparisonResponse {
  return {
    id: row.id,
    status: row.status,
    productName: row.productName,
    offer: row.offer,
    result: row.result as ComparacionV1,
    contractVersion: row.contractVersion,
    bestOptionId: row.bestOptionId,
    computedAt: row.computedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    expenseId: row.expenseId,
  };
}
