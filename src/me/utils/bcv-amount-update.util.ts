import type { Prisma } from '@prisma/client';
import { resolveAmountUsd } from '../../common/utils/amount-currency.util';
import { formatYmdInCaracas } from '../../common/utils/caracas-date';
import type { BcvRateService } from '../../bcv/bcv-rate.service';

export type BcvAmountPatch = {
  amount: number;
  bcvRateApplied: Prisma.Decimal;
  bcvRateDate: Date;
};

export async function buildBcvAmountPatchForYmd(
  bcv: BcvRateService,
  rateYmd: string,
  amount: number,
  amountCurrency: 'USD' | 'BS' | undefined,
): Promise<BcvAmountPatch> {
  const { vesPerUsd, rateDate } = await bcv.getVesPerUsdForCalendarDay(rateYmd);
  const vesPerUsdNum = Number(vesPerUsd.toString());
  return {
    amount: resolveAmountUsd(amount, amountCurrency, vesPerUsdNum),
    bcvRateApplied: vesPerUsd,
    bcvRateDate: rateDate,
  };
}

/** Convierte monto entrante (USD/BS) a USD con tasa BCV del día actual en Caracas (updates Telegram). */
export async function buildBcvAmountPatch(
  bcv: BcvRateService,
  amount: number,
  amountCurrency: 'USD' | 'BS' | undefined,
): Promise<BcvAmountPatch> {
  return buildBcvAmountPatchForYmd(
    bcv,
    formatYmdInCaracas(),
    amount,
    amountCurrency,
  );
}
