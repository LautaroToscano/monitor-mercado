import type { BymaFicha } from '../sources/byma';
import type { TamarReference } from '../types';
import type { ReglasDeDescubrimiento } from './descubrimiento';
import type { Clasificacion } from './tasa-fija-clasificador';
import { CONDICIONES_TAMAR } from './tamar-condiciones';

/**
 * Decide si una especie es un título del Tesoro que paga TAMAR, pura o como
 * una de las patas de un dual. Se mira todo el texto de la ficha: el dual
 * tasa fija / TAMAR (TTD26) no la nombra en la denominación, sólo en las
 * condiciones.
 */
export function clasificarTamar(ficha: BymaFicha): Clasificacion {
  const texto = `${ficha.denominacion} ${ficha.formaAmortizacion} ${ficha.interes}`.toUpperCase();
  if (!texto.includes('TAMAR')) return { esMiembro: false, motivo: 'no paga TAMAR' };
  if (!/gobierno nacional/i.test(ficha.emisor)) {
    return { esMiembro: false, motivo: `emisor ${ficha.emisor}` };
  }
  return { esMiembro: true, motivo: '' };
}

/**
 * Referencia de un TAMAR. Sin sus condiciones cargadas no se resuelve: el
 * margen no está en la ficha y no se asume. Las fechas salen de la norma.
 */
export function referenciaTamarDesdeFicha(ficha: BymaFicha): TamarReference | null {
  if (!clasificarTamar(ficha).esMiembro) return null;
  const c = CONDICIONES_TAMAR[ficha.symbol];
  if (!c) return null;
  return {
    symbol: ficha.symbol,
    name: ficha.denominacion,
    isin: ficha.codigoIsin || null,
    issueDate: c.emision,
    maturityDate: c.vencimiento,
    estructura: c.tipo === 'tamar' ? 'cero-cupon' : 'dual',
  };
}

export const reglasTamar: ReglasDeDescubrimiento<TamarReference> = {
  clasificar: clasificarTamar,
  resolver: async (ficha) => referenciaTamarDesdeFicha(ficha),
  motivoSinResolver:
    'paga TAMAR pero no tiene sus condiciones (margen, norma) cargadas en CONDICIONES_TAMAR',
};
