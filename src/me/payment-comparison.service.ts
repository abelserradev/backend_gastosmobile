import { ConflictException, Injectable } from '@nestjs/common';
import type { ValuationBasis } from '@prisma/client';
import type { UpdateExpenseFieldsDto } from './dto/update-expense-fields.dto';
import { toReferenceMonthDate } from './me.mappers';
import type { PreferenceCutoffFields } from '../prisma/prisma-user-preference.accessor';

/** Datos mínimos del gasto para reglas EXP-003 (comparación → gasto). */
export type ExpenseValuationRow = Readonly<{
  valuationBasis: ValuationBasis | null;
}>;

export type ResolveExpenseContextInput = Readonly<{
  profileId?: string;
  categoryId?: string;
  categoryName?: string;
}>;

export type ResolvedExpenseContext = Readonly<{
  profileId: string;
  categoryId: string;
  referenceMonth: Date;
}>;

/**
 * Colaboradores que MeService inyecta: evita duplicar resolve* privados en T4 (GC-005).
 * TODO: mover resolvers a un ExpenseRegistrationHelper cuando exista el módulo comparisons.
 */
export type ExpenseContextCollaborators = Readonly<{
  resolveCategoryId: (
    userId: string,
    input: { id?: string; name?: string },
  ) => Promise<string>;
  resolveProfileId: (userId: string, profileId?: string) => Promise<string>;
  getBudgetCyclePrefForUser: (
    userId: string,
  ) => Promise<PreferenceCutoffFields | null>;
  resolveMovementReferenceMonthYmd: (
    pref: PreferenceCutoffFields | null,
    explicitReferenceMonth?: string,
  ) => string;
}>;

const SELL_RATE_AMOUNT_EDIT_MESSAGE =
  'Este gasto viene de una comparación de pago; para cambiar el monto elimínalo y compara de nuevo';

/**
 * Reglas de dominio payment-comparison (OpenSpec EXP-003, TD-4).
 * Fase T4 ampliará con cliente Exchange y CRUD de comparaciones.
 */
@Injectable()
export class PaymentComparisonService {
  /**
   * EXP-003: recalcular monto con BCV mezclaría bases con SELL_RATE.
   */
  assertAmountEditAllowed(
    row: ExpenseValuationRow,
    dto: Pick<UpdateExpenseFieldsDto, 'amount'>,
  ): void {
    if (dto.amount == null) {
      return;
    }
    if (row.valuationBasis === 'SELL_RATE') {
      throw new ConflictException(SELL_RATE_AMOUNT_EDIT_MESSAGE);
    }
  }

  /**
   * Perfil, categoría y periodo con las mismas reglas que el alta manual (TD-4).
   */
  async resolveExpenseContext(
    userId: string,
    input: ResolveExpenseContextInput,
    collaborators: ExpenseContextCollaborators,
  ): Promise<ResolvedExpenseContext> {
    const categoryId = await collaborators.resolveCategoryId(userId, {
      id: input.categoryId,
      name: input.categoryName,
    });
    const profileId = await collaborators.resolveProfileId(
      userId,
      input.profileId,
    );
    const pref = await collaborators.getBudgetCyclePrefForUser(userId);
    const refYmd = collaborators.resolveMovementReferenceMonthYmd(pref);
    return {
      profileId,
      categoryId,
      referenceMonth: toReferenceMonthDate(refYmd),
    };
  }
}
