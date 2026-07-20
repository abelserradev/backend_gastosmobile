import { Injectable } from '@nestjs/common';
import type {
  ParsedTelegramIntent,
  TelegramAmountCurrency,
  TelegramIntentType,
} from './telegram.types';

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
  /\b(resumen|balance|tablero|cu[aá]nto (gast[ée]|llevo)|disponible)\b/i;
const QUERY_INCOMES_HINT =
  /\b(mis ingresos|cu[aá]nto ingres[ée]|total ingresos)\b/i;
const QUERY_EXPENSES_HINT =
  /\b(listar|ver|mostrar|cu[aá]les)\b.*\b(gastos?)\b|\bmis gastos\b/i;
const QUERY_INVENTORY_HINT =
  /\b(inventario|productos?|stock)\b/i;

const DELETE_HINT = /\b(eliminar|borrar|quitar|suprimir|delete)\b/i;
const UPDATE_HINT = /\b(modificar|cambiar|actualizar|corregir|editar)\b/i;

const EXPENSE_NOUN = /\b(gastos?)\b/i;
const INCOME_NOUN = /\b(ingresos?)\b/i;
const INVENTORY_NOUN = /\b(productos?|inventario|item|art[ií]culo)\b/i;

const AMOUNT_BS_PATTERN =
  /\b(\d+(?:[.,]\d{1,2})?)\s*(?:bs\.?|bol[ií]vares?)\b/i;
const AMOUNT_USD_PATTERN =
  /(?:\$|\busd\b|\u0024)\s*(\d+(?:[.,]\d{1,2})?)\s*(?:usd|\$|\u0024)?|\b(\d+(?:[.,]\d{1,2})?)\s*(?:usd|\$|\u0024)\b/i;
const NEW_AMOUNT_BS_PATTERN =
  /\b(?:a|por|en)\s+(\d+(?:[.,]\d{1,2})?)\s*(?:bs\.?|bol[ií]vares?)\b/i;
const NEW_AMOUNT_USD_PATTERN =
  /\b(?:a|por|en)\s+(?:(?:\$|\busd\b|\u0024)\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:usd|\$|\u0024)?\b/i;
/** Legacy: usado al limpiar títulos y búsquedas. */
const AMOUNT_PATTERN =
  /(?:\$|\busd\b|\u0024)?\s*(\d+(?:[.,]\d{1,2})?)\s*(?:usd|\$|\u0024)?|\b(\d+(?:[.,]\d{1,2})?)\s*(?:bs\.?|bol[ií]vares?)\b/i;
const NEW_AMOUNT_PATTERN = NEW_AMOUNT_USD_PATTERN;

export interface ParsedTelegramAmount {
  amount: number;
  currency?: TelegramAmountCurrency;
}

const LINK_CMD = /^\/(?:vincular|link)(?:@\w+)?(?:\s+(\d{6}))?\s*$/i;
const START_CMD = /^\/start(?:@\w+)?(?:\s+(\d{6}))?\s*$/i;

/**
 * NLU por reglas en español; prioriza borrar/editar/listar antes de crear.
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
      return { type: 'link', linkCode: linkMatch[1], rawText };
    }
    if (/^\/(?:ayuda|help)(?:@\w+)?\s*$/i.test(rawText)) {
      return { type: 'help', rawText };
    }
    if (LINK_CMD.test(rawText) || START_CMD.test(rawText)) {
      return { type: 'help', rawText };
    }

    const mutation = this.parseMutationIntent(
      rawText,
      normalized,
      categoryNames,
      sourceNames,
    );
    if (mutation) {
      return mutation;
    }

    if (QUERY_SUMMARY_HINT.test(normalized) && !QUERY_EXPENSES_HINT.test(normalized)) {
      return { type: 'query_summary', rawText };
    }
    if (QUERY_INCOMES_HINT.test(normalized)) {
      return { type: 'query_incomes', rawText };
    }
    if (QUERY_EXPENSES_HINT.test(normalized)) {
      return { type: 'query_expenses', rawText };
    }
    if (QUERY_INVENTORY_HINT.test(normalized) && !DELETE_HINT.test(normalized) && !UPDATE_HINT.test(normalized)) {
      return { type: 'query_inventory', rawText };
    }

    const parsedAmount = this.extractAmountWithCurrency(rawText);
    const amount = parsedAmount?.amount ?? null;
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
      amountCurrency: parsedAmount?.currency,
      categoryName,
      sourceName,
      title,
      rawText,
    };
  }

  extractAmountWithCurrency(text: string): ParsedTelegramAmount | null {
    const bsMatch = text.match(AMOUNT_BS_PATTERN);
    if (bsMatch) {
      const n = this.parseNumber(bsMatch[1]);
      return n != null ? { amount: n, currency: 'BS' } : null;
    }
    const usdMatch = text.match(AMOUNT_USD_PATTERN);
    if (usdMatch) {
      const raw = usdMatch[1] ?? usdMatch[2];
      const n = raw ? this.parseNumber(raw) : null;
      return n != null ? { amount: n, currency: 'USD' } : null;
    }
    const fallback = text.match(/\b(\d+(?:[.,]\d{1,2})?)\b/);
    if (!fallback) {
      return null;
    }
    const n = this.parseNumber(fallback[1]);
    return n != null ? { amount: n } : null;
  }

  extractAmount(text: string): number | null {
    return this.extractAmountWithCurrency(text)?.amount ?? null;
  }

  private extractNewAmountWithCurrency(text: string): ParsedTelegramAmount | null {
    const bsMatch = text.match(NEW_AMOUNT_BS_PATTERN);
    if (bsMatch) {
      const n = this.parseNumber(bsMatch[1]);
      return n != null ? { amount: n, currency: 'BS' } : null;
    }
    const usdMatch = text.match(NEW_AMOUNT_USD_PATTERN);
    if (!usdMatch) {
      return null;
    }
    const n = this.parseNumber(usdMatch[1]);
    return n != null ? { amount: n, currency: 'USD' } : null;
  }

  private parseMutationIntent(
    rawText: string,
    normalized: string,
    categoryNames: string[],
    sourceNames: string[],
  ): ParsedTelegramIntent | null {
    const isDelete = DELETE_HINT.test(normalized);
    const isUpdate = UPDATE_HINT.test(normalized);
    if (!isDelete && !isUpdate) {
      return null;
    }

    let entity: 'expense' | 'income' | 'inventory' | null = null;
    if (EXPENSE_NOUN.test(normalized)) {
      entity = 'expense';
    } else if (INCOME_NOUN.test(normalized)) {
      entity = 'income';
    } else if (INVENTORY_NOUN.test(normalized)) {
      entity = 'inventory';
    }
    if (!entity) {
      return null;
    }

    const newAmountParsed = this.extractNewAmountWithCurrency(rawText);
    const searchQuery = this.extractSearchQuery(rawText, entity);
    const categoryName =
      entity === 'expense'
        ? this.matchNamedEntity(rawText, categoryNames) ?? undefined
        : undefined;
    const sourceName =
      entity === 'income'
        ? this.matchNamedEntity(rawText, sourceNames) ?? undefined
        : undefined;
    const amountHintParsed = this.extractAmountWithCurrency(
      rawText
        .replace(NEW_AMOUNT_BS_PATTERN, ' ')
        .replace(NEW_AMOUNT_USD_PATTERN, ' '),
    );

    const prefix = isDelete ? 'delete' : 'update';
    const type = `${prefix}_${entity}` as ParsedTelegramIntent['type'];

    return {
      type,
      rawText,
      searchQuery,
      newAmount: newAmountParsed?.amount,
      newAmountCurrency: newAmountParsed?.currency,
      amount: amountHintParsed?.amount,
      amountCurrency: amountHintParsed?.currency,
      categoryName,
      sourceName,
    };
  }

  private extractSearchQuery(
    rawText: string,
    entity: 'expense' | 'income' | 'inventory',
  ): string | undefined {
    let t = rawText
      .replace(DELETE_HINT, ' ')
      .replace(UPDATE_HINT, ' ')
      .replace(EXPENSE_NOUN, ' ')
      .replace(INCOME_NOUN, ' ')
      .replace(INVENTORY_NOUN, ' ')
      .replace(NEW_AMOUNT_BS_PATTERN, ' ')
      .replace(NEW_AMOUNT_USD_PATTERN, ' ')
      .replace(AMOUNT_PATTERN, ' ')
      .replace(/\b(el|la|los|las|de|del|un|una|mi|mis|ultimo|último)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!t && entity === 'expense') {
      return undefined;
    }
    return t || undefined;
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
