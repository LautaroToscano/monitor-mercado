import type { BymaPanel } from '../sources/byma';

/**
 * Especificación del universo dólar linked, compartida entre el runtime y el
 * script que regenera la referencia.
 */

/**
 * Las letras (D*) están en `lebacs` y los bonos (TZV*, TMV*) en
 * `public-bonds`: los mismos dos paneles que tasa fija y CER, y la misma
 * fuente de precios.
 */
export const DOLAR_LINKED_PANELS: readonly BymaPanel[] = ['lebacs', 'public-bonds'];

/**
 * Tickers base de los títulos dólar linked.
 *
 *   D + día + mes + año     letras cero cupón          D30O6, D15E7
 *   TZV + año / mes + año   bonos cero cupón           TZV27, TZVD8
 *   TMV + mes + año         duales TAMAR / dólar       TMVE8
 *
 * Las variantes en otra moneda o plazo (TZV7D, TZV8X, TZV7Z) no son
 * candidatas: son la misma especie. Decide la ficha, en
 * `dolar-linked-clasificador.ts`.
 */
export const CANDIDATE_SYMBOL = /^(D[0-9]{2}[A-Z][0-9]|TZV[A-Z]?[0-9]{1,2}|TMV[A-Z][0-9])$/;
