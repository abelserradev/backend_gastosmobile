import type { UpdateMoneyEntryCoreDto } from '../dto/money-entry-core.dto';
import type { BcvRateService } from '../../bcv/bcv-rate.service';
import {
  buildBcvAmountPatch,
  type BcvAmountPatch,
} from './bcv-amount-update.util';

export type MoneyEntryCoreUpdateFields = {
  title?: string;
} & Partial<BcvAmountPatch>;

/** Título + monto/BCV compartidos entre updateExpenseFields y updateIncomeFields. */
export async function buildMoneyEntryCoreUpdateFields(
  bcv: BcvRateService,
  dto: UpdateMoneyEntryCoreDto,
): Promise<MoneyEntryCoreUpdateFields> {
  const fields: MoneyEntryCoreUpdateFields = {};
  if (dto.title?.trim()) {
    fields.title = dto.title.trim();
  }
  if (dto.amount != null) {
    Object.assign(
      fields,
      await buildBcvAmountPatch(bcv, dto.amount, dto.amountCurrency),
    );
  }
  return fields;
}
