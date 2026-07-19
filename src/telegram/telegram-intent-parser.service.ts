import { Injectable } from '@nestjs/common';
import type { ParsedTelegramIntent, TelegramIntentType } from './telegram.types';

const WORD_END = String.raw`(?=\s|$|[.,!?;:])`;

const EXPENSE_HINT = new RegExp(
  String.raw`\b(gast[ée]|gastos?|pagu[ée]|pago|compr[ée]|sal[ií][óo]|gaste)${WORD_END}`,
  'i',
);
const INCOME_HINT = new RegExp(
  String.raw`\b(recib[íi]|cobr[ée]|ingreso|me pagaron|depositaron|entr[óo])${WORD_END}`,
  'i',
);
const QUERY_SUMMARY_HINT =
  /\b(resumen|balance|tablero|cu[aá]nto (gast[ée]|llevo)|mis gastos|disponible)\b/i;
const QUERY_INCOMES_HINT =
  /\b(mis ingresos|cu[aá]nto ingres[ée]|total ingresos)\b/i;

const AMOUNT_PATTERN =
  /(?:\$|\busd\b|\u0024)?\s*(\d+(?:[.,]\d{1,2})?)\s*(?:usd|\$|\u0024)?|\b(\d+(?:[.,]\d{1,2})?)\s*(?:bs\.?|bol[ií]vares?)\b/i;

const LINK_CMD = /^\/(?:vincular|link)(?:@\w+)?(?:\s+(\d{6}))?\s*$/i;
const START_CMD = /^\/start(?:@\w+)?(?:\s+(\d{6}))?\s*$/i;

/**
 * NLU por reglas en español (MVP); sin LLM para mantener latencia y costo bajos.
 */
@Injectable()
export class TelegramIntentParserService {
  parse(
    text: string,
    categoryNames: string[],
    sourceNames: string[],
  ): ParsedTelegramIntent {
    const rawText = text.trim();
    const normalized = rawText.toLowerCase();

    const linkMatch = rawText.match(LINK_CMD) ?? rawText.match(START_CMD);
    if (linkMatch?.[1]) {
      return {
        type: 'link',
        linkCode: linkMatch[1],
        rawText,
      };
    }
    if (/^\/(?:ayuda|help)(?:@\w+)?\s*$/i.test(rawText)) {
      return { type: 'help', rawText };
    }
    if (LINK_CMD.test(rawText) || START_CMD.test(rawText)) {
      return { type: 'help', rawText };
    }

    if (QUERY_SUMMARY_HINT.test(normalized)) {
      return { type: 'query_summary', rawText };
    }
    if (QUERY_INCOMES_HINT.test(normalized)) {
      return { type: 'query_incomes', rawText };
    }

    const amount = this.extractAmount(rawText);
    const expenseScore = EXPENSE_HINT.test(normalized) ? 2 : 0;
    const incomeScore = INCOME_HINT.test(normalized) ? 2 : 0;

    let type: TelegramIntentType = 'unknown';
    if (expenseScore > incomeScore) {
      type = 'expense';
    } else if (incomeScore > expenseScore) {
      type = 'income';
    } else if (amount != null && expenseScore === incomeScore) {
      type = 'unknown';
    }

    const categoryName =
      type === 'expense'
        ? this.matchNamedEntity(rawText, categoryNames) ?? 'Varios'
        : undefined;
    const sourceName =
      type === 'income'
        ? this.matchNamedEntity(rawText, sourceNames) ?? 'Otros'
        : undefined;
    const title = this.buildTitle(rawText, amount, categoryName ?? sourceName);

    return {
      type,
      amount: amount ?? undefined,
      categoryName,
      sourceName,
      title,
      rawText,
    };
  }

  extractAmount(text: string): number | null {
    const match = text.match(AMOUNT_PATTERN);
    if (!match) {
      const fallback = text.match(/\b(\d+(?:[.,]\d{1,2})?)\b/);
      if (!fallback) {
        return null;
      }
      return this.parseNumber(fallback[1]);
    }
    const raw = match[1] ?? match[2];
    return raw ? this.parseNumber(raw) : null;
  }

  private parseNumber(raw: string): number | null {
    const n = Number.parseFloat(raw.replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  private matchNamedEntity(text: string, names: string[]): string | null {
    const lower = text.toLowerCase();
    let best: { name: string; score: number } | null = null;
    for (const name of names) {
      const n = name.trim().toLowerCase();
      if (n.length < 2) {
        continue;
      }
      if (!lower.includes(n)) {
        continue;
      }
      const score = n.length;
      if (!best || score > best.score) {
        best = { name: name.trim(), score };
      }
    }
    return best?.name ?? null;
  }

  private buildTitle(
    text: string,
    amount: number | null,
    entity?: string,
  ): string {
    let t = text
      .replace(AMOUNT_PATTERN, ' ')
      .replace(/\b(en|de|por|para|con|el|la|los|las|un|una)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (entity) {
      t = t.replace(new RegExp(entity, 'i'), ' ').replace(/\s+/g, ' ').trim();
    }
    if (!t && entity) {
      return entity.slice(0, 200);
    }
    if (!t) {
      return entity?.slice(0, 200) ?? 'Registro Telegram';
    }
    return t.slice(0, 200);
  }
}
