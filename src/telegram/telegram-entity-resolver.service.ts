import { Injectable } from '@nestjs/common';
import type { InventoryItemResponse } from '../inventory/entities/inventory-item.response';
import type { TelegramEntityPick } from './telegram.types';

interface ExpenseLike {
  id: string;
  title: string;
  amount: number;
  category: string;
}

interface IncomeLike {
  id: string;
  title: string;
  amount: number;
  source: string;
}

/**
 * Empareja mensajes naturales con registros del periodo activo.
 * Prefijo corto en callbacks = primer segmento UUID (8 hex).
 */
@Injectable()
export class TelegramEntityResolverService {
  /** Alineado con listados Telegram y teclados inline (límite callback_data). */
  static readonly MAX_PICKS = 8;

  toShortId(fullId: string): string {
    return fullId.replace(/-/g, '').slice(0, 8);
  }

  resolveShortId(fullIds: string[], shortId: string): string | null {
    const hit = fullIds.find((id) => this.toShortId(id) === shortId);
    return hit ?? null;
  }

  matchExpenses(
    expenses: ExpenseLike[],
    searchQuery?: string,
    amountHint?: number,
  ): TelegramEntityPick[] {
    return this.rank(
      expenses.map((e) => this.toExpensePickRow(e)),
      searchQuery,
      amountHint,
    );
  }

  /** Lista del periodo activo sin fuzzy; respeta el orden del estado (más recientes primero). */
  listAllExpenses(expenses: ExpenseLike[]): TelegramEntityPick[] {
    return expenses
      .slice(0, TelegramEntityResolverService.MAX_PICKS)
      .map((e) => this.toExpensePick(e));
  }

  private toExpensePick(e: ExpenseLike): TelegramEntityPick {
    return {
      kind: 'expense',
      id: e.id,
      label: `$${e.amount.toFixed(2)} · ${e.category} — ${e.title}`,
    };
  }

  private toExpensePickRow(e: ExpenseLike) {
    return {
      kind: 'expense' as const,
      id: e.id,
      label: `$${e.amount.toFixed(2)} · ${e.category} — ${e.title}`,
      haystack: `${e.title} ${e.category} ${e.amount}`,
      amount: e.amount,
    };
  }

  matchIncomes(
    incomes: IncomeLike[],
    searchQuery?: string,
    amountHint?: number,
  ): TelegramEntityPick[] {
    return this.rank(
      incomes.map((i) => ({
        kind: 'income' as const,
        id: i.id,
        label: `$${i.amount.toFixed(2)} · ${i.source} — ${i.title}`,
        haystack: `${i.title} ${i.source} ${i.amount}`,
        amount: i.amount,
      })),
      searchQuery,
      amountHint,
    );
  }

  matchInventoryItems(
    items: InventoryItemResponse[],
    profileId: string,
    searchQuery?: string,
  ): TelegramEntityPick[] {
    return this.rank(
      items.map((item) => ({
        kind: 'inventory' as const,
        id: item.id,
        profileId,
        label: `${item.name} · stock ${item.currentStock}${item.unit ? ` ${item.unit}` : ''}`,
        haystack: `${item.name} ${item.sku ?? ''} ${item.currentStock}`,
      })),
      searchQuery,
    );
  }

  private rank(
    rows: {
      kind: TelegramEntityPick['kind'];
      id: string;
      profileId?: string;
      label: string;
      haystack: string;
      amount?: number;
    }[],
    searchQuery?: string,
    amountHint?: number,
  ): TelegramEntityPick[] {
    const q = searchQuery?.trim().toLowerCase();
    const scored = rows
      .map((row) => {
        let score = 0;
        const hay = row.haystack.toLowerCase();
        if (q) {
          if (hay.includes(q)) {
            score += q.length + 5;
          } else {
            const tokens = q.split(/\s+/).filter((t) => t.length > 2);
            for (const t of tokens) {
              if (hay.includes(t)) {
                score += t.length;
              }
            }
          }
        } else {
          score += 1;
        }
        if (amountHint != null && row.amount != null) {
          if (Math.abs(row.amount - amountHint) < 0.01) {
            score += 20;
          }
        }
        return { row, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, TelegramEntityResolverService.MAX_PICKS).map(({ row }) => ({
      kind: row.kind,
      id: row.id,
      profileId: row.profileId,
      label: row.label,
    }));
  }
}
