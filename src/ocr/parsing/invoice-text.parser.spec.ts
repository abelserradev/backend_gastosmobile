import {
  buildTesseractRawText,
  extractAmountFromText,
  extractMerchantFromText,
  extractProductItemsFromText,
  parseInvoiceTextBlob,
} from './invoice-text.parser';
import { parseLocalizedMoneyToken, parseMoneyFragment } from './invoice-money.util';

describe('invoice-text.parser', () => {
  it('extrae total en formato venezolano Bs 60.552,00', () => {
    const blob = `FARMATODO C.A.
Fecha: 14/05/2026
TOTAL: Bs 60.552,00`;
    const pf = parseInvoiceTextBlob(blob);
    expect(pf.amount).toBeCloseTo(60552, 0);
    expect(pf.merchant).toMatch(/Farmatodo/i);
    expect(pf.date).toBe('2026-05-14');
  });

  it('formatea rawText con cabecera Tesseract', () => {
    expect(buildTesseractRawText('hola')).toBe('# Tesseract (OCR)\nhola');
  });

  it('detecta monto USD con símbolo $', () => {
    const { amount, currency } = extractAmountFromText('Total $ 25.50');
    expect(amount).toBeCloseTo(25.5, 2);
    expect(currency).toBe('USD');
  });

  describe('merchant: nombre del local, no la dirección', () => {
    // Simula lo que Tesseract daría para el ticket de Electrónica El Ávila
    const ticketElectronicaOcr = `'Electrónica El Ávila, C.A.'
RIF: J-40123456-7
Dirección: Av. Francisco de Miranda, Edif. Centro Seguros, Piso 3,
Chacao, Caracas. Tlf: 0212-987-6543
FACTURA COMERCIAL    Nº 0001987
Control Número: 00-0004321    Fecha: 20/05/2026
CLIENTE
Nombre/Razón Social: Servicios Tech Abel, F.P.    RIF: V-19876543-2
Dirección: Final Av. Baralt, Edif. San Juan, PB, Caracas
CANT. DESCRIPCIÓN    P. UNITARIO (Bs.)    TOTAL (Bs.)
1    Lavadora Samsung WA17T62    14.500,00    14.500,00
1    Nevera Whirlpool 18p3    19.200,00    19.200,00
2    Microondas Oster 1.1 p3    3.800,00    7.600,00
1    Televisor LG 55" UHD ThinQ    10.900,00    10.900,00
SUB-TOTAL:    52.200,00
I.V.A. (16%):    8.352,00
TOTAL GENERAL:    Bs. 60.552,00`;

    // Simula OCR del ticket de restaurante
    const ticketRestauranteOcr = `CORPORACIÓN BAGUA, C.A.
CTRA RECTA LAS MINAS CC CEPAN NIVEL PB
LOCAL PB-AURB LAS MINAS
SAN ANTONIO DE LOS ALTOS EDO. MIRANDA
CAJA 3
Mesa 149
VENTA DE CONTADO
FACTURA
FACTURA:    00111806
FECHA: 15-05-2026    HORA: 20:42
CACHITO DE JAMON Y QUESO (G)    Bs 1.065,89
5x Bs 3.552,97
HAMBURGUESA ESPECIAL DE POLLO + REFRESCO (G)    Bs 17.764,85
|MESA13|
NESCAFE (G)    Bs 1.110,30
NESCAFE (G)    Bs 1.110,30
SUBTTL    Bs 21.051,34
BI G16,00%    Bs 21.051,34  IVA G16,00%    Bs 3.368,21
Bancos    Bs 24.419,55
TOTAL    Bs 24.419,55
Tot.. en USD $ 47,40  x T. Cambio BCV 51`;

    it('toma el nombre de la empresa (con C.A.) y no la dirección - electrónica', () => {
      const merchant = extractMerchantFromText(ticketElectronicaOcr);
      expect(merchant).toMatch(/Electrónica El Ávila/i);
      expect(merchant).not.toMatch(/Francisco de Miranda/i);
      expect(merchant).not.toMatch(/Chacao|Caracas/i);
    });

    it('toma el nombre del restaurante (con C.A.) y no la dirección', () => {
      const merchant = extractMerchantFromText(ticketRestauranteOcr);
      expect(merchant).toMatch(/Corporación Bagua/i);
      expect(merchant).not.toMatch(/Las Minas|Miranda|Altos/i);
    });

    it('la descripción contiene los ítems del ticket de electrónica', () => {
      const items = extractProductItemsFromText(ticketElectronicaOcr);
      expect(items).toBeTruthy();
      expect(items).toMatch(/lavadora/i);
      expect(items).toMatch(/nevera|whirlpool/i);
      // No debe incluir la dirección
      expect(items).not.toMatch(/francisco de miranda|caracas/i);
    });

    it('la descripción del restaurante tiene comida, no la dirección', () => {
      const items = extractProductItemsFromText(ticketRestauranteOcr);
      expect(items).toBeTruthy();
      expect(items).toMatch(/cachito|hamburguesa|nescafe/i);
      expect(items).not.toMatch(/las minas|miranda/i);
    });

    it('parseInvoiceTextBlob del ticket electrónica extrae merchant y description correctos', () => {
      const pf = parseInvoiceTextBlob(ticketElectronicaOcr);
      expect(pf.merchant).toMatch(/Electrónica El Ávila/i);
      expect(pf.description).toMatch(/lavadora/i);
      expect(pf.amount).toBeCloseTo(60552, 0);
    });

    // Caso: Tesseract separa nombre del producto y precio en líneas distintas
    // (ocurre frecuentemente con tablas formales en PSM 6)
    const ticketElectronicaTesseractSplit = `'Electrónica El Ávila, C.A.'
RIF: J-40123456-7
Dirección: Av. Francisco de Miranda, Edif. Centro Seguros, Piso 3,
Chacao, Caracas. Tlf: 0212-987-6543
FACTURA COMERCIAL    Nº 0001987
Control Número: 00-0004321    Fecha: 20/05/2026
CLIENTE
Nombre/Razón Social: Servicios Tech Abel, F.P.    RIF: V-19876543-2
Dirección: Final Av. Baralt, Edif. San Juan, PB, Caracas
CANT. DESCRIPCIÓN    P. UNITARIO (Bs.)    TOTAL (Bs.)
Lavadora Samsung WA17T62
14.500,00
14.500,00
Nevera Whirlpool 18p3
19.200,00
19.200,00
Microondas Oster 1.1 p3
3.800,00
7.600,00
Televisor LG 55" UHD ThinQ
10.900,00
10.900,00
SUB-TOTAL:    52.200,00
I.V.A. (16%):    8.352,00
TOTAL GENERAL:    Bs. 60.552,00`;

    it('factura con tabla: detecta productos aunque el precio esté en línea separada', () => {
      const items = extractProductItemsFromText(ticketElectronicaTesseractSplit);
      expect(items).toBeTruthy();
      expect(items).toMatch(/lavadora/i);
      expect(items).toMatch(/nevera|whirlpool/i);
      expect(items).toMatch(/televisor|lg/i);
      expect(items).not.toMatch(/francisco de miranda|caracas/i);
    });

    it('parseInvoiceTextBlob versión split extrae merchant y products', () => {
      const pf = parseInvoiceTextBlob(ticketElectronicaTesseractSplit);
      expect(pf.merchant).toMatch(/Electrónica El Ávila/i);
      expect(pf.description).toMatch(/lavadora/i);
      expect(pf.amount).toBeCloseTo(60552, 0);
    });

    // Caso real de los logs: Tesseract lee la decoración/logo como ruido OCR alrededor del nombre.
    // También el encabezado "TOTAL (Bs.)" de la columna NO debe cerrar la sección de productos.
    const ticketConRuidoOcr = `ge "Electrónica El Avila, C.A. >
RIF: J-40123456-7
Dirección: Av. Francisco de Miranda, Edif. Centro Seguros, Piso 3,
Chacao, Caracas. Tlf: 0212-987-6543
FACTURA COMERCIAL    Nº 0001987
Control Número: 00-0004321    Fecha: 20/05/2026
CANT. DESCRIPCIÓN    P. UNITARIO (Bs.)    TOTAL (Bs.)
1    Lavadora Samsung WA17T62    14.500,00    14.500,00
1    Nevera Whirlpool 18p3    19.200,00    19.200,00
2    Microondas Oster 1.1 p3    3.800,00    7.600,00
1    Televisor LG 55" UHD ThinQ    10.900,00    10.900,00
SUB-TOTAL:    52.200,00
I.V.A. (16%):    8.352,00
TOTAL GENERAL:    Bs. 60.552,00`;

    it('merchant con ruido OCR: extrae el nombre limpio sin artefactos', () => {
      const merchant = extractMerchantFromText(ticketConRuidoOcr);
      expect(merchant).toMatch(/Electrónica El Avila, C\.A\./i);
      // No debe quedar el ruido anterior ni posterior
      expect(merchant).not.toMatch(/^ge\b/i);
      expect(merchant).not.toMatch(/[><=]/);
    });

    it('TOTAL (Bs.) en cabecera de tabla NO cierra la sección: items detectados', () => {
      const items = extractProductItemsFromText(ticketConRuidoOcr);
      expect(items).toBeTruthy();
      expect(items).toMatch(/lavadora/i);
      expect(items).toMatch(/nevera|whirlpool/i);
    });

    it('parseInvoiceTextBlob con ruido OCR extrae todo correctamente', () => {
      const pf = parseInvoiceTextBlob(ticketConRuidoOcr);
      expect(pf.merchant).toMatch(/Electrónica El Avila/i);
      expect(pf.merchant).not.toMatch(/^ge\b/i);
      expect(pf.description).toMatch(/lavadora/i);
      expect(pf.amount).toBeCloseTo(60552, 0);
    });

    // Ticket Farmatodo: SENIAT aparece primero, luego el nombre con C.A., luego dirección,
    // y más abajo datos internos del POS como "Tienda: 2119" que NO deben ser merchant.
    const ticketFarmatodoOcr = `SENIAT
RIF J-000202001
FARMATODO, C.A.
Av Los Guayabitos, CC Expreso Baruta
Nivel 5 Of Unica, Urb La Trinidad
(Sector Piedra Azul), Caracas.
FARMACIA MELANIE, TLF:0800-FARMATODO
CCS:Palos Grandes, 2da. Av/2da. Trsvrl
CAJA 06
RIF/C.I.: V26745518
RAZON SOCIAL: ABEL JOSE SERRA
Tienda: 2119
Ticket: 503419
ID de orden: 155043992
Le Atendió: CHECKOUT, SELF
FACTURA
FACTURA:    00060997
FECHA: 15-05-2026    HORA: 12:56
111016945 CHO ST.MORITZ FLAQUI 2x (G)    Bs 1.239,95
BI G16,00%    Bs 1.239,95  IVA G16,00%    Bs 198,39
Tarj. Debito    Bs 1.438,34
TOTAL    Bs 1.438,34
# ITEMS: 1
**Plazo para devoluciones: 30 dias**`;

    it('ticket Farmatodo: merchant es "FARMATODO, C.A." y no "Tienda: 2119" ni SENIAT', () => {
      const merchant = extractMerchantFromText(ticketFarmatodoOcr);
      expect(merchant).toMatch(/farmatodo/i);
      expect(merchant).not.toMatch(/tienda|2119|seniat/i);
      expect(merchant).not.toMatch(/guayabitos|caracas/i);
    });

    it('ticket Farmatodo: description contiene el producto, no la dirección', () => {
      const items = extractProductItemsFromText(ticketFarmatodoOcr);
      expect(items).toMatch(/st\.moritz|flaqui/i);
      expect(items).not.toMatch(/guayabitos|caracas|tienda/i);
    });

    it('parseInvoiceTextBlob Farmatodo extrae total correcto', () => {
      const pf = parseInvoiceTextBlob(ticketFarmatodoOcr);
      expect(pf.merchant).toMatch(/farmatodo/i);
      expect(pf.amount).toBeCloseTo(1438.34, 1);
    });
  });

  describe('montos venezolanos (punto=miles, coma=decimal)', () => {
    it('parsea 24.792 como veinticuatro mil (miles)', () => {
      expect(parseLocalizedMoneyToken('24.792')).toBe(24792);
    });

    it('parsea 60.552,00 como 60552.00 (como decimal)', () => {
      expect(parseLocalizedMoneyToken('60.552,00')).toBeCloseTo(60552.0, 2);
    });

    it('parsea 1.234.567 como un millón+ (miles)', () => {
      expect(parseLocalizedMoneyToken('1.234.567')).toBe(1234567);
    });

    it('parseMoneyFragment detecta Bs 24.792 como 24792', () => {
      const { amount, currency } = parseMoneyFragment('Bs 24.792');
      expect(amount).toBe(24792);
      expect(currency).toBe('BS');
    });

    it('parseMoneyFragment detecta 24,79 como decimal', () => {
      const { amount, currency } = parseMoneyFragment('24,79');
      expect(amount).toBeCloseTo(24.79, 2);
    });
  });
});
