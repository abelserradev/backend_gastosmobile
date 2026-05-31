import {
  formatYmdInCaracas,
  getBudgetPeriodForCutoffDay,
  isCutoffDay,
  startOfMonthYmdInCaracas,
} from './caracas-date';

describe('caracas-date', () => {
  describe('formatYmdInCaracas', () => {
    it('debe formatear fecha a YYYY-MM-DD', () => {
      // 2026-05-15 12:00:00 UTC
      const d = new Date(Date.UTC(2026, 4, 15, 12, 0, 0));
      expect(formatYmdInCaracas(d)).toBe('2026-05-15');
    });
  });

  describe('startOfMonthYmdInCaracas', () => {
    it('debe retornar primer día del mes', () => {
      // 2026-05-20 → 2026-05-01
      const d = new Date(Date.UTC(2026, 4, 20, 12, 0, 0));
      expect(startOfMonthYmdInCaracas(d)).toBe('2026-05-01');
    });
  });

  describe('getBudgetPeriodForCutoffDay', () => {
    it('con corte 15, hoy 20 de mayo → periodo 16 May - 15 Jun', () => {
      // Hoy: 2026-05-20, corte: 15
      // - Corte de mayo fue el 15 (ya pasó)
      // - Periodo actual: 16 May - 15 Jun
      const result = getBudgetPeriodForCutoffDay('2026-05-20', 15);

      expect(result.periodStart).toBe('2026-05-16');
      expect(result.cutoffDate).toBe('2026-06-15');
      expect(result.isCutoffToday).toBe(false);
      expect(result.label).toContain('16');
      expect(result.label).toContain('15');
    });

    it('con corte 15, hoy 15 de mayo → es día de corte', () => {
      const result = getBudgetPeriodForCutoffDay('2026-05-15', 15);

      expect(result.cutoffDate).toBe('2026-05-15');
      expect(result.isCutoffToday).toBe(true);
    });

    it('con corte 15, hoy 10 de mayo → periodo aún cierra el 15', () => {
      // Hoy: 2026-05-10 (antes del corte)
      // - El corte más cercano es 15 de mayo
      // - Periodo actual: 16 Abr - 15 May
      const result = getBudgetPeriodForCutoffDay('2026-05-10', 15);

      expect(result.periodStart).toBe('2026-04-16');
      expect(result.cutoffDate).toBe('2026-05-15');
      expect(result.isCutoffToday).toBe(false);
    });

    it('con corte 30, maneja meses con 30/31 días', () => {
      // Mayo tiene 31 días, corte 30 funciona
      const mayResult = getBudgetPeriodForCutoffDay('2026-05-20', 30);
      expect(mayResult.cutoffDate).toBe('2026-05-30');

      // Abril tiene 30 días, corte 30 es válido
      const aprResult = getBudgetPeriodForCutoffDay('2026-04-20', 30);
      expect(aprResult.cutoffDate).toBe('2026-04-30');
    });

    it('con corte 1 (default), comportamiento calendario', () => {
      // Hoy 20 de mayo, corte es el 1 → el corte de mayo ya pasó
      // Estamos en el periodo que empezó el 2 de mayo y cierra el 1 de junio
      const result = getBudgetPeriodForCutoffDay('2026-05-20', 1);

      expect(result.periodStart).toBe('2026-05-02');
      expect(result.cutoffDate).toBe('2026-06-01'); // Próximo corte
      expect(result.isCutoffToday).toBe(false);
    });

    it('cálcula correctamente nextPeriodStart', () => {
      const result = getBudgetPeriodForCutoffDay('2026-05-20', 15);

      // El siguiente periodo inicia el 16 de junio (día después del corte)
      expect(result.nextPeriodStart).toBe('2026-06-16');
    });
  });

  describe('isCutoffDay', () => {
    it('detecta día de corte correctamente', () => {
      expect(isCutoffDay('2026-05-15', 15)).toBe(true);
      expect(isCutoffDay('2026-05-16', 15)).toBe(false);
      expect(isCutoffDay('2026-05-14', 15)).toBe(false);
    });

    it('maneja corte día 30 en febrero (28 días)', () => {
      // Febrero 2027 tiene 28 días
      // El corte "efectivo" sería el 28
      expect(isCutoffDay('2027-02-28', 30)).toBe(true);
      expect(isCutoffDay('2027-02-27', 30)).toBe(false);
    });

    it('maneja año bisiesto febrero 2028 (29 días)', () => {
      // Febrero 2028 tiene 29 días (bisiesto)
      expect(isCutoffDay('2028-02-29', 30)).toBe(true);
    });
  });
});
