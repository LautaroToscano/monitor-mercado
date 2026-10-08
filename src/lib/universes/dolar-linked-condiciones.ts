import type { IsoDate } from '../conventions';

/**
 * Condiciones de emisión de los títulos dólar linked, verificadas en el
 * Boletín Oficial.
 *
 * La ficha de BYMA trae las fechas pero casi nunca la regla del tipo de
 * cambio: de los nueve vigentes al 07/10/2026 sólo la de TZV27 la escribe.
 * La regla decide qué A3500 paga cada título, y no se asume: un dólar linked
 * nuevo que no esté acá entra a la curva (su TIR no depende de la regla) pero
 * sale sin fecha de fijación y con un aviso para cargarla.
 *
 * En los nueve la norma dice lo mismo:
 *  - suscripción: A3500 del día hábil previo a la licitación (T-1);
 *  - pago: A3500 del tercer día hábil previo a la fecha de pago.
 * El dual TMVE8 lo llama "tipo de cambio inicial" y lo usa además para su
 * pata TAMAR.
 *
 * `licitacion` es la de la emisión original. Las reaperturas suscriben con el
 * A3500 previo a su propia licitación, así que el tipo de cambio inicial que
 * se muestra es el de la emisión original, no el de cada tenedor.
 */
export interface CondicionesDolarLinked {
  norma: string;
  /** URL del texto de la norma. */
  fuente: string;
  /** Licitación de la emisión original. */
  licitacion: IsoDate;
  /** Fecha de emisión según la norma. */
  emision: IsoDate;
  /** Hábiles antes del pago que fija el A3500 que se cobra. */
  habilesFijacionPago: number;
  /** Hábiles antes de la licitación que fija el tipo de cambio de suscripción. */
  habilesTcInicial: number;
  /** La regla de pago como la escribe la norma. */
  reglaPago: string;
}

const PAGO = 'A3500 del tercer día hábil previo a la fecha de pago';
const BO = 'https://www.boletinoficial.gob.ar/pdf/aviso/primera';

export const CONDICIONES_DOLAR_LINKED: Readonly<Record<string, CondicionesDolarLinked>> = {
  D30O6: {
    norma: 'Resolución Conjunta 48/2026, art. 1',
    fuente: 'https://www.argentina.gob.ar/normativa/nacional/norma-428864/texto',
    licitacion: '2026-08-12',
    emision: '2026-08-14',
    habilesFijacionPago: 3,
    habilesTcInicial: 1,
    reglaPago: PAGO,
  },
  D30N6: {
    norma: 'Resolución Conjunta 55/2026, art. 1',
    fuente: `${BO}/347461/20260915`,
    licitacion: '2026-09-11',
    emision: '2026-09-15',
    habilesFijacionPago: 3,
    habilesTcInicial: 1,
    reglaPago: PAGO,
  },
  D15E7: {
    norma: 'Resolución Conjunta 46/2026, art. 2',
    fuente: 'https://www.boletinoficial.gob.ar/detalleAviso/primera/345289/20260731',
    licitacion: '2026-07-29',
    emision: '2026-07-31',
    habilesFijacionPago: 3,
    habilesTcInicial: 1,
    reglaPago: PAGO,
  },
  D31M7: {
    norma: 'Resolución Conjunta 28/2026, art. 3',
    fuente: 'https://www.boletinoficial.gob.ar/detalleAviso/primera/342495/20260528',
    licitacion: '2026-05-27',
    emision: '2026-05-29',
    habilesFijacionPago: 3,
    habilesTcInicial: 1,
    reglaPago: PAGO,
  },
  /**
   * La norma dice emisión 17/07/2026 y la ficha de BYMA 16/07/2026. Manda la
   * norma. No cambia la TIR: el pago no depende de la fecha de emisión.
   */
  D10Y7: {
    norma: 'Resolución Conjunta 44/2026, art. 1',
    fuente: 'https://www.argentina.gob.ar/normativa/nacional/norma-427741/texto',
    licitacion: '2026-07-15',
    emision: '2026-07-17',
    habilesFijacionPago: 3,
    habilesTcInicial: 1,
    reglaPago: PAGO,
  },
  TZV27: {
    norma: 'Resolución Conjunta 11/2026, art. 2',
    fuente: `${BO}/338764/20260226`,
    licitacion: '2026-02-25',
    emision: '2026-02-27',
    habilesFijacionPago: 3,
    habilesTcInicial: 1,
    reglaPago: PAGO,
  },
  TZV28: {
    norma: 'Resolución Conjunta 16/2026, art. 4',
    fuente: `${BO}/340193/20260331`,
    licitacion: '2026-03-27',
    emision: '2026-03-31',
    habilesFijacionPago: 3,
    habilesTcInicial: 1,
    reglaPago: PAGO,
  },
  TZVD8: {
    norma: 'Resolución Conjunta 32/2026, art. 2',
    fuente: 'https://www.argentina.gob.ar/normativa/nacional/norma-426589/texto',
    licitacion: '2026-06-10',
    emision: '2026-06-12',
    habilesFijacionPago: 3,
    habilesTcInicial: 1,
    reglaPago: PAGO,
  },
  /**
   * Dual TAMAR / dólar linked. Paga el máximo entre el VN al tipo de cambio
   * aplicable y el VN al tipo de cambio inicial capitalizado a TAMAR TEM. La
   * TIR que se calcula es la de la pata dólar: un piso, porque el precio
   * incluye además la opción de cobrar TAMAR. Vencimiento corrido del
   * 28/01/2028 al 31/01/2028 por comunicado de Finanzas.
   */
  TMVE8: {
    norma: 'Resolución Conjunta 46/2026, art. 3',
    fuente: 'https://www.boletinoficial.gob.ar/detalleAviso/primera/345289/20260731',
    licitacion: '2026-07-29',
    emision: '2026-07-31',
    habilesFijacionPago: 3,
    habilesTcInicial: 1,
    reglaPago: 'máximo entre VN × A3500 del tercer día hábil previo al pago y VN × tipo de cambio inicial capitalizado a TAMAR TEM',
  },
};
