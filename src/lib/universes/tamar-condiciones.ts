import type { IsoDate } from '../conventions';
import type { TamarDetalle } from '../types';

/**
 * Condiciones de emisión de los títulos a tasa TAMAR, verificadas en el
 * Boletín Oficial y, el margen, en el resultado de la licitación de la
 * Secretaría de Finanzas.
 *
 * Todas las normas dicen lo mismo de la tasa:
 *  - TAMAR: promedio aritmético simple de la TAMAR de bancos privados (TNA,
 *    BCRA variable 136) publicada desde diez hábiles antes de la emisión
 *    hasta diez hábiles antes del vencimiento;
 *  - TAMAR TEM = ((1 + (TAMAR + margen) × 32/365)^(365/32))^(1/12) − 1;
 *  - pago al vencimiento = VNO × (1 + TAMAR TEM)^(días30/360 / 30), íntegro.
 *
 * Lo que cambia entre papeles es el margen y, en los duales, la otra pata.
 * La ficha de BYMA casi nunca trae el margen, y dos fechas suyas están mal
 * (TMF28 dice vencimiento 15/02/2028; TMG27, emisión 31/03/2026): mandan la
 * norma y el resultado de la licitación. Un TAMAR nuevo que no esté acá no
 * se incorpora: queda en los avisos para cargarlo.
 */
export interface CondicionesTamar {
  tipo: TamarDetalle['tipo'];
  norma: string;
  /** URL del texto de la norma. */
  fuente: string;
  emision: IsoDate;
  vencimiento: IsoDate;
  /** Margen sobre la TAMAR, en TNA (0,065 = 6,50%). */
  margen: number;
  /** De dónde sale el margen: el resultado de la licitación o la norma. */
  fuenteMargen: string;
  /** Dual con tasa fija: la TEM de la pata fija. */
  tasaFijaTem?: number;
  /**
   * Dual con dólar linked: la licitación de la emisión original. El tipo de
   * cambio inicial es el A3500 del hábil anterior.
   */
  licitacion?: IsoDate;
}

const BO = 'https://www.boletinoficial.gob.ar/pdf/aviso/primera';
const NORMATIVA = 'https://www.argentina.gob.ar/normativa/nacional';
const FINANZAS = 'https://www.argentina.gob.ar/noticias';

/** Los cuatro duales tasa fija / TAMAR del canje de enero de 2025. */
const CANJE_2025 = {
  tipo: 'dual-tasa-fija',
  norma: 'Resolución Conjunta 4/2025, art. 1',
  fuente: `${BO}/320147/20250127`,
  emision: '2025-01-29',
  margen: 0,
  fuenteMargen: 'norma: la pata variable es la TAMAR TEM sin margen',
} as const;

const DUAL_CER = { tipo: 'dual-cer', margen: 0.03, fuenteMargen: 'norma: TAMAR TEM más 3%' } as const;

export const CONDICIONES_TAMAR: Readonly<Record<string, CondicionesTamar>> = {
  // ── vencidos: entran sólo a la historia ──────────────────────────────
  M31L5: {
    tipo: 'tamar',
    norma: 'Resolución Conjunta 16/2025, art. 1',
    fuente: `${BO}/324046/20250415`,
    emision: '2025-04-16',
    vencimiento: '2025-07-31',
    margen: 0.05,
    fuenteMargen: `licitación del 14/04/2025 (${FINANZAS}/resultado-de-la-licitacion-de-lecap-boncer-letra-tamar-bono-tamar-bono-dolar-linked-y)`,
  },
  M10N5: {
    tipo: 'tamar',
    norma: 'Resolución Conjunta 38/2025, art. 1',
    fuente: `${NORMATIVA}/norma-416407/texto`,
    emision: '2025-08-18',
    vencimiento: '2025-11-10',
    margen: 0.06,
    fuenteMargen: `licitación del 13/08/2025 (${FINANZAS}/resultado-de-la-licitacion-de-lecap-boncap-boncer-y-dolar-linked)`,
  },
  M16E6: {
    tipo: 'tamar',
    norma: 'Resolución Conjunta 38/2025, art. 3',
    fuente: `${NORMATIVA}/norma-416407/texto`,
    emision: '2025-08-18',
    vencimiento: '2026-01-16',
    margen: 0.075,
    fuenteMargen: `licitación del 13/08/2025 (${FINANZAS}/resultado-de-la-licitacion-de-lecap-boncap-boncer-y-dolar-linked)`,
  },
  /**
   * No entra a la historia: la serie de BYMA no tiene ningún precio (operó
   * sólo en A3, del 05/09 al 24/09/2025) y no se mezclan fuentes.
   */
  M28N5: {
    tipo: 'tamar',
    norma: 'Resolución Conjunta 39/2025, art. 1',
    fuente: `${NORMATIVA}/norma-416590/texto`,
    emision: '2025-08-19',
    vencimiento: '2025-11-28',
    margen: 0.01,
    fuenteMargen: `licitación del 18/08/2025 (${FINANZAS}/resultado-de-la-licitacion-de-nueva-letra-tamar)`,
  },
  M27F6: {
    tipo: 'tamar',
    norma: 'Resolución Conjunta 41/2025, art. 2',
    fuente: `${BO}/330476/20250828`,
    emision: '2025-08-29',
    vencimiento: '2026-02-27',
    margen: 0.015,
    fuenteMargen: `licitación del 27/08/2025 (${FINANZAS}/resultado-de-la-licitacion-de-lecap-lelink-y-letra-tamar)`,
  },
  /**
   * La imagen de la fórmula en el texto publicado es ilegible en el
   * exponente; el resto del artículo es idéntico al de las otras letras.
   */
  M15D5: {
    tipo: 'tamar',
    norma: 'Resolución Conjunta 44/2025, art. 1',
    fuente: `${NORMATIVA}/norma-417398/texto`,
    emision: '2025-09-12',
    vencimiento: '2025-12-15',
    margen: 0.02,
    fuenteMargen: `licitación del 10/09/2025 (${FINANZAS}/resultado-de-la-licitacion-de-lecap-letra-tamar-boncer-lelink-y-bono-dolar-linked)`,
  },
  M31G6: {
    tipo: 'tamar',
    norma: 'Resolución Conjunta 58/2025, art. 2',
    fuente: `${BO}/334181/20251107`,
    emision: '2025-11-10',
    vencimiento: '2026-08-31',
    margen: 0.05,
    fuenteMargen: `licitación del 05/11/2025 (${FINANZAS}/resultado-de-licitacion-de-lecap-boncap-boncer-letamar-bono-tamar-y-lelink)`,
  },
  /** La de mayo de 2025 quedó desierta; ésta es la emisión de noviembre. */
  M30A6: {
    tipo: 'tamar',
    norma: 'Resolución Conjunta 60/2025, art. 4',
    fuente: `${BO}/335067/20251127`,
    emision: '2025-11-28',
    vencimiento: '2026-04-30',
    margen: 0.04,
    fuenteMargen: `licitación del 26/11/2025 (${FINANZAS}/resultado-de-licitacion-de-instrumentos-del-tesoro-nacional-denominados-en-pesos-y-dolares)`,
  },
  TTM26: { ...CANJE_2025, vencimiento: '2026-03-16', tasaFijaTem: 0.0225 },
  TTJ26: { ...CANJE_2025, vencimiento: '2026-06-30', tasaFijaTem: 0.0219 },
  TTS26: { ...CANJE_2025, vencimiento: '2026-09-15', tasaFijaTem: 0.0217 },

  // ── vigentes ─────────────────────────────────────────────────────────
  TTD26: { ...CANJE_2025, vencimiento: '2026-12-15', tasaFijaTem: 0.0214 },
  TMF27: {
    tipo: 'tamar',
    norma: 'Resolución Conjunta 9/2026, art. 1',
    fuente: `${BO}/338415/20260212`,
    emision: '2026-02-13',
    vencimiento: '2027-02-26',
    margen: 0.065,
    fuenteMargen: `licitación del 11/02/2026 (${FINANZAS}/resultado-de-la-licitacion-de-instrumentos-del-tesoro-nacional-denominados-en-pesos-y-1)`,
  },
  TML27: {
    tipo: 'tamar',
    norma: 'Resolución Conjunta 36/2026, art. 4',
    fuente: `${BO}/343851/20260701`,
    emision: '2026-06-30',
    vencimiento: '2027-07-30',
    margen: 0.054,
    fuenteMargen: `licitación del 26/06/2026 (${FINANZAS}/resultado-de-la-licitacion-por-efectivo-de-instrumentos-del-tesoro-nacional-denominados-5)`,
  },
  /** La ficha de BYMA dice emisión 31/03/2026; la norma, 01/04/2026. */
  TMG27: {
    tipo: 'tamar',
    norma: 'Resolución Conjunta 16/2026, art. 6',
    fuente: `${BO}/340193/20260331`,
    emision: '2026-04-01',
    vencimiento: '2027-08-31',
    margen: 0.06,
    fuenteMargen: `licitación del 27/03/2026 (${FINANZAS}/resultado-de-la-licitacion-por-efectivo-de-instrumentos-del-tesoro-nacional-denominados-en)`,
  },
  /** La ficha de BYMA dice vencimiento 15/02/2028; la norma, 25/02/2028. */
  TMF28: {
    tipo: 'tamar',
    norma: 'Resolución Conjunta 21/2026, art. 10',
    fuente: `${BO}/340830/20260416`,
    emision: '2026-04-20',
    vencimiento: '2028-02-25',
    margen: 0.065,
    fuenteMargen: `conversión del 15/04/2026 (${FINANZAS}/resultado-de-la-licitacion-por-efectivo-de-instrumentos-del-tesoro-nacional-denominados-0)`,
  },
  TMG28: {
    tipo: 'tamar',
    norma: 'Resolución Conjunta 23/2026, art. 2',
    fuente: `${BO}/341303/20260429`,
    emision: '2026-04-30',
    vencimiento: '2028-08-31',
    margen: 0.069,
    fuenteMargen: `licitación del 28/04/2026 (${FINANZAS}/resultado-de-la-licitacion-por-efectivo-de-instrumentos-del-tesoro-nacional-denominados-1)`,
  },
  TXMJ8: {
    ...DUAL_CER,
    norma: 'Resolución Conjunta 25/2026, art. 1',
    fuente: `${NORMATIVA}/norma-425834/texto`,
    emision: '2026-05-15',
    vencimiento: '2028-06-30',
  },
  TXMD8: {
    ...DUAL_CER,
    norma: 'Resolución Conjunta 32/2026, art. 3',
    fuente: `${BO}/343013/20260611`,
    emision: '2026-06-12',
    vencimiento: '2028-12-15',
  },
  TXMJ9: {
    ...DUAL_CER,
    norma: 'Resolución Conjunta 23/2026, art. 3',
    fuente: `${BO}/341303/20260429`,
    emision: '2026-04-30',
    vencimiento: '2029-06-29',
  },
  TXMD9: {
    ...DUAL_CER,
    norma: 'Resolución Conjunta 32/2026, art. 4',
    fuente: `${BO}/343013/20260611`,
    emision: '2026-06-12',
    vencimiento: '2029-12-14',
  },
  TXMJ0: {
    ...DUAL_CER,
    norma: 'Resolución Conjunta 32/2026, art. 5',
    fuente: `${BO}/343013/20260611`,
    emision: '2026-06-12',
    vencimiento: '2030-06-28',
  },
  /**
   * Paga el máximo entre VN USD 100 al A3500 del tercer hábil previo al pago
   * y VN USD 100 al tipo de cambio inicial capitalizado a TAMAR TEM, sin
   * margen. Acá se valúa la pata TAMAR, con base en pesos.
   */
  TMVE8: {
    tipo: 'dual-dolar-linked',
    norma: 'Resolución Conjunta 46/2026, art. 3',
    fuente: 'https://www.boletinoficial.gob.ar/detalleAviso/primera/345289/20260731',
    emision: '2026-07-31',
    vencimiento: '2028-01-31',
    margen: 0,
    fuenteMargen: 'norma: la pata TAMAR no lleva margen',
    licitacion: '2026-07-29',
  },
};
