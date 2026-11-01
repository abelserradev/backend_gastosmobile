import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUserPayload } from '../common/types/auth-user.payload';
import { PaymentComparisonEnabledGuard } from './guards/payment-comparison-enabled.guard';
import { PaymentComparisonService } from './payment-comparison.service';

/** EXP-002: tabla de comparación en detalle de gasto (misma visibilidad que el gasto). */
@Controller('me/expenses')
@UseGuards(PaymentComparisonEnabledGuard)
export class ExpenseComparisonController {
  constructor(private readonly comparisons: PaymentComparisonService) {}

  @Get(':id/comparison')
  getComparisonForExpense(
    @CurrentUser() user: AuthUserPayload,
    @Param('id', ParseUUIDPipe) expenseId: string,
  ) {
    return this.comparisons.getComparisonForExpense(user.userId, expenseId);
  }
}
