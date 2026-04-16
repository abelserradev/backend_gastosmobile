import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { formatYmdInCaracas } from '../common/utils/caracas-date';
import { BcvRateService } from './bcv-rate.service';

@Controller('bcv')
export class BcvController {
  constructor(private readonly bcv: BcvRateService) {}

  /** Sin JWT (throttling global). `date` opcional → hoy en Caracas. */
  @Public()
  @Get('oficial-por-dia')
  async oficialPorDia(@Query('date') date?: string) {
    const ymd =
      date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : formatYmdInCaracas();
    const { vesPerUsd, rateDate } =
      await this.bcv.getVesPerUsdForCalendarDay(ymd);
    return {
      date: ymd,
      vesPerUsd: Number(vesPerUsd.toString()),
      rateDate: rateDate.toISOString().slice(0, 10),
    };
  }
}
