import type { Prisma } from '@prisma/client';
import type { PrismaService } from './prisma.service';

export type ExpenseReceiptSelectRow = Readonly<{
  receiptImage: Uint8Array | null;
  receiptMime: string | null;
}>;

/** Gasto con relaciones mínimas para mapExpenseToResponse tras create con comprobante. */
export type ExpenseWithCategoryProfileRow = Readonly<{
  id: string;
  profileId: string;
  title: string;
  description: string;
  amount: Prisma.Decimal;
  isPaid: boolean;
  referenceMonth: Date;
  paymentDate: Date | null;
  bcvRateApplied: Prisma.Decimal | null;
  bcvRateDate: Date | null;
  paidByDisplayName: string | null;
  paidAt: Date | null;
  paidByMemberId: string | null;
  receiptImage?: Uint8Array | null;
  category: { name: string };
  profile?: { name: string };
}>;

type ExpenseReceiptDelegate = Readonly<{
  findFirst: (args: {
    where: { id: string; profile: { userId: string } };
    select: { receiptImage: true; receiptMime: true };
  }) => Promise<ExpenseReceiptSelectRow | null>;
  create: (args: {
    data: {
      profileId: string;
      categoryId: string;
      title: string;
      description: string;
      amount: number;
      referenceMonth: Date;
      paymentDate: Date;
      bcvRateApplied: Prisma.Decimal;
      bcvRateDate: Date;
      receiptImage: Uint8Array;
      receiptMime: string;
    };
    include: { category: true; profile: true };
  }) => Promise<ExpenseWithCategoryProfileRow>;
}>;

/** Lectura/escritura de comprobantes cuando el analyzer no enlaza receiptImage en ExpenseSelect. */
export function expenseReceiptDb(prisma: PrismaService): ExpenseReceiptDelegate {
  return (prisma as unknown as { expense: ExpenseReceiptDelegate }).expense;
}
