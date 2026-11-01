import type { ConfigService } from '@nestjs/config';

const truthy = new Set(['true', '1', 'on', 'yes']);

export function isPaymentComparisonEnabled(config: ConfigService): boolean {
  const raw = config.get<string>('PAYMENT_COMPARISON_ENABLED', 'false');
  return truthy.has(String(raw).trim().toLowerCase());
}

export type ExchangeClientSettings = Readonly<{
  baseUrl: string;
  serviceKey: string;
  timeoutMs: number;
}>;

export function resolveExchangeClientSettings(
  config: ConfigService,
): ExchangeClientSettings | null {
  if (!isPaymentComparisonEnabled(config)) {
    return null;
  }
  const baseUrl = config.get<string>('EXCHANGE_API_URL', '').trim();
  const serviceKey = config.get<string>('EXCHANGE_SERVICE_KEY', '').trim();
  if (!baseUrl || !serviceKey) {
    return null;
  }
  const timeoutMs = config.get<number>('EXCHANGE_TIMEOUT_MS', 3000);
  return { baseUrl: baseUrl.replace(/\/$/, ''), serviceKey, timeoutMs };
}
