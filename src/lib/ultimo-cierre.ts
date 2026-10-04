import { isWithinTradingHours, momentoVisible, ultimaRuedaTerminada } from './conventions';
import { RUTA_HISTORICO } from './historico';

/**
 * Respuestas ya calculadas del último cierre, para servir con el mercado
 * cerrado.
 *
 * Fuera de rueda el panel de BYMA viene vacío y cada curva sale de la serie
 * histórica, un pedido por papel: en frío, unos 2,5 s la de tasa fija y 8 s
 * la CER. Pero esos precios ya no cambian hasta la próxima rueda, y el
 * proceso diario los guarda en `public/historico/ultimo/` (ver
 * `scripts/guardar-historico.ts`). Leer ese archivo es un estático.
 *
 * Se usa sólo si es de la última rueda terminada: entre el cierre y el
 * proceso diario todavía está el del día anterior, y ahí se calcula como
 * siempre. Con la rueda abierta, nunca.
 */
export const CARPETA_ULTIMO_CIERRE = 'ultimo';

/** Techo para leer el archivo; si no llega, se calcula. */
const TIMEOUT_MS = 3_000;

export async function leerGuardado<T extends { tradeDate: string }>(
  origen: string,
  ruta: string,
  { tambienEnRueda = false, ahora = new Date() }: { tambienEnRueda?: boolean; ahora?: Date } = {},
): Promise<T | null> {
  if (!tambienEnRueda && isWithinTradingHours(momentoVisible(ahora))) return null;
  const fecha = ultimaRuedaTerminada(ahora);
  try {
    const res = await fetch(`${origen}${RUTA_HISTORICO}/${ruta}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as T;
    return payload.tradeDate === fecha ? payload : null;
  } catch {
    return null;
  }
}
