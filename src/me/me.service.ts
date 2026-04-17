import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { BcvRateService } from '../bcv/bcv-rate.service';
import {
  formatYmdInCaracas,
  parseYmdToUtcNoon,
} from '../common/utils/caracas-date';
import type { AuthUserPayload } from '../common/types/auth-user.payload';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateProfileDto } from './dto/create-profile.dto';
import { DeleteExpensesDto } from './dto/delete-expenses.dto';
import { PatchExpenseDto } from './dto/patch-expense.dto';
import { ReplaceCategoriesDto } from './dto/replace-categories.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { CreateProfileMemberDto } from './dto/create-profile-member.dto';
import {
  mapExpenseToResponse,
  startOfCurrentMonthUtc,
  toReferenceMonthDate,
} from './me.mappers';
import { ResendEmailService } from '../email/resend-email.service';

@Injectable()
export class MeService {
  private readonly logger = new Logger(MeService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly bcv: BcvRateService,
    private readonly resendEmail: ResendEmailService,
  ) {}

  async getState(user: AuthUserPayload) {
    const userId = user.userId;
    const [pref, categories, profiles, expenses] = await Promise.all([
      this.prisma.userPreference.findUnique({ where: { userId } }),
      this.prisma.category.findMany({
        where: { userId },
        orderBy: { name: 'asc' },
      }),
      this.prisma.profile.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.expense.findMany({
        where: { profile: { userId } },
        include: { category: true, profile: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return {
      preferences: pref
        ? {
            defaultCurrency: pref.defaultCurrency,
            monthlyIncome: Number(pref.monthlyIncome),
          }
        : null,
      categories: categories.map((c) => ({ id: c.id, name: c.name })),
      profiles: profiles.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
      })),
      expenses: expenses.map((e) => mapExpenseToResponse(e)),
    };
  }

  async updatePreferences(user: AuthUserPayload, dto: UpdatePreferencesDto) {
    const row = await this.prisma.userPreference.upsert({
      where: { userId: user.userId },
      create: {
        userId: user.userId,
        defaultCurrency: dto.defaultCurrency,
        monthlyIncome: dto.monthlyIncome,
      },
      update: {
        defaultCurrency: dto.defaultCurrency,
        monthlyIncome: dto.monthlyIncome,
      },
    });
    return {
      defaultCurrency: row.defaultCurrency,
      monthlyIncome: Number(row.monthlyIncome),
    };
  }

  async replaceCategories(user: AuthUserPayload, dto: ReplaceCategoriesDto) {
    const userId = user.userId;
    const names = [
      ...new Set(dto.names.map((n) => n.trim()).filter(Boolean)),
    ];
    if (names.length === 0) {
      throw new BadRequestException('Se requiere al menos una categoría');
    }
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.category.findMany({ where: { userId } });
      const nameSet = new Set(names);
      for (const cat of existing) {
        if (!nameSet.has(cat.name)) {
          const cnt = await tx.expense.count({
            where: { categoryId: cat.id },
          });
          if (cnt > 0) {
            throw new BadRequestException(
              `No se puede quitar la categoría "${cat.name}" porque tiene gastos asociados`,
            );
          }
          await tx.category.delete({ where: { id: cat.id } });
        }
      }
      for (const name of names) {
        await tx.category.upsert({
          where: { userId_name: { userId, name } },
          create: { userId, name },
          update: {},
        });
      }
    });
    return this.prisma.category.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }

  listProfiles(user: AuthUserPayload) {
    return this.prisma.profile.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, type: true },
    });
  }

  async createProfile(user: AuthUserPayload, dto: CreateProfileDto) {
    return this.prisma.profile.create({
      data: {
        userId: user.userId,
        name: dto.name.trim(),
        type: dto.type,
      },
      select: { id: true, name: true, type: true },
    });
  }

  async deleteProfile(user: AuthUserPayload, profileId: string) {
    const row = await this.prisma.profile.findFirst({
      where: { id: profileId, userId: user.userId },
    });
    if (!row) {
      throw new NotFoundException('Perfil no encontrado');
    }
    await this.prisma.profile.delete({ where: { id: profileId } });
  }

  async listProfileMembers(user: AuthUserPayload, profileId: string) {
    const p = await this.prisma.profile.findFirst({
      where: { id: profileId, userId: user.userId },
      select: { id: true },
    });
    if (!p) {
      throw new NotFoundException('Perfil no encontrado');
    }
    return this.prisma.profileMember.findMany({
      where: { profileId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, displayName: true, createdAt: true },
    });
  }

  async createProfileMember(
    user: AuthUserPayload,
    profileId: string,
    dto: CreateProfileMemberDto,
  ) {
    const p = await this.prisma.profile.findFirst({
      where: { id: profileId, userId: user.userId },
      select: { id: true },
    });
    if (!p) {
      throw new NotFoundException('Perfil no encontrado');
    }
    const displayName = dto.displayName.trim();
    return this.prisma.profileMember.create({
      data: { profileId, displayName },
      select: { id: true, displayName: true, createdAt: true },
    });
  }

  async deleteProfileMember(
    user: AuthUserPayload,
    profileId: string,
    memberId: string,
  ) {
    const p = await this.prisma.profile.findFirst({
      where: { id: profileId, userId: user.userId },
      select: { id: true },
    });
    if (!p) {
      throw new NotFoundException('Perfil no encontrado');
    }
    const row = await this.prisma.profileMember.findFirst({
      where: { id: memberId, profileId },
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException('Integrante no encontrado');
    }
    await this.prisma.profileMember.delete({ where: { id: memberId } });
  }

  async listExpenses(user: AuthUserPayload) {
    const rows = await this.prisma.expense.findMany({
      where: { profile: { userId: user.userId } },
      include: { category: true, profile: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((e) => mapExpenseToResponse(e));
  }

  async createExpense(user: AuthUserPayload, dto: CreateExpenseDto) {
    const userId = user.userId;
    const categoryId = await this.resolveCategoryId(userId, dto);
    const profileId = await this.resolveProfileId(userId, dto.profileId);
    const refStr = dto.referenceMonth ?? startOfCurrentMonthUtc();
    const rateYmd = dto.paymentDate ?? formatYmdInCaracas();
    const { vesPerUsd, rateDate } =
      await this.bcv.getVesPerUsdForCalendarDay(rateYmd);
    const paymentDate = parseYmdToUtcNoon(rateYmd);
    const row = await this.prisma.expense.create({
      data: {
        profileId,
        categoryId,
        title: dto.title.trim(),
        description: dto.description?.trim() ?? '',
        amount: dto.amount,
        referenceMonth: toReferenceMonthDate(refStr),
        paymentDate,
        bcvRateApplied: vesPerUsd,
        bcvRateDate: rateDate,
      },
      include: { category: true, profile: true },
    });
    return mapExpenseToResponse(row);
  }

  async patchExpense(
    user: AuthUserPayload,
    expenseId: string,
    dto: PatchExpenseDto,
  ) {
    const row = await this.prisma.expense.findFirst({
      where: {
        id: expenseId,
        profile: { userId: user.userId },
      },
      include: { category: true, profile: true },
    });
    if (!row) {
      throw new NotFoundException('Gasto no encontrado');
    }
    if (dto.isPaid) {
      const paidByMemberId = dto.paidByMemberId?.trim();
      const paidByLegacy = dto.paidByDisplayName?.trim();
      if (!paidByMemberId && !paidByLegacy) {
        throw new BadRequestException('Indica quién pagó');
      }
      let paidByDisplayName = paidByLegacy ?? '';
      if (paidByMemberId) {
        const member = await this.prisma.profileMember.findFirst({
          where: { id: paidByMemberId, profileId: row.profileId },
          select: { id: true, displayName: true },
        });
        if (!member) {
          throw new BadRequestException('Integrante inválido para este perfil');
        }
        paidByDisplayName = member.displayName;
      }
      const updated = await this.prisma.expense.update({
        where: { id: expenseId },
        data: {
          isPaid: true,
          paidByDisplayName,
          paidByMemberId: paidByMemberId ?? null,
          paidAt: new Date(),
        },
        include: { category: true, profile: true },
      });
      this.resendEmail
        .sendExpensePaidEmail({
          to: user.email,
          profileName: updated.profile.name,
          expenseTitle: updated.title,
          amountUsd: Number(updated.amount),
          categoryName: updated.category.name,
          paidByDisplayName,
        })
        .catch((err: unknown) => {
          this.logger.warn(`Error sending paid email: ${String(err)}`);
        });
      return mapExpenseToResponse(updated);
    }
    const updated = await this.prisma.expense.update({
      where: { id: expenseId },
      data: {
        isPaid: false,
        paidByDisplayName: null,
        paidByMemberId: null,
        paidAt: null,
      },
      include: { category: true, profile: true },
    });
    return mapExpenseToResponse(updated);
  }

  async deleteExpenses(user: AuthUserPayload, dto: DeleteExpensesDto) {
    const userId = user.userId;
    const deletable = await this.prisma.expense.findMany({
      where: {
        id: { in: dto.ids },
        profile: { userId },
      },
      select: { id: true },
    });
    const allowed = new Set(deletable.map((d) => d.id));
    if (allowed.size === 0) {
      return { deleted: 0 };
    }
    await this.prisma.expense.deleteMany({
      where: { id: { in: [...allowed] } },
    });
    return { deleted: allowed.size };
  }

  private async resolveCategoryId(
    userId: string,
    dto: CreateExpenseDto,
  ): Promise<string> {
    if (dto.categoryId) {
      const cat = await this.prisma.category.findFirst({
        where: { id: dto.categoryId, userId },
      });
      if (!cat) {
        throw new BadRequestException('Categoría inválida');
      }
      return cat.id;
    }
    const name = dto.categoryName?.trim();
    if (name) {
      const cat = await this.prisma.category.findFirst({
        where: { userId, name },
      });
      if (!cat) {
        throw new BadRequestException(`No existe la categoría "${name}"`);
      }
      return cat.id;
    }
    throw new BadRequestException('Indica categoría por id o nombre');
  }

  private async resolveProfileId(
    userId: string,
    profileId: string | undefined,
  ): Promise<string> {
    if (profileId) {
      const p = await this.prisma.profile.findFirst({
        where: { id: profileId, userId },
      });
      if (!p) {
        throw new BadRequestException('Perfil inválido');
      }
      return p.id;
    }
    const first = await this.prisma.profile.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    if (!first) {
      throw new BadRequestException(
        'Crea al menos un perfil antes de registrar gastos',
      );
    }
    return first.id;
  }
}
