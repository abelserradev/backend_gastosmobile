/**
 * Contrato JSON v1 de Exchange (POST /api/v1/comparaciones).
 * Espejo de exchange-rate/lib/api/v1/comparaciones.ts — validación en runtime antes de persistir.
 */

export type TasaV1 = Readonly<{
  valor: string;
  fechaFuente: string;
}>;

export type OpcionV1 = Readonly<{
  id: string;
  moneda: 'USD' | 'BS';
  montoCobrado: string;
  equivalenteBcvUsd: string;
  comisionPct: string | null;
  comisionUsd: string | null;
  costoRealUsd: string;
  costoRealBs: string;
  diferenciaVsMejorUsd: string;
  esMejor: boolean;
}>;

/** Respuesta almacenable tal cual en PaymentComparison.result */
export type ComparacionV1 = Readonly<{
  version: 'v1';
  computedAt: string;
  producto: string | null;
  tasas: {
    oficial: TasaV1;
    paralelo: TasaV1;
    desactualizado: boolean;
  };
  tasaVenta: { valor: string; origen: 'usuario' | 'paralelo' };
  precioBs: { modo: string; monto: string } | null;
  opciones: OpcionV1[];
  mejores: string[];
  empateTotal: boolean;
  ahorroUsd: string;
  tasaEquilibrio: string | null;
  recargoBsPct: string | null;
}>;

function serializarDecimalOpcional(valor: unknown): string | null {
  if (valor === null || valor === undefined) {
    return null;
  }
  if (typeof valor === 'string' || typeof valor === 'number') {
    return String(valor);
  }
  return null;
}

export class ExchangeContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExchangeContractError';
  }
}

function esTasaV1(valor: unknown): valor is TasaV1 {
  if (typeof valor !== 'object' || valor === null) {
    return false;
  }
  const t = valor as Record<string, unknown>;
  return typeof t.valor === 'string' && typeof t.fechaFuente === 'string';
}

function esOpcionV1(valor: unknown): valor is OpcionV1 {
  if (typeof valor !== 'object' || valor === null) {
    return false;
  }
  const o = valor as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    (o.moneda === 'USD' || o.moneda === 'BS') &&
    typeof o.montoCobrado === 'string' &&
    typeof o.costoRealUsd === 'string' &&
    typeof o.costoRealBs === 'string' &&
    typeof o.esMejor === 'boolean'
  );
}

/** Falla si Exchange devolvió un shape inesperado (503 en el cliente). */
export function parseComparacionV1(data: unknown): ComparacionV1 {
  if (typeof data !== 'object' || data === null) {
    throw new ExchangeContractError('Respuesta Exchange no es un objeto');
  }
  const body = data as Record<string, unknown>;
  if (body.version !== 'v1') {
    throw new ExchangeContractError(
      `Versión de contrato no soportada: ${String(body.version)}`,
    );
  }
  const tasas = body.tasas as Record<string, unknown> | undefined;
  if (
    !tasas ||
    !esTasaV1(tasas.oficial) ||
    !esTasaV1(tasas.paralelo) ||
    typeof tasas.desactualizado !== 'boolean'
  ) {
    throw new ExchangeContractError('Campo tasas inválido en respuesta v1');
  }
  if (!Array.isArray(body.opciones) || !body.opciones.every(esOpcionV1)) {
    throw new ExchangeContractError('Campo opciones inválido en respuesta v1');
  }
  if (
    !Array.isArray(body.mejores) ||
    !body.mejores.every((m) => typeof m === 'string')
  ) {
    throw new ExchangeContractError('Campo mejores inválido en respuesta v1');
  }
  const tasaVenta = body.tasaVenta as Record<string, unknown> | undefined;
  if (
    !tasaVenta ||
    typeof tasaVenta.valor !== 'string' ||
    (tasaVenta.origen !== 'usuario' && tasaVenta.origen !== 'paralelo')
  ) {
    throw new ExchangeContractError('Campo tasaVenta inválido en respuesta v1');
  }
  if (typeof body.computedAt !== 'string') {
    throw new ExchangeContractError('Campo computedAt inválido');
  }

  return {
    version: 'v1',
    computedAt: body.computedAt,
    producto: typeof body.producto === 'string' ? body.producto : null,
    tasas: {
      oficial: tasas.oficial,
      paralelo: tasas.paralelo,
      desactualizado: tasas.desactualizado,
    },
    tasaVenta: {
      valor: tasaVenta.valor,
      origen: tasaVenta.origen,
    },
    precioBs:
      body.precioBs === null
        ? null
        : typeof body.precioBs === 'object' &&
            body.precioBs !== null &&
            typeof (body.precioBs as Record<string, unknown>).modo ===
              'string' &&
            typeof (body.precioBs as Record<string, unknown>).monto === 'string'
          ? {
              modo: (body.precioBs as Record<string, string>).modo,
              monto: (body.precioBs as Record<string, string>).monto,
            }
          : null,
    opciones: body.opciones,
    mejores: body.mejores,
    empateTotal: Boolean(body.empateTotal),
    ahorroUsd:
      typeof body.ahorroUsd === 'string' || typeof body.ahorroUsd === 'number'
        ? String(body.ahorroUsd)
        : '0',
    tasaEquilibrio: serializarDecimalOpcional(body.tasaEquilibrio),
    recargoBsPct: serializarDecimalOpcional(body.recargoBsPct),
  };
}

/** Errores de campo que Exchange devuelve en 400. */
export function parseExchangeFieldErrors(
  data: unknown,
): Record<string, string> | null {
  if (typeof data !== 'object' || data === null) {
    return null;
  }
  const errores = (data as Record<string, unknown>).errores;
  if (typeof errores !== 'object' || errores === null) {
    return null;
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(errores)) {
    if (typeof v === 'string') {
      out[k] = v;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}
