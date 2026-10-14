import type { InstrumentReference } from '../types';
import data from '../reference/vencidos.json' with { type: 'json' };

/**
 * Papeles ya vencidos, para rehacer las curvas de días pasados.
 *
 * BYMA borra la ficha técnica de un papel cuando vence, así que sus
 * condiciones no salen del script que regenera la referencia: viven acá,
 * armadas a mano con su fuente (`origen`). La fecha de emisión sale de la
 * norma del Boletín Oficial; la TEM de las LECAP, de la ficha de emisión de
 * A3. Cada una se controló con los precios del propio papel: al acercarse el
 * vencimiento tiene que converger al pago final. Detalle en docs/datos.md.
 *
 * En vivo no cambian nada: un papel vencido nunca está vigente.
 */
type Slug = 'tasa-fija' | 'tasa-cer' | 'dolar-linked' | 'tamar';

export function vencidosDe<R extends InstrumentReference>(slug: Slug): R[] {
  return (data[slug] as unknown as (R & { origen?: unknown })[]).map(({ origen: _origen, ...ref }) => ref as R);
}

/** Lo que dice la norma de cada dólar linked vencido sobre el tipo de cambio. */
export const ORIGEN_DOLAR_LINKED = new Map(
  data['dolar-linked'].map((r) => [r.symbol, { ...r.origen, emision: r.issueDate }]),
);
