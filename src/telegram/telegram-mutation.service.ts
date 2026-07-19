import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InventoryItemService } from '../inventory/inventory-item.service';
import type { AuthUserPayload } from '../common/types/auth-user.payload';
import { MeService } from '../me/me.service';
import { TelegramApiClient } from './telegram-api.client';
import { TelegramEntityResolverService } from './telegram-entity-resolver.service';
import { TelegramPendingService } from './telegram-pending.service';
import {
  formatDeleted,
  formatDeleteConfirm,
  formatDeleteExpenseList,
  formatErrorMessage,
  formatExpensesList,
  formatInventoryList,
  formatNeedNewAmount,
  formatNoInventoryProfile,
  formatNoMatches,
  formatPickPrompt,
  formatUpdated,
} from './telegram-message.formatter';
import type {
  ParsedTelegramIntent,
  TelegramEntityPick,
  TelegramPendingAction,
} from './telegram.types';

type MeState = Awaited<ReturnType<MeService['getState']>>;

@Injectable()
export class TelegramMutationService {
  private readonly logger = new Logger(TelegramMutationService.name);

  constructor(
    private readonly api: TelegramApiClient,
    private readonly me: MeService,
    private readonly inventoryItems: InventoryItemService,
    private readonly resolver: TelegramEntityResolverService,
    private readonly pending: TelegramPendingService,
  ) {}

  async dispatchMutation(
    chatId: string,
    user: AuthUserPayload,
    intent: ParsedTelegramIntent,
    state: MeState,
  ): Promise<void> {
    switch (intent.type) {
      case 'query_expenses':
        await this.listExpenses(chatId, state);
        return;
      case 'query_inventory':
        await this.listInventory(chatId, user, state);
        return;
      case 'delete_expense':
        await this.deleteExpenseIntent(chatId, user, intent, state);
        return;
      case 'delete_income':
        await this.deleteIncomeIntent(chatId, user, intent, state);
        return;
      case 'delete_inventory':
        await this.deleteInventoryIntent(chatId, user, intent, state);
        return;
      case 'update_expense':
        await this.updateExpenseIntent(chatId, user, intent, state);
        return;
      case 'update_income':
        await this.updateIncomeIntent(chatId, user, intent, state);
        return;
      case 'update_inventory':
        await this.updateInventoryIntent(chatId, user, intent, state);
        return;
      default:
        return;
    }
  }

  isMutationIntent(type: ParsedTelegramIntent['type']): boolean {
    return [
      'query_expenses',
      'query_inventory',
      'delete_expense',
      'delete_income',
      'delete_inventory',
      'update_expense',
      'update_income',
      'update_inventory',
    ].includes(type);
  }

  async handleEntityCallback(
    chatId: string,
    user: AuthUserPayload,
    data: string,
  ): Promise<boolean> {
    const pickDelExpense = /^tg:pick:del:e:([a-f0-9]{8})$/i.exec(data);
    if (pickDelExpense) {
      await this.sendExpenseDeleteConfirm(
        chatId,
        user,
        pickDelExpense[1].toLowerCase(),
      );
      return true;
    }

    const okDelExpense = /^tg:ok:del:e:([a-f0-9]{8})$/i.exec(data);
    if (okDelExpense) {
      await this.executeDeleteByShortId(
        chatId,
        user,
        'e',
        okDelExpense[1].toLowerCase(),
      );
      return true;
    }

    const delMatch = /^tg:del:([eip]):([a-f0-9]{8})$/i.exec(data);
    if (delMatch) {
      const code = delMatch[1] as 'e' | 'i' | 'p';
      const shortId = delMatch[2].toLowerCase();
      if (code === 'e') {
        await this.sendExpenseDeleteConfirm(chatId, user, shortId);
        return true;
      }
      await this.executeDeleteByShortId(chatId, user, code, shortId);
      return true;
    }

    const updMatch = /^tg:upd:([eip]):([a-f0-9]{8})$/i.exec(data);
    if (updMatch) {
      await this.executeUpdateByShortId(
        chatId,
        user,
        updMatch[1] as 'e' | 'i' | 'p',
        updMatch[2].toLowerCase(),
      );
      return true;
    }

    return false;
  }

  async tryCompletePendingAmount(
    chatId: string,
    user: AuthUserPayload,
    text: string,
  ): Promise<boolean> {
    const pending = await this.pending.get(chatId);
    if (!pending?.pendingUpdate) {
      return false;
    }
    const amount = Number.parseFloat(text.replace(',', '.'));
    if (!Number.isFinite(amount) || amount < 0) {
      return false;
    }
    pending.pendingUpdate.newAmount = amount;
    await this.pending.clear(chatId);
    try {
      await this.applyPendingUpdate(chatId, user, pending.pendingUpdate);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error';
      await this.api.sendMessage(chatId, formatErrorMessage(msg));
    }
    return true;
  }

  private async listExpenses(chatId: string, state: MeState): Promise<void> {
    const total = state.expenses.reduce((s, e) => s + e.amount, 0);
    await this.api.sendMessage(
      chatId,
      formatExpensesList(
        state.activePeriod?.label ?? 'Periodo actual',
        state.expenses.map((e) => ({
          title: e.title,
          amount: e.amount,
          categoryName: e.category,
          isPaid: e.isPaid,
        })),
        total,
      ),
    );
  }

  private async listInventory(
    chatId: string,
    user: AuthUserPayload,
    state: MeState,
  ): Promise<void> {
    const profile = this.resolveComercioProfile(state);
    if (!profile) {
      await this.api.sendMessage(chatId, formatNoInventoryProfile());
      return;
    }
    const items = await this.inventoryItems.listItems(profile.id, user.userId);
    await this.api.sendMessage(
      chatId,
      formatInventoryList(
        profile.name,
        items.map((i) => ({
          name: i.name,
          currentStock: i.currentStock,
          unit: i.unit,
        })),
      ),
    );
  }

  private async deleteExpenseIntent(
    chatId: string,
    _user: AuthUserPayload,
    intent: ParsedTelegramIntent,
    state: MeState,
  ): Promise<void> {
    const periodLabel = state.activePeriod?.label ?? 'Periodo actual';
    const searchQuery = intent.searchQuery ?? intent.categoryName;
    const hasFilter = Boolean(searchQuery?.trim());
    let picks: TelegramEntityPick[] = [];
    let fallbackFull = false;

    if (state.expenses.length === 0) {
      await this.api.sendMessage(
        chatId,
        formatDeleteExpenseList(periodLabel, [], 0),
      );
      return;
    }

    if (hasFilter) {
      picks = this.resolver.matchExpenses(
        state.expenses,
        searchQuery,
        intent.amount,
      );
      if (picks.length === 0) {
        picks = this.resolver.listAllExpenses(state.expenses);
        fallbackFull = true;
      }
    } else {
      picks = this.resolver.listAllExpenses(state.expenses);
    }

    await this.offerExpenseDeleteList(chatId, state, picks, {
      filtered: hasFilter && !fallbackFull,
      fallbackFull,
    });
  }

  private async deleteIncomeIntent(
    chatId: string,
    user: AuthUserPayload,
    intent: ParsedTelegramIntent,
    state: MeState,
  ): Promise<void> {
    const picks = this.resolver.matchIncomes(
      state.incomes,
      intent.searchQuery ?? intent.sourceName,
      intent.amount,
    );
    await this.offerDeletePicks(chatId, picks, 'Ingreso');
  }

  private async deleteInventoryIntent(
    chatId: string,
    user: AuthUserPayload,
    intent: ParsedTelegramIntent,
    state: MeState,
  ): Promise<void> {
    const profile = this.resolveComercioProfile(state);
    if (!profile) {
      await this.api.sendMessage(chatId, formatNoInventoryProfile());
      return;
    }
    const items = await this.inventoryItems.listItems(profile.id, user.userId);
    const picks = this.resolver.matchInventoryItems(
      items,
      profile.id,
      intent.searchQuery,
    );
    await this.offerDeletePicks(chatId, picks, 'Producto');
  }

  private async updateExpenseIntent(
    chatId: string,
    user: AuthUserPayload,
    intent: ParsedTelegramIntent,
    state: MeState,
  ): Promise<void> {
    const picks = this.resolver.matchExpenses(
      state.expenses,
      intent.searchQuery ?? intent.categoryName,
      intent.amount,
    );
    await this.offerUpdatePicks(chatId, user, picks, 'expense', intent);
  }

  private async updateIncomeIntent(
    chatId: string,
    user: AuthUserPayload,
    intent: ParsedTelegramIntent,
    state: MeState,
  ): Promise<void> {
    const picks = this.resolver.matchIncomes(
      state.incomes,
      intent.searchQuery ?? intent.sourceName,
      intent.amount,
    );
    await this.offerUpdatePicks(chatId, user, picks, 'income', intent);
  }

  private async updateInventoryIntent(
    chatId: string,
    user: AuthUserPayload,
    intent: ParsedTelegramIntent,
    state: MeState,
  ): Promise<void> {
    const profile = this.resolveComercioProfile(state);
    if (!profile) {
      await this.api.sendMessage(chatId, formatNoInventoryProfile());
      return;
    }
    const items = await this.inventoryItems.listItems(profile.id, user.userId);
    const picks = this.resolver.matchInventoryItems(
      items,
      profile.id,
      intent.searchQuery,
    );
    await this.offerUpdatePicks(chatId, user, picks, 'inventory', intent);
  }

  private async offerExpenseDeleteList(
    chatId: string,
    state: MeState,
    picks: TelegramEntityPick[],
    options: { filtered: boolean; fallbackFull: boolean },
  ): Promise<void> {
    const periodLabel = state.activePeriod?.label ?? 'Periodo actual';
    await this.api.sendMessage(
      chatId,
      formatDeleteExpenseList(
        periodLabel,
        picks,
        state.expenses.length,
        options,
      ),
      { replyMarkup: this.buildExpenseDeletePickKeyboard(picks) },
    );
  }

  private async sendExpenseDeleteConfirm(
    chatId: string,
    user: AuthUserPayload,
    shortId: string,
  ): Promise<void> {
    const state = await this.me.getState(user);
    const id = this.resolver.resolveShortId(
      state.expenses.map((e) => e.id),
      shortId,
    );
    if (!id) {
      await this.api.sendMessage(chatId, formatErrorMessage('Gasto no encontrado'));
      return;
    }
    const target = state.expenses.find((e) => e.id === id)!;
    const label = `$${target.amount.toFixed(2)} · ${target.category} — ${target.title}`;
    await this.api.sendMessage(chatId, formatDeleteConfirm(label), {
      replyMarkup: {
        inline_keyboard: [
          [
            {
              text: 'Sí, eliminar',
              callback_data: `tg:ok:del:e:${shortId}`,
            },
          ],
          [{ text: 'Cancelar', callback_data: 'tg:intent:cancel' }],
        ],
      },
    });
  }

  private buildExpenseDeletePickKeyboard(
    picks: TelegramEntityPick[],
  ): { inline_keyboard: { text: string; callback_data: string }[][] } {
    const rows = picks.map((p, index) => [
      {
        text: `${index + 1}. ${p.label.slice(0, 36)}`,
        callback_data: `tg:pick:del:e:${this.resolver.toShortId(p.id)}`,
      },
    ]);
    rows.push([{ text: 'Cancelar', callback_data: 'tg:intent:cancel' }]);
    return { inline_keyboard: rows };
  }

  private async offerDeletePicks(
    chatId: string,
    picks: TelegramEntityPick[],
    kindLabel: string,
  ): Promise<void> {
    if (picks.length === 0) {
      await this.api.sendMessage(chatId, formatNoMatches(kindLabel.toLowerCase()));
      return;
    }
    if (picks.length === 1) {
      await this.sendDeleteButtons(chatId, picks, kindLabel);
      return;
    }
    await this.api.sendMessage(
      chatId,
      formatPickPrompt(`Varios ${kindLabel.toLowerCase()}s coinciden`),
      { replyMarkup: this.buildActionKeyboard(picks, 'del') },
    );
  }

  private async offerUpdatePicks(
    chatId: string,
    user: AuthUserPayload,
    picks: TelegramEntityPick[],
    kind: TelegramEntityPick['kind'],
    intent: ParsedTelegramIntent,
  ): Promise<void> {
    const kindLabel =
      kind === 'expense' ? 'gasto' : kind === 'income' ? 'ingreso' : 'producto';
    if (picks.length === 0) {
      await this.api.sendMessage(chatId, formatNoMatches(kindLabel));
      return;
    }
    if (intent.newAmount == null && kind !== 'inventory') {
      if (picks.length === 1) {
        await this.pending.save(chatId, {
          rawText: intent.rawText,
          pendingUpdate: {
            kind,
            id: picks[0].id,
            profileId: picks[0].profileId,
          },
        });
        await this.api.sendMessage(chatId, formatNeedNewAmount(kindLabel));
        return;
      }
      await this.pending.save(chatId, {
        rawText: intent.rawText,
        picks,
        pendingUpdate: { kind, id: picks[0].id },
      });
      await this.api.sendMessage(chatId, formatPickPrompt('Indica cuál cambiar'), {
        replyMarkup: this.buildActionKeyboard(picks, 'upd'),
      });
      await this.api.sendMessage(chatId, formatNeedNewAmount(kindLabel));
      return;
    }

    if (picks.length === 1) {
      await this.applyUpdatePick(chatId, user, picks[0], intent);
      return;
    }
    await this.pending.save(chatId, {
      rawText: intent.rawText,
      picks,
      pendingUpdate: {
        kind,
        id: picks[0].id,
        newAmount: intent.newAmount,
        salePrice: intent.newAmount,
      },
    });
    await this.api.sendMessage(chatId, formatPickPrompt('Elige cuál actualizar'), {
      replyMarkup: this.buildActionKeyboard(picks, 'upd'),
    });
  }

  private async sendDeleteButtons(
    chatId: string,
    picks: TelegramEntityPick[],
    kindLabel: string,
  ): Promise<void> {
    await this.api.sendMessage(
      chatId,
      `¿Eliminar este ${kindLabel.toLowerCase()}?`,
      { replyMarkup: this.buildActionKeyboard(picks, 'del') },
    );
  }

  private buildActionKeyboard(
    picks: TelegramEntityPick[],
    action: 'del' | 'upd',
  ): { inline_keyboard: { text: string; callback_data: string }[][] } {
    const prefix = action === 'del' ? 'tg:del' : 'tg:upd';
    const kindCode = (k: TelegramEntityPick['kind']) =>
      k === 'expense' ? 'e' : k === 'income' ? 'i' : 'p';
    const rows = picks.map((p) => [
      {
        text: p.label.slice(0, 40),
        callback_data: `${prefix}:${kindCode(p.kind)}:${this.resolver.toShortId(p.id)}`,
      },
    ]);
    rows.push([{ text: 'Cancelar', callback_data: 'tg:intent:cancel' }]);
    return { inline_keyboard: rows };
  }

  private async executeDeleteByShortId(
    chatId: string,
    user: AuthUserPayload,
    code: 'e' | 'i' | 'p',
    shortId: string,
  ): Promise<void> {
    const state = await this.me.getState(user);
    try {
      if (code === 'e') {
        const id = this.resolver.resolveShortId(
          state.expenses.map((e) => e.id),
          shortId,
        );
        if (!id) {
          throw new BadRequestException('Gasto no encontrado');
        }
        const target = state.expenses.find((e) => e.id === id)!;
        await this.me.deleteExpenses(user, { ids: [id] });
        await this.api.sendMessage(
          chatId,
          formatDeleted(
            'Gasto',
            `$${target.amount.toFixed(2)} · ${target.category} — ${target.title}`,
          ),
        );
        return;
      }
      if (code === 'i') {
        const id = this.resolver.resolveShortId(
          state.incomes.map((i) => i.id),
          shortId,
        );
        if (!id) {
          throw new BadRequestException('Ingreso no encontrado');
        }
        const target = state.incomes.find((i) => i.id === id)!;
        await this.me.deleteIncomes(user, { ids: [id] });
        await this.api.sendMessage(
          chatId,
          formatDeleted(
            'Ingreso',
            `$${target.amount.toFixed(2)} · ${target.source} — ${target.title}`,
          ),
        );
        return;
      }
      const profile = this.resolveComercioProfile(state);
      if (!profile) {
        throw new BadRequestException('Sin perfil comercio');
      }
      const items = await this.inventoryItems.listItems(profile.id, user.userId);
      const id = this.resolver.resolveShortId(
        items.map((i) => i.id),
        shortId,
      );
      if (!id) {
        throw new BadRequestException('Producto no encontrado');
      }
      const target = items.find((i) => i.id === id)!;
      await this.inventoryItems.deleteItem(profile.id, id, user.userId);
      await this.api.sendMessage(chatId, formatDeleted('Producto', target.name));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error';
      await this.api.sendMessage(chatId, formatErrorMessage(msg));
    }
  }

  private async executeUpdateByShortId(
    chatId: string,
    user: AuthUserPayload,
    code: 'e' | 'i' | 'p',
    shortId: string,
  ): Promise<void> {
    const pending = await this.pending.get(chatId);
    const newAmount = pending?.pendingUpdate?.newAmount;
    const salePrice = pending?.pendingUpdate?.salePrice;
    await this.pending.clear(chatId);

    const state = await this.me.getState(user);
    try {
      if (code === 'e') {
        const id = this.resolver.resolveShortId(
          state.expenses.map((e) => e.id),
          shortId,
        );
        if (!id) {
          throw new BadRequestException('Gasto no encontrado');
        }
        if (newAmount == null) {
          await this.pending.save(chatId, {
            rawText: '',
            pendingUpdate: { kind: 'expense', id },
          });
          await this.api.sendMessage(chatId, formatNeedNewAmount('gasto'));
          return;
        }
        const updated = await this.me.updateExpenseFields(user, id, {
          amount: newAmount,
        });
        await this.api.sendMessage(
          chatId,
          formatUpdated(
            'Gasto',
            `$${updated.amount.toFixed(2)} · ${updated.category} — ${updated.title}`,
          ),
        );
        return;
      }
      if (code === 'i') {
        const id = this.resolver.resolveShortId(
          state.incomes.map((i) => i.id),
          shortId,
        );
        if (!id) {
          throw new BadRequestException('Ingreso no encontrado');
        }
        if (newAmount == null) {
          await this.pending.save(chatId, {
            rawText: '',
            pendingUpdate: { kind: 'income', id },
          });
          await this.api.sendMessage(chatId, formatNeedNewAmount('ingreso'));
          return;
        }
        const updated = await this.me.updateIncomeFields(user, id, {
          amount: newAmount,
        });
        await this.api.sendMessage(
          chatId,
          formatUpdated(
            'Ingreso',
            `$${updated.amount.toFixed(2)} · ${updated.source} — ${updated.title}`,
          ),
        );
        return;
      }
      const profile = this.resolveComercioProfile(state);
      if (!profile) {
        throw new BadRequestException('Sin perfil comercio');
      }
      const items = await this.inventoryItems.listItems(profile.id, user.userId);
      const id = this.resolver.resolveShortId(
        items.map((i) => i.id),
        shortId,
      );
      if (!id) {
        throw new BadRequestException('Producto no encontrado');
      }
      const price = salePrice ?? newAmount;
      if (price == null) {
        throw new BadRequestException('Indica el nuevo precio: cambiar producto X a 2.50');
      }
      const updated = await this.inventoryItems.updateItem(profile.id, id, user.userId, {
        salePrice: price,
      });
      await this.api.sendMessage(
        chatId,
        formatUpdated('Producto', `${updated.name} · precio $${price.toFixed(2)}`),
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error';
      await this.api.sendMessage(chatId, formatErrorMessage(msg));
    }
  }

  private async applyUpdatePick(
    chatId: string,
    user: AuthUserPayload,
    pick: TelegramEntityPick,
    intent: ParsedTelegramIntent,
  ): Promise<void> {
    if (pick.kind === 'expense' && intent.newAmount != null) {
      const updated = await this.me.updateExpenseFields(user, pick.id, {
        amount: intent.newAmount,
        categoryName: intent.categoryName,
        title: intent.title,
      });
      await this.api.sendMessage(
        chatId,
        formatUpdated(
          'Gasto',
          `$${updated.amount.toFixed(2)} · ${updated.category} — ${updated.title}`,
        ),
      );
      return;
    }
    if (pick.kind === 'income' && intent.newAmount != null) {
      const updated = await this.me.updateIncomeFields(user, pick.id, {
        amount: intent.newAmount,
        sourceName: intent.sourceName,
      });
      await this.api.sendMessage(
        chatId,
        formatUpdated(
          'Ingreso',
          `$${updated.amount.toFixed(2)} · ${updated.source} — ${updated.title}`,
        ),
      );
      return;
    }
    if (pick.kind === 'inventory' && intent.newAmount != null && pick.profileId) {
      const updated = await this.inventoryItems.updateItem(
        pick.profileId,
        pick.id,
        user.userId,
        { salePrice: intent.newAmount },
      );
      await this.api.sendMessage(
        chatId,
        formatUpdated(
          'Producto',
          `${updated.name} · precio $${intent.newAmount.toFixed(2)}`,
        ),
      );
    }
  }

  private async applyPendingUpdate(
    chatId: string,
    user: AuthUserPayload,
    upd: NonNullable<TelegramPendingAction['pendingUpdate']>,
  ): Promise<void> {
    if (upd.kind === 'expense') {
      const updated = await this.me.updateExpenseFields(user, upd.id, {
        amount: upd.newAmount,
      });
      await this.api.sendMessage(
        chatId,
        formatUpdated(
          'Gasto',
          `$${updated.amount.toFixed(2)} · ${updated.category} — ${updated.title}`,
        ),
      );
      return;
    }
    if (upd.kind === 'income') {
      const updated = await this.me.updateIncomeFields(user, upd.id, {
        amount: upd.newAmount,
      });
      await this.api.sendMessage(
        chatId,
        formatUpdated(
          'Ingreso',
          `$${updated.amount.toFixed(2)} · ${updated.source} — ${updated.title}`,
        ),
      );
    }
  }

  private resolveComercioProfile(state: MeState): { id: string; name: string } | null {
    const p = state.profiles.find((x) => x.type === 'comercio');
    return p ? { id: p.id, name: p.name } : null;
  }
}
