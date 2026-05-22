import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUserPayload } from '../common/types/auth-user.payload';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateExpenseWithReceiptDto } from './dto/create-expense-with-receipt.dto';
import { CreateProfileMemberDto } from './dto/create-profile-member.dto';
import { CreateProfileDto } from './dto/create-profile.dto';
import { DeleteExpensesDto } from './dto/delete-expenses.dto';
import { MarkExpensesPaidDto } from './dto/mark-expenses-paid.dto';
import { PatchExpenseDto } from './dto/patch-expense.dto';
import { ReplaceCategoriesDto } from './dto/replace-categories.dto';
import { SubmitOcrFeedbackDto } from './dto/submit-ocr-feedback.dto';
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

  @Get('history/months')
  listExpenseHistoryMonths(@CurrentUser() user: AuthUserPayload) {
    return this.me.listExpenseHistoryMonths(user);
  }

  @Get('history/months/:ym')
  listExpenseHistoryForMonth(
    @CurrentUser() user: AuthUserPayload,
    @Param('ym') ym: string,
  ) {
    return this.me.listExpenseHistoryForMonth(user, ym);
  }

  @Post('ocr-feedback')
  @HttpCode(HttpStatus.CREATED)
  submitOcrFeedback(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: SubmitOcrFeedbackDto,
  ): Promise<{ id: string }> {
    return this.me.submitOcrFeedback(user, dto);
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

  @Post('expenses/with-receipt')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 1.2 * 1024 * 1024 }, // 1.2MB — el front valida ≤1MB
      fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        if (allowed.includes(file.mimetype)) return cb(null, true);
        cb(new BadRequestException('Solo se aceptan JPG, PNG o WebP'), false);
      },
    }),
  )
  createExpenseWithReceipt(
    @CurrentUser() user: AuthUserPayload,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateExpenseWithReceiptDto,
  ) {
    if (!file) throw new BadRequestException('Se requiere imagen');
    return this.me.createExpenseWithReceipt(
      user,
      dto,
      file.buffer,
      file.mimetype,
    );
  }

  @Get('expenses/:id/receipt')
  async getExpenseReceipt(
    @CurrentUser() user: AuthUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const { buffer, mime } = await this.me.getExpenseReceipt(user, id);
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(buffer);
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
