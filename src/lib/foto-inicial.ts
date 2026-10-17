import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseIsoDate, restarDiasHabiles, toIsoDate, ultimaRuedaTerminada } from './conventions';
import type { BreakevenResponse } from './breakeven';
import type { UniverseResponse } from './types';

/**
 * Lo que cada pestaña muestra apenas abre, antes de su primer pedido: el
 * último cierre guardado por el proceso diario (`public/historico/ultimo/`)
 * y, en la CER, el último breakeven guardado. Así la página llega con la
 * curva, la tabla y el breakeven ya dibujados —para quien abre el link y para
 * los buscadores y las vistas previas—, y después el tablero pide los datos
 * de siempre y reemplaza si hay una rueda más nueva.
 *
 * Ningún cálculo: son las respuestas del mismo backend, ya guardadas.
 *
 * Una foto de hace días no se muestra nunca. Sólo vale si es de la última
 * rueda terminada o de la anterior —entre el cierre y el proceso de la noche
 * todavía está la de ayer—. Si es más vieja (el proceso diario falló) o falta
 * el archivo, la pestaña arranca como antes, con el cartel de carga. La
 * página se regenera cada hora, así que el control se reevalúa aunque no
 * haya deploy.
 *
 * Sólo en el servidor: lee archivos del proyecto (incluidos en la función con
 * `outputFileTracingIncludes`, en next.config.mjs).
 */

const HISTORICO = join(process.cwd(), 'public', 'historico');

function leer<T>(...ruta: string[]): T | null {
  try {
    return JSON.parse(readFileSync(join(HISTORICO, ...ruta), 'utf8')) as T;
  } catch {
    return null;
  }
}

/** Si una rueda es lo bastante reciente para mostrarse al abrir. */
export function esReciente(rueda: string, ahora: Date = new Date()): boolean {
  const ultima = ultimaRuedaTerminada(ahora);
  return rueda >= toIsoDate(restarDiasHabiles(parseIsoDate(ultima), 1));
}

/** El último cierre guardado de una curva, si es reciente. */
export function cierreInicial(slug: string, ahora: Date = new Date()): UniverseResponse | null {
  const foto = leer<UniverseResponse>('ultimo', `${slug}.json`);
  return foto && foto.universe === slug && esReciente(foto.tradeDate, ahora) ? foto : null;
}

/** El último breakeven guardado, si es reciente. */
export function breakevenInicial(ahora: Date = new Date()): BreakevenResponse | null {
  const fecha = leer<{ breakeven?: string[] }>('indice.json')?.breakeven?.at(-1);
  if (!fecha) return null;
  const be = leer<BreakevenResponse>('breakeven', `${fecha}.json`);
  return be && esReciente(be.tradeDate, ahora) ? be : null;
}
