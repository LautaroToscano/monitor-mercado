import type { BymaFicha } from '../sources/byma';
import type { DolarLinkedReference } from '../types';
import type { ReglasDeDescubrimiento } from './descubrimiento';
import type { Clasificacion } from './tasa-fija-clasificador';
import { CONDICIONES_DOLAR_LINKED } from './dolar-linked-condiciones';

/**
 * Decide si una especie es un título del Tesoro vinculado al dólar.
 *
 * La ficha informa `moneda: "Dólares"` porque el VN está en dólares, igual
 * que en un bono hard dollar; lo que los distingue es la denominación:
 * "VINCULADA AL DÓLAR" o "DÓLAR LINKED".
 */
export function clasificarDolarLinked(ficha: BymaFicha): Clasificacion {
  const nombre = ficha.denominacion.toUpperCase();
  if (!/VINCULAD[AO] AL D[OÓ]LAR|D[OÓ]LAR LINKED/.test(nombre)) {
    return { esMiembro: false, motivo: 'no es dólar linked' };
  }
  if (!/gobierno nacional/i.test(ficha.emisor)) {
    return { esMiembro: false, motivo: `emisor ${ficha.emisor}` };
  }
  return { esMiembro: true, motivo: '' };
}

/**
 * Referencia de un dólar linked. Las fechas salen de la norma si está cargada
 * en `CONDICIONES_DOLAR_LINKED` y si no de la ficha.
 */
export function referenciaDolarLinkedDesdeFicha(ficha: BymaFicha): DolarLinkedReference | null {
  if (!clasificarDolarLinked(ficha).esMiembro) return null;
  const vencimiento = ficha.fechaVencimiento?.slice(0, 10);
  const emision = CONDICIONES_DOLAR_LINKED[ficha.symbol]?.emision ?? ficha.fechaEmision?.slice(0, 10);
  if (!emision || !vencimiento) return null;
  const nombre = ficha.denominacion.toUpperCase();
  return {
    symbol: ficha.symbol,
    name: ficha.denominacion,
    isin: ficha.codigoIsin || null,
    issueDate: emision,
    maturityDate: vencimiento,
    estructura: nombre.includes('DUAL') || nombre.includes('TAMAR') ? 'dual' : 'cero-cupon',
  };
}

export const reglasDolarLinked: ReglasDeDescubrimiento<DolarLinkedReference> = {
  clasificar: clasificarDolarLinked,
  resolver: async (ficha) => referenciaDolarLinkedDesdeFicha(ficha),
  motivoSinResolver: 'la ficha no trae fechas de emisión y vencimiento',
};
