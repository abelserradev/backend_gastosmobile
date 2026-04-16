import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUserPayload } from '../common/types/auth-user.payload';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateProfileDto } from './dto/create-profile.dto';
import { DeleteExpensesDto } from './dto/delete-expenses.dto';
import { PatchExpenseDto } from './dto/patch-expense.dto';
import { ReplaceCategoriesDto } from './dto/replace-categories.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { MeService } from './me.service';

@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  getState(@CurrentUser() user: AuthUserPayload) {
    return this.me.getState(user);
  }

  @Put('preferences')
  updatePreferences(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.me.updatePreferences(user, dto);
  }

  @Put('categories')
  replaceCategories(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: ReplaceCategoriesDto,
  ) {
    return this.me.replaceCategories(user, dto);
  }

  @Get('profiles')
  listProfiles(@CurrentUser() user: AuthUserPayload) {
    return this.me.listProfiles(user);
  }

  @Post('profiles')
  createProfile(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: CreateProfileDto,
  ) {
    return this.me.createProfile(user, dto);
  }

  @Delete('profiles/:id')
  deleteProfile(
    @CurrentUser() user: AuthUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.me.deleteProfile(user, id);
  }

  @Get('expenses')
  listExpenses(@CurrentUser() user: AuthUserPayload) {
    return this.me.listExpenses(user);
  }

  @Post('expenses')
  createExpense(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: CreateExpenseDto,
  ) {
    return this.me.createExpense(user, dto);
  }

  @Patch('expenses/:id')
  patchExpense(
    @CurrentUser() user: AuthUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PatchExpenseDto,
  ) {
    return this.me.patchExpense(user, id, dto);
  }

  @Post('expenses/delete-many')
  deleteExpenses(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: DeleteExpensesDto,
  ) {
    return this.me.deleteExpenses(user, dto);
  }
}
