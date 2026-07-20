export type AmountCurrency = 'USD' | 'BS';

/** Convierte monto de captura a USD canónico del tablero. */
export function resolveAmountUsd(
  amount: number,
  amountCurrency: AmountCurrency | undefined,
  vesPerUsd: number,
): number {
  if (amountCurrency === 'BS') {
    if (!Number.isFinite(vesPerUsd) || vesPerUsd <= 0) {
      throw new Error('Tasa BCV inválida');
    }
    return amount / vesPerUsd;
  }
  return amount;
}
