import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUserPayload } from '../common/types/auth-user.payload';
import { CreateComparisonDto } from './dto/create-comparison.dto';
import { PaymentComparisonEnabledGuard } from './guards/payment-comparison-enabled.guard';
import { PaymentComparisonService } from './payment-comparison.service';

@Controller('me/comparisons')
@UseGuards(PaymentComparisonEnabledGuard)
export class PaymentComparisonController {
  constructor(private readonly comparisons: PaymentComparisonService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: CreateComparisonDto,
  ) {
    return this.comparisons.create(user.userId, dto);
  }

  @Get()
  listPending(@CurrentUser() user: AuthUserPayload) {
    return this.comparisons.listPending(user.userId);
  }

  @Get(':id')
  getOne(
    @CurrentUser() user: AuthUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.comparisons.getById(user.userId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  discard(
    @CurrentUser() user: AuthUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.comparisons.discard(user.userId, id);
  }
}
