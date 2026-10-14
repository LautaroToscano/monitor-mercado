import type { BymaPanel } from '../sources/byma';

/**
 * Especificación del universo TAMAR, compartida entre el runtime y el script
 * que regenera la referencia.
 */

/** Las letras (M*) están en `lebacs` y los bonos en `public-bonds`: los mismos dos paneles que las otras curvas. */
export const TAMAR_PANELS: readonly BymaPanel[] = ['lebacs', 'public-bonds'];

/**
 * Tickers base de los títulos que pagan TAMAR.
 *
 *   TM + mes + año          bonos TAMAR                TMF27, TMG28
 *   M + día + mes + año     letras TAMAR               M31G6, M30A6
 *   TT + mes + año          duales tasa fija / TAMAR   TTD26
 *   TXM + mes + año         duales CER / TAMAR         TXMJ8, TXMD9
 *   TMV + mes + año         dual TAMAR / dólar linked  TMVE8
 *
 * Las variantes en otra moneda o plazo (TMF7X, TXD8X) no son candidatas: son
 * la misma especie. Decide la ficha, en `tamar-clasificador.ts`.
 */
export const CANDIDATE_SYMBOL =
  /^(TM[A-Z][0-9]{2}|TMV[A-Z][0-9]|M[0-9]{2}[A-Z][0-9]|TT[A-Z][0-9]{2}|TXM[A-Z][0-9])$/;
