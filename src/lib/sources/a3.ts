import { memo } from '../cache';
import type { IsoDate } from '../conventions';

/**
 * A3 Mercados: el mercado que nació de juntar MAE y Matba Rofex. De acá salen
 * los dos datos de dólar que usa la curva dólar linked, cada uno por la API
 * pública que heredó de su mercado de origen:
 *
 *  - el **mayorista de cierre**: el último precio del dólar transferencia
 *    (UST$T) en el segmento mayorista, contado (plazo 000), en el mercado de
 *    cambios que antes era del MAE;
 *  - los **futuros de dólar** (DLR): el precio de ajuste de cada rueda, en el
 *    sistema de cierres que antes era de Matba Rofex.
 *
 * Las dos son públicas y sin key. Lo que no está, no se completa.
 */

const USER_AGENT = 'monitor-mercado/1.0 (+https://github.com/LautaroToscano/monitor-mercado)';
const REQUEST_TIMEOUT_MS = 8_000;

const BASE_MAE = 'https://api.marketdata.mae.com.ar/api';
const BASE_ROFEX = 'https://apicem.matbarofex.com.ar/api/v2';

/** Un cierre ya no cambia; lo de hoy puede aparecer más tarde, así que no se retiene mucho. */
const TTL_MS = 10 * 60_000;

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
      : AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`A3 respondió ${res.status} en ${new URL(url).pathname}`);
  return res.json() as Promise<T>;
}

// ─── Mayorista de cierre ─────────────────────────────────────────────────

export interface CierreMayorista {
  fecha: IsoDate;
  /** Último precio de la rueda, pesos por dólar. */
  cierre: number;
  /** Dólares negociados en el segmento mayorista contado. */
  volumen: number;
}

interface DiaForex {
  fecha: string;
  details?: {
    ticker: string;
    plazo: string;
    codigoSegmento: string;
    precioCierre: number | null;
    ultimo: number | null;
    volumen: number | null;
  }[];
}

/**
 * Cierre del mayorista por rueda, de `desde` a `hasta`.
 *
 * Es la línea UST$T, plazo 000 (contado), segmento M (mayorista): la del
 * mercado de cambios. Las otras líneas del mismo ticker son minoristas o a
 * 24 horas y cotizan unos pesos distinto.
 */
export function fetchCierresMayorista(
  desde: IsoDate,
  hasta: IsoDate,
  signal?: AbortSignal,
): Promise<Map<IsoDate, CierreMayorista>> {
  return memo(`a3:mayorista:${desde}:${hasta}`, TTL_MS, async () => {
    const oTitulo = encodeURIComponent(JSON.stringify({ fechaDesde: desde, fechaHasta: hasta }));
    const dias = await getJson<DiaForex[]>(
      `${BASE_MAE}/mercado/titulo/historicoforex?oTitulo=${oTitulo}`,
      signal,
    );
    const out = new Map<IsoDate, CierreMayorista>();
    for (const dia of dias) {
      const linea = dia.details?.find(
        (d) => d.ticker === 'UST$T' && d.plazo === '000' && d.codigoSegmento === 'M',
      );
      const cierre = linea?.precioCierre || linea?.ultimo;
      if (!linea || !cierre) continue;
      const fecha = dia.fecha.slice(0, 10);
      out.set(fecha, { fecha, cierre, volumen: linea.volumen ?? 0 });
    }
    return out;
  });
}

/** En rueda el mayorista cambia operación a operación; se retiene medio minuto. */
const TTL_VIVO_MS = 30_000;

interface LineaResumen {
  ticker: string;
  plazo: string;
  segmento: string;
  ultimo: number | null;
  fechaLiquidacion: string | null;
  datosGrafico?: { precios?: { time: number; value: number }[] };
}

/**
 * El mayorista de la rueda en curso: último precio de UST$T contado,
 * segmento mayorista.
 *
 * Sale del resumen de A3 y no del listado completo porque el resumen trae la
 * fecha de liquidación, que en contado es la de la rueda. Sin fecha no se
 * puede saber si el precio es de hoy o quedó de ayer, y un spot de otro día
 * contra precios de hoy es justo la mezcla que no se hace. Null si no hay
 * línea con precio.
 */
export function fetchMayoristaEnVivo(signal?: AbortSignal): Promise<CierreMayorista | null> {
  return memo('a3:mayorista:vivo', TTL_VIVO_MS, async () => {
    const lineas = await getJson<LineaResumen[]>(`${BASE_MAE}/mercado/resumen/FOR`, signal);
    const linea = lineas.find((l) => l.ticker === 'UST$T' && l.plazo === '000' && l.segmento === 'M');
    if (!linea?.ultimo || !linea.fechaLiquidacion) return null;
    return { fecha: linea.fechaLiquidacion.slice(0, 10), cierre: linea.ultimo, volumen: 0 };
  });
}

// ─── Futuros de dólar ────────────────────────────────────────────────────

export interface AjusteFuturo {
  /** 'DLR102026': vence el último hábil de octubre de 2026. */
  simbolo: string;
  /** Primer día del mes del contrato, 'YYYY-MM'. */
  mes: string;
  /** Precio de ajuste de la rueda: el que usa la cámara, no el último operado. */
  ajuste: number;
  /** Último operado. 0 si no operó. */
  cierre: number;
  volumen: number;
  interesAbierto: number;
}

/** Filas que devuelve como mucho la API de cierres por pedido. */
const MAX_FILAS_ROFEX = 100;
/** Días calendario por pedido: cinco ruedas, unas 65 filas. */
const TRAMO_DIAS = 7;

function sumarDias(fecha: IsoDate, dias: number): IsoDate {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

interface CierreRofex {
  dateTime: string;
  symbol: string;
  settlement: number;
  close: number;
  volume: number;
  openInterest: number;
}

/**
 * Precios de ajuste de los futuros mensuales de dólar, por rueda.
 *
 * El ajuste lo fija la cámara al cierre del segmento (15:00, el mismo
 * horario que el mercado de cambios) y existe aunque el contrato no haya
 * operado: es el precio contra el que se liquidan diferencias. Por eso se usa
 * ese y no el último operado, que en los contratos largos suele ser cero.
 */
export function fetchAjustesDolar(
  desde: IsoDate,
  hasta: IsoDate,
  signal?: AbortSignal,
): Promise<Map<IsoDate, AjusteFuturo[]>> {
  return memo(`a3:dlr:${desde}:${hasta}`, TTL_MS, async () => {
    // La API devuelve como mucho 100 filas y no avisa que cortó: con doce
    // contratos por rueda, quince días salían sin las últimas ruedas. Se pide
    // de a una semana, que son 60 o 65 filas.
    const filas: CierreRofex[] = [];
    for (let inicio = desde; inicio <= hasta; inicio = sumarDias(inicio, TRAMO_DIAS)) {
      const fin = [sumarDias(inicio, TRAMO_DIAS - 1), hasta].sort()[0];
      const query = new URLSearchParams({
        product: 'DLR',
        segment: 'Monedas',
        type: 'FUT',
        excludeEmptyVol: 'false',
        from: inicio,
        to: fin,
      });
      const { data } = await getJson<{ data?: CierreRofex[] }>(
        `${BASE_ROFEX}/closing-prices?${query}`,
        signal,
      );
      if ((data?.length ?? 0) >= MAX_FILAS_ROFEX) {
        throw new Error(`A3 devolvió ${data!.length} filas del ${inicio} al ${fin}: puede estar cortada`);
      }
      filas.push(...(data ?? []));
    }
    const out = new Map<IsoDate, AjusteFuturo[]>();
    for (const c of filas) {
      // Sólo los mensuales: DLR + MMAAAA. Quedan afuera los pases y los
      // contratos con otra forma de ticker.
      const m = /^DLR(\d{2})(\d{4})$/.exec(c.symbol);
      if (!m || !(c.settlement > 0)) continue;
      const fecha = c.dateTime.slice(0, 10);
      const lista = out.get(fecha) ?? [];
      lista.push({
        simbolo: c.symbol,
        mes: `${m[2]}-${m[1]}`,
        ajuste: c.settlement,
        cierre: c.close,
        volumen: c.volume,
        interesAbierto: c.openInterest,
      });
      out.set(fecha, lista);
    }
    for (const lista of out.values()) lista.sort((a, b) => a.mes.localeCompare(b.mes));
    return out;
  });
}
