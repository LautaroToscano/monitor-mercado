import type { Quote } from '../types';

/**
 * API Market Data de BYMA, servicio Delay20: el snapshot del día con 20
 * minutos de demora (docs/BYMA_DELAY20_API.md). Reemplaza a la API pública
 * vieja (open.bymadata.com.ar), que dejó de responder el 13/11/2026.
 *
 * Pide credenciales (OAuth2, client credentials): BYMA_CLIENT_ID,
 * BYMA_CLIENT_SECRET y BYMA_SCOPE en el entorno (.env en local; en Vercel y
 * en GitHub, cargadas por el dueño). Sin ellas, `delay20Configurado()` da
 * falso y nada de esto se usa.
 *
 * Los ceros son "sin dato" (sin operación, sin punta), nunca un precio.
 */

const BASE = 'https://apigw.byma.com.ar';
const USER_AGENT = 'monitor-mercado/1.0 (+https://github.com/LautaroToscano/monitor-mercado)';
const REQUEST_TIMEOUT_MS = 10_000;
/** El token dura 24 horas; se renueva cinco minutos antes. */
const MARGEN_TOKEN_MS = 5 * 60_000;
/** Si BYMA_SCOPE viene vacío. El manual sólo muestra eod.read; a confirmar. */
const SCOPE_POR_DEFECTO = 'delay20.read';

export function delay20Configurado(): boolean {
  return Boolean(process.env.BYMA_CLIENT_ID && process.env.BYMA_CLIENT_SECRET);
}

function tiempo(signal?: AbortSignal) {
  return signal
    ? AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
    : AbortSignal.timeout(REQUEST_TIMEOUT_MS);
}

export type FormaCredenciales = 'basic' | 'body';

interface Token {
  valor: string;
  vence: number;
  scope: string | null;
  forma: FormaCredenciales;
}

let token: Token | null = null;

/**
 * Pide un token. El manual no dice cómo van las credenciales: primero como
 * HTTP Basic y, si eso da 400 o 401, en el cuerpo del pedido.
 */
export async function pedirToken(signal?: AbortSignal): Promise<Token> {
  const id = process.env.BYMA_CLIENT_ID;
  const secreto = process.env.BYMA_CLIENT_SECRET;
  if (!id || !secreto) throw new Error('Faltan BYMA_CLIENT_ID y BYMA_CLIENT_SECRET');
  const scope = process.env.BYMA_SCOPE || SCOPE_POR_DEFECTO;
  const url = `${BASE}/oauth/token/`;
  const cabeceras = { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT };

  let forma: FormaCredenciales = 'basic';
  let res = await fetch(url, {
    method: 'POST',
    headers: { ...cabeceras, Authorization: `Basic ${Buffer.from(`${id}:${secreto}`).toString('base64')}` },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope }),
    signal: tiempo(signal),
    cache: 'no-store',
  });
  if (res.status === 400 || res.status === 401) {
    forma = 'body';
    res = await fetch(url, {
      method: 'POST',
      headers: cabeceras,
      body: new URLSearchParams({ grant_type: 'client_credentials', scope, client_id: id, client_secret: secreto }),
      signal: tiempo(signal),
      cache: 'no-store',
    });
  }
  if (!res.ok) throw new Error(`BYMA no dio el token (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { access_token: string; expires_in?: number; scope?: string };
  token = {
    valor: j.access_token,
    vence: Date.now() + (j.expires_in ?? 86_400) * 1000 - MARGEN_TOKEN_MS,
    scope: j.scope ?? null,
    forma,
  };
  return token;
}

export class ErrorDelay20 extends Error {
  constructor(
    readonly status: number,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

/** GET a un servicio de Delay20. Con un 401 renueva el token y reintenta una vez. */
export async function getDelay20<T = FilaDelay20>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  signal?: AbortSignal,
): Promise<T[]> {
  const query = new URLSearchParams(
    Object.entries(params).filter((e): e is [string, string | number] => e[1] !== undefined && e[1] !== '').map(([k, v]) => [k, String(v)]),
  );
  for (let intento = 0; ; intento += 1) {
    if (!token || Date.now() >= token.vence) await pedirToken(signal);
    const res = await fetch(`${BASE}/delay20/v1/${path}${query.size ? `?${query}` : ''}`, {
      headers: { Authorization: `Bearer ${token!.valor}`, 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: tiempo(signal),
      cache: 'no-store',
    });
    if (res.status === 401 && intento === 0) {
      token = null;
      continue;
    }
    if (!res.ok) throw new ErrorDelay20(res.status, `Delay20 ${path} respondió ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as { result?: T[] } | T[];
    return Array.isArray(j) ? j : (j.result ?? []);
  }
}

/** Una fila del snapshot (renta fija, acciones, futuros...). */
export interface FilaDelay20 {
  security_id: string;
  symbol: string;
  category?: number;
  categoryDesc?: string;
  market?: string;
  operativeForm?: string;
  currency?: string;
  settlPeriod?: string;
  settlDate?: string;
  trades?: number;
  trade_volume?: number;
  trade_amount?: number;
  trading_session_low_price?: number;
  trading_session_high_price?: number;
  trade?: number;
  opening_price?: number;
  vwap_price?: number;
  imbalance?: number;
  previous_close?: number;
  closing_price?: number | null;
  broadcast_time?: number;
  best_purchase_price?: number;
  purchase_amount?: number;
  best_selling_price?: number;
  selling_amount?: number;
  Date?: string;
}

const dato = (v: number | null | undefined) => (v && v > 0 ? v : null);

/** `92507` → '09:25:07'. */
export function horaDeBroadcast(t: number | undefined): string | null {
  if (!t) return null;
  const s = String(t).padStart(6, '0');
  return `${s.slice(0, 2)}:${s.slice(2, 4)}:${s.slice(4, 6)}`;
}

/**
 * Una fila de renta fija como cotización. Sin usar todavía: falta confirmar
 * con la API real la convención de precio y en qué grupo viene cada papel.
 */
export function cotizacionDelay20(f: FilaDelay20): Quote {
  return {
    symbol: f.symbol,
    last: dato(f.trade) ?? dato(f.closing_price),
    previousClose: dato(f.previous_close),
    open: dato(f.opening_price),
    high: dato(f.trading_session_high_price),
    low: dato(f.trading_session_low_price),
    vwap: dato(f.vwap_price),
    bid: dato(f.best_purchase_price),
    ask: dato(f.best_selling_price),
    bidSize: dato(f.purchase_amount),
    askSize: dato(f.selling_amount),
    volumeNominal: f.trade_volume ?? null,
    volumeAmount: f.trade_amount ?? null,
    orderCount: f.trades ?? null,
    lastTradeTime: horaDeBroadcast(f.broadcast_time),
    currency: f.currency ?? 'ARS',
    settlement: f.settlPeriod === '0001' ? 'contado' : 'T+1',
    maturityDate: null,
    source: 'byma',
  };
}
