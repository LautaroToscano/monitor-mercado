import type { Quote } from '../types';
import { memo } from '../cache';

/**
 * data912: precios del mercado argentino en vivo, sin key. Es la fuente de
 * reserva para cuando BYMA no responde (ver `fetchQuotes` en `build.ts`).
 *
 * El 13/11/2026 a la noche la API pública de BYMA dejó de aceptar
 * conexiones desde todos lados, sin aviso, y el sitio quedó una semana con el
 * cierre de ese día. data912 tiene los mismos papeles de las cuatro curvas,
 * en las mismas unidades y con las operaciones del día; comparado contra el
 * último cierre de BYMA, cada papel se había movido lo esperable para una
 * semana. Decisión del usuario (20/11/2026): si BYMA no anda, la rueda
 * entera sale de acá, nunca mezclada con BYMA en una misma curva.
 *
 * Sólo trae el último precio. Con la rueda abierta es el de hoy; fuera de
 * horario, el cierre de la última rueda. No tiene el cierre de ayer con la
 * rueda abierta, ni historia de las LECAP.
 */

const BASE = 'https://data912.com/live';
const USER_AGENT = 'monitor-mercado/1.0 (+https://github.com/LautaroToscano/monitor-mercado)';
const REQUEST_TIMEOUT_MS = 7_000;
/** Refresca cada 20 segundos en origen. */
const TTL_MS = 20_000;

interface Item {
  symbol: string;
  c: number | null;
  px_bid: number | null;
  px_ask: number | null;
  q_bid: number | null;
  q_ask: number | null;
  /** Nominales operados en el día. */
  v: number | null;
  /** Operaciones del día. */
  q_op: number | null;
  /** Variación contra el cierre anterior, en %. */
  pct_change: number | null;
}

async function panel(nombre: string, signal?: AbortSignal): Promise<Item[]> {
  const res = await fetch(`${BASE}/${nombre}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
      : AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`data912 respondió ${res.status} en ${nombre}`);
  const datos = (await res.json()) as unknown;
  if (!Array.isArray(datos)) throw new Error(`data912 ${nombre}: respuesta inesperada`);
  return datos as Item[];
}

const positivo = (v: number | null | undefined) => (v && v > 0 ? v : null);

/**
 * Cotizaciones de letras y bonos del Tesoro en pesos, por ticker, con la
 * fecha de su precio: `priceDate` null si es la rueda en curso, o la rueda a
 * la que corresponde el cierre.
 */
export function fetchQuotesData912(
  priceDate: string | null,
  signal?: AbortSignal,
): Promise<Map<string, Quote>> {
  return memo(`data912:${priceDate ?? 'vivo'}`, TTL_MS, async () => {
    const listas = await Promise.all(['arg_notes', 'arg_bonds'].map((p) => panel(p, signal)));
    const quotes = new Map<string, Quote>();
    for (const item of listas.flat()) {
      const last = positivo(item.c);
      if (!item.symbol || last === null) continue;
      const anterior = item.pct_change !== null ? last / (1 + item.pct_change / 100) : null;
      quotes.set(item.symbol, {
        symbol: item.symbol,
        last,
        previousClose: anterior,
        open: null,
        high: null,
        low: null,
        vwap: null,
        bid: positivo(item.px_bid),
        ask: positivo(item.px_ask),
        bidSize: positivo(item.q_bid),
        askSize: positivo(item.q_ask),
        volumeNominal: item.v ?? null,
        volumeAmount: null,
        orderCount: item.q_op ?? null,
        lastTradeTime: null,
        currency: 'ARS',
        settlement: 'T+1',
        maturityDate: null,
        priceDate,
        source: 'data912',
      });
    }
    return quotes;
  });
}
