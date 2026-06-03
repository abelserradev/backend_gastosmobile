import { BadRequestException } from '@nestjs/common';
import { MovementType } from './dto/create-movement.dto';
import {
  calculateMovementLineValue,
  parseDecimalPrice,
  resolvePersistedUnitPrice,
  validateOptionalPrice,
} from './inventory-pricing.util';

/**
 * FEAT-004 — reglas de precio antes de persistencia.
 * Spec: FEAT-inventory-pricing-optional.md § Reglas de negocio 3–5.
 */
describe('inventory-pricing.util (FEAT-004)', () => {
  describe('resolvePersistedUnitPrice', () => {
    it('debe persistir unitPrice en SALE cuando se envía', () => {
      expect(
        resolvePersistedUnitPrice(MovementType.SALE, 2.5),
      ).toBe(2.5);
    });

    it('debe permitir SALE sin unitPrice (null)', () => {
      expect(resolvePersistedUnitPrice(MovementType.SALE, null)).toBeNull();
      expect(resolvePersistedUnitPrice(MovementType.SALE, undefined)).toBeNull();
    });

    it('debe persistir unitPrice opcional en PURCHASE', () => {
      expect(
        resolvePersistedUnitPrice(MovementType.PURCHASE, 1.75),
      ).toBe(1.75);
    });

    it('debe persistir unitPrice opcional en INITIAL y RETURN', () => {
      expect(
        resolvePersistedUnitPrice(MovementType.INITIAL, 3),
      ).toBe(3);
      expect(
        resolvePersistedUnitPrice(MovementType.RETURN, 4),
      ).toBe(4);
    });

    it('debe ignorar unitPrice en TRANSFER_OUT aunque el cliente lo envíe', () => {
      expect(
        resolvePersistedUnitPrice(MovementType.TRANSFER_OUT, 9.99),
      ).toBeNull();
    });

    it('debe ignorar unitPrice en TRANSFER_IN aunque el cliente lo envíe', () => {
      expect(
        resolvePersistedUnitPrice(MovementType.TRANSFER_IN, 5),
      ).toBeNull();
    });

    it('debe ignorar unitPrice en ADJUSTMENT', () => {
      expect(
        resolvePersistedUnitPrice(MovementType.ADJUSTMENT, 2),
      ).toBeNull();
    });
  });

  describe('validateOptionalPrice', () => {
    it('no debe lanzar si el precio es null o undefined', () => {
      expect(() => validateOptionalPrice(null)).not.toThrow();
      expect(() => validateOptionalPrice(undefined)).not.toThrow();
    });

    it('debe aceptar precio cero', () => {
      expect(() => validateOptionalPrice(0)).not.toThrow();
    });

    it('debe rechazar precios negativos', () => {
      expect(() => validateOptionalPrice(-0.01)).toThrow(BadRequestException);
      expect(() => validateOptionalPrice(-1)).toThrow(BadRequestException);
    });
  });

  describe('parseDecimalPrice', () => {
    it('debe convertir Decimal de Prisma a number', () => {
      const decimalLike = { toNumber: () => 2.5 };
      expect(parseDecimalPrice(decimalLike)).toBe(2.5);
    });

    it('debe pasar number sin cambios', () => {
      expect(parseDecimalPrice(4.25)).toBe(4.25);
    });

    it('debe retornar null para valores ausentes', () => {
      expect(parseDecimalPrice(null)).toBeNull();
      expect(parseDecimalPrice(undefined)).toBeNull();
    });
  });

  describe('calculateMovementLineValue', () => {
    it('debe calcular valor referencial de venta (cantidad × precio)', () => {
      expect(calculateMovementLineValue(-3, 2.5)).toBe(7.5);
    });

    it('debe retornar null si no hay unitPrice', () => {
      expect(calculateMovementLineValue(-5, null)).toBeNull();
    });

    it('debe usar valor absoluto de la cantidad', () => {
      expect(calculateMovementLineValue(10, 1.2)).toBe(12);
    });
  });
});
