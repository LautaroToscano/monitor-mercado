import {
  addDays,
  DL_CONVENTIONS_META,
  isBusinessDay,
  MARKET_HOLIDAYS,
  parseIsoDate,
  restarDiasHabiles,
  toIsoDate,
  ultimaRuedaTerminada,
  type IsoDate,
} from '../conventions';
import { buildUniverse, type Precios } from '../build';
import { DEFAULT_THRESHOLDS } from '../quality';
import {
  fetchAjustesDolar,
  fetchCierresMayorista,
  fetchMayoristaEnVivo,
  type AjusteFuturo,
} from '../sources/a3';
import { fetchA3500, type SerieDiaria } from '../sources/bcra';
import { valuateDolarLinked } from '../pricing/dolar-linked';
import type { DolarLinkedReference, TipoDeCambio, UniverseResponse } from '../types';
import type { UniverseDefinition } from './types';
import { descubrirPorFicha } from './descubrimiento';
import { reglasDolarLinked } from './dolar-linked-clasificador';
import { CONDICIONES_DOLAR_LINKED } from './dolar-linked-condiciones';
import { CANDIDATE_SYMBOL, DOLAR_LINKED_PANELS } from './dolar-linked-spec';
import { tasaFija } from './tasa-fija';
import referenceData from '../reference/dolar-linked.json' with { type: 'json' };

const reference = new Map<string, DolarLinkedReference>(
  (referenceData.instruments as DolarLinkedReference[]).map((r) => [r.symbol, r]),
);

const knownNonMembers = new Map<string, string>(
  (referenceData.nonMembers as { symbol: string; reason: string }[]).map((n) => [n.symbol, n.reason]),
);

/** Lo que la valuación necesita además del precio. */
interface ContextoDolarLinked {
  spot: TipoDeCambio;
  /** Para el tipo de cambio inicial. Null si el BCRA no respondió. */
  a3500: SerieDiaria | null;
}

const FUENTE_SPOT = 'A3, mercado de cambios: UST$T mayorista contado, último precio';
const FUENTE_FUTUROS = 'A3 (ex Matba Rofex), futuros DLR mensuales: precio de ajuste';
const FUENTE_BYMA = 'BYMA, paneles lebacs y public-bonds, 24hs';
const FUENTE_A3500 = 'BCRA, Com. A 3500';

/**
 * Horarios de cierre de cada insumo, hora de Buenos Aires.
 *
 * Los dos de A3 cierran a las 15:00 —el mercado de cambios y el ajuste de los
 * futuros de dólar— y los bonos de BYMA a las 17:00. El spot y los futuros
 * son de la misma hora entre sí, pero dos horas anteriores a los precios de
 * los bonos y las LECAPs: lo que se mueva el dólar entre las 15 y las 17
 * queda en los bonos y no en el spot.
 */
const CIERRE_BYMA = '17:00 (BYMA; el feed termina de publicar 17:20)';
const CIERRE_A3_CAMBIOS = '15:00 (A3, mercado de cambios)';
const CIERRE_A3_FUTUROS = '15:00 (A3, ajuste del segmento de monedas)';

/** Cuántas ruedas para atrás se busca una con los cuatro insumos. */
const MAX_RUEDAS_ATRAS = 5;

/** Ventana de cierres que se pide a A3: la misma clave de cache para todos. */
function ventana(rueda: IsoDate): { desde: IsoDate; hasta: IsoDate } {
  return { desde: toIsoDate(addDays(parseIsoDate(rueda), -15)), hasta: rueda };
}

/** Desde cuándo hace falta el A3500: la licitación más vieja de los vigentes. */
function inicioA3500(vigentes: readonly DolarLinkedReference[]): IsoDate {
  const fechas = vigentes
    .map((r) => CONDICIONES_DOLAR_LINKED[r.symbol]?.licitacion ?? r.issueDate)
    .sort();
  return toIsoDate(addDays(parseIsoDate(fechas[0] ?? toIsoDate(new Date())), -10));
}

const ULTIMO_ANIO_CON_FERIADOS = MARKET_HOLIDAYS[MARKET_HOLIDAYS.length - 1].slice(0, 4);

export const dolarLinked: UniverseDefinition<DolarLinkedReference, ContextoDolarLinked> = {
  slug: 'dolar-linked',
  label: 'Dólar linked',
  description:
    'Letras y bonos del Tesoro vinculados al dólar oficial y el dual TAMAR / dólar linked: TIR sobre el dólar contra duration modificada.',
  bymaPanels: DOLAR_LINKED_PANELS,
  vista: {
    tituloCurva: 'Curva dólar linked',
    ejeX: 'duration-modificada',
    breakeven: false,
    curvaEnTem: true,
    sinMinimoDeHabiles: true,
    fueraDelAjuste: ['dual'],
  },
  candidateSymbol: CANDIDATE_SYMBOL,
  thresholds: DEFAULT_THRESHOLDS,
  conventions: DL_CONVENTIONS_META,
  reference,
  knownNonMembers,
  unresolved: referenceData.unresolved as string[],

  /**
   * El spot es el mayorista de A3 de la misma rueda que los precios. La curva
   * va en vivo como las otras: con la rueda abierta, el último mayorista de
   * hoy; con el mercado cerrado, el cierre de la rueda de los precios. La
   * rueda sale de la liquidación, que es su T+1, y el spot de otro día no se
   * usa: si no está el de esa rueda, los papeles salen sin TIR.
   */
  async prepararValuacion(vigentes, liquidacion, signal) {
    const rueda = toIsoDate(restarDiasHabiles(liquidacion, 1));
    const { desde, hasta } = ventana(rueda);
    const [vivo, cierres, a3500] = await Promise.all([
      fetchMayoristaEnVivo(signal).catch(() => null),
      fetchCierresMayorista(desde, hasta, signal).catch(() => new Map<IsoDate, never>()),
      fetchA3500(inicioA3500(vigentes), signal).catch(() => null),
    ]);
    const valor = vivo?.fecha === rueda ? vivo.cierre : cierres.get(rueda)?.cierre;
    if (!valor) throw new Error(`A3 no tiene el mayorista del ${rueda}`);
    return { spot: { fecha: rueda, valor, fuente: FUENTE_SPOT }, a3500 };
  },

  valuate(ref, _quote, price, settlement, contexto) {
    if (!contexto) return null;
    const v = valuateDolarLinked(
      ref,
      price,
      settlement,
      contexto.spot,
      CONDICIONES_DOLAR_LINKED[ref.symbol],
      contexto.a3500,
    );
    return (
      v && {
        finalPayment: null,
        daysToMaturity: v.daysToMaturity,
        // Cero cupón: la duration de Macaulay es el plazo.
        durationDays: v.daysToMaturity,
        tem: v.tem,
        tea: v.tea,
        dolarLinked: v.detalle,
      }
    );
  },

  descubrir: (simbolos, signal) => descubrirPorFicha(simbolos, reglasDolarLinked, signal),
};

/**
 * Los cuatro insumos de la devaluación implícita de la misma rueda: bonos,
 * LECAPs, mayorista de A3 y ajuste de los futuros.
 *
 * Siempre con el cierre de la última rueda terminada, como el breakeven: con
 * el mercado abierto, el de ayer. Si a esa rueda le falta alguno de los
 * cuatro no se mezclan fechas: se baja a la anterior en que estén todos, y la
 * respuesta dice cuál se usó y de qué rueda es cada uno. La curva de la
 * pantalla no pasa por acá: va en vivo.
 */
/** Lo que sale de una rueda común: las dos curvas y los futuros de ese día. */
export interface RuedaDolarLinked {
  dolarLinked: UniverseResponse & { insumos: NonNullable<UniverseResponse['insumos']> };
  /** La curva de tasa fija de la misma rueda. Null si BYMA no la dio. */
  lecaps: UniverseResponse | null;
  futuros: AjusteFuturo[];
}

export async function armarRueda(ahora: Date): Promise<RuedaDolarLinked> {
  const pedida = ultimaRuedaTerminada(ahora);
  const { desde, hasta } = ventana(pedida);

  const [bonos, lecaps, cierres, ajustes, a3500] = await Promise.all([
    buildUniverse(dolarLinked, ahora, 'cierre'),
    buildUniverse(tasaFija, ahora, 'cierre').catch(() => null),
    fetchCierresMayorista(desde, hasta).catch(() => new Map<IsoDate, never>()),
    fetchAjustesDolar(desde, hasta).catch(() => new Map<IsoDate, AjusteFuturo[]>()),
    fetchA3500(desde).catch(() => null),
  ]);

  const warnings: string[] = [];
  const tope = [bonos.tradeDate, lecaps?.tradeDate ?? bonos.tradeDate].sort()[0];
  let rueda: IsoDate | null = null;
  let cursor = parseIsoDate(tope);
  for (let k = 0; k < MAX_RUEDAS_ATRAS && rueda === null; k += 1) {
    while (!isBusinessDay(cursor)) cursor = addDays(cursor, -1);
    const fecha = toIsoDate(cursor);
    if (cierres.has(fecha) && ajustes.has(fecha)) rueda = fecha;
    cursor = addDays(cursor, -1);
  }

  if (rueda === null) {
    warnings.push(
      `No hay una rueda en las últimas ${MAX_RUEDAS_ATRAS} con bonos, mayorista de A3 y futuros a la vez; se muestran los bonos del ${bonos.tradeDate}.`,
    );
    rueda = bonos.tradeDate;
  }
  if (rueda !== pedida) {
    warnings.push(`La última rueda terminada es ${pedida} pero no tiene los cuatro insumos: se usa ${rueda}.`);
  }

  const cierreDe: Precios = { cierreDe: rueda };
  const [bonosRueda, lecapsRueda] = await Promise.all([
    bonos.tradeDate === rueda ? bonos : buildUniverse(dolarLinked, ahora, cierreDe),
    lecaps?.tradeDate === rueda
      ? lecaps
      : buildUniverse(tasaFija, ahora, cierreDe).catch(() => null),
  ]);

  for (const i of bonosRueda.instruments) {
    if (!CONDICIONES_DOLAR_LINKED[i.ticker]) {
      warnings.push(
        `${i.ticker}: sin condiciones verificadas en CONDICIONES_DOLAR_LINKED; no se sabe qué A3500 paga.`,
      );
    }
    if (i.dolarLinked?.fijacionPago && i.dolarLinked.fijacionPago.slice(0, 4) > ULTIMO_ANIO_CON_FERIADOS) {
      warnings.push(
        `${i.ticker}: la fijación del pago (${i.dolarLinked.fijacionPago}) cae en un año sin feriados cargados.`,
      );
    }
  }

  const spot = cierres.get(rueda);
  const futuros = ajustes.get(rueda) ?? [];
  const a3500Rueda = a3500?.valor(rueda) ?? null;

  const respuesta = {
    ...bonosRueda,
    warnings: [...bonosRueda.warnings, ...warnings],
    insumos: {
      rueda,
      ruedaPedida: pedida,
      bonos: { rueda: bonosRueda.tradeDate, fuente: FUENTE_BYMA, cierre: CIERRE_BYMA },
      lecaps: { rueda: lecapsRueda?.tradeDate ?? null, fuente: FUENTE_BYMA, cierre: CIERRE_BYMA },
      spot: spot
        ? { fecha: rueda, valor: spot.cierre, fuente: FUENTE_SPOT, cierre: CIERRE_A3_CAMBIOS }
        : null,
      futuros: {
        rueda: futuros.length ? rueda : null,
        fuente: FUENTE_FUTUROS,
        cierre: CIERRE_A3_FUTUROS,
        contratos: futuros.map(({ simbolo, mes, ajuste, volumen, interesAbierto }) => ({
          simbolo,
          mes,
          ajuste,
          volumen,
          interesAbierto,
        })),
      },
      a3500: a3500Rueda === null ? null : { fecha: rueda, valor: a3500Rueda, fuente: FUENTE_A3500 },
    },
  };
  return {
    dolarLinked: respuesta,
    lecaps: lecapsRueda?.tradeDate === rueda ? lecapsRueda : null,
    futuros,
  };
}
