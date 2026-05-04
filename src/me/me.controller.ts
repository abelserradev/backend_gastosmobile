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
import { CreateProfileMemberDto } from './dto/create-profile-member.dto';
import { CreateProfileDto } from './dto/create-profile.dto';
import { DeleteExpensesDto } from './dto/delete-expenses.dto';
import { MarkExpensesPaidDto } from './dto/mark-expenses-paid.dto';
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

  @Get('profiles/:id/members')
  listProfileMembers(
    @CurrentUser() user: AuthUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.me.listProfileMembers(user, id);
  }

  @Post('profiles/:id/members')
  createProfileMember(
    @CurrentUser() user: AuthUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateProfileMemberDto,
  ) {
    return this.me.createProfileMember(user, id, dto);
  }

  @Delete('profiles/:profileId/members/:memberId')
  deleteProfileMember(
    @CurrentUser() user: AuthUserPayload,
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ) {
    return this.me.deleteProfileMember(user, profileId, memberId);
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

  @Post('expenses/mark-paid')
  markExpensesPaid(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: MarkExpensesPaidDto,
  ) {
    return this.me.markExpensesPaid(user, dto);
  }

  @Post('expenses/delete-many')
  deleteExpenses(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: DeleteExpensesDto,
  ) {
    return this.me.deleteExpenses(user, dto);
  }

  @Patch('expenses/:id')
  patchExpense(
    @CurrentUser() user: AuthUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PatchExpenseDto,
  ) {
    return this.me.patchExpense(user, id, dto);
  }
}
