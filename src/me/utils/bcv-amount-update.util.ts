import type { Prisma } from '@prisma/client';
import { resolveAmountUsd } from '../../common/utils/amount-currency.util';
import { formatYmdInCaracas } from '../../common/utils/caracas-date';
import type { BcvRateService } from '../../bcv/bcv-rate.service';

export type BcvAmountPatch = {
  amount: number;
  bcvRateApplied: Prisma.Decimal;
  bcvRateDate: Date;
};

/** Convierte monto entrante (USD/BS) a USD almacenado usando tasa BCV del día en Caracas. */
export async function buildBcvAmountPatch(
  bcv: BcvRateService,
  amount: number,
  amountCurrency: 'USD' | 'BS' | undefined,
): Promise<BcvAmountPatch> {
  const rateYmd = formatYmdInCaracas();
  const { vesPerUsd, rateDate } =
    await bcv.getVesPerUsdForCalendarDay(rateYmd);
  const vesPerUsdNum = Number(vesPerUsd.toString());
  return {
    amount: resolveAmountUsd(amount, amountCurrency, vesPerUsdNum),
    bcvRateApplied: vesPerUsd,
    bcvRateDate: rateDate,
  };
}
