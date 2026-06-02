import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUserPayload } from '../common/types/auth-user.payload';
import { formatYmdInCaracas } from '../common/utils/caracas-date';
import { BcvRateService } from './bcv-rate.service';

@Controller('bcv')
export class BcvController {
  constructor(private readonly bcv: BcvRateService) {}

  @Get('oficial-por-dia')
  async oficialPorDia(
    @CurrentUser() _user: AuthUserPayload,
    @Query('date') date?: string,
  ) {
    const ymd =
      date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : formatYmdInCaracas();
    const { vesPerUsd, rateDate, usedFallback } =
      await this.bcv.getVesPerUsdForCalendarDay(ymd);
    return {
      date: ymd,
      vesPerUsd: Number(vesPerUsd.toString()),
      rateDate: rateDate.toISOString().slice(0, 10),
      stale: usedFallback,
    };
  }
}
