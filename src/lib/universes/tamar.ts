import {
  addDays,
  MARKET_HOLIDAYS,
  parseIsoDate,
  restarDiasHabiles,
  TAMAR_CONVENTIONS_META,
  TAMAR_LAG_BUSINESS_DAYS,
  toIsoDate,
  type IsoDate,
} from '../conventions';
import { DEFAULT_THRESHOLDS } from '../quality';
import { fetchA3500, fetchTamar, type SerieDiaria } from '../sources/bcra';
import { valuateTamar, type TamarConocida } from '../pricing/tamar';
import type { TamarReference, TipoDeCambio } from '../types';
import type { UniverseDefinition } from './types';
import { vencidosDe } from './vencidos';
import { descubrirPorFicha } from './descubrimiento';
import { reglasTamar } from './tamar-clasificador';
import { CONDICIONES_TAMAR } from './tamar-condiciones';
import { CANDIDATE_SYMBOL, TAMAR_PANELS } from './tamar-spec';
import referenceData from '../reference/tamar.json' with { type: 'json' };

const reference = new Map<string, TamarReference>(
  [...vencidosDe<TamarReference>('tamar'), ...(referenceData.instruments as TamarReference[])].map((r) => [
    r.symbol,
    r,
  ]),
);

const knownNonMembers = new Map<string, string>(
  (referenceData.nonMembers as { symbol: string; reason: string }[]).map((n) => [n.symbol, n.reason]),
);

const FUENTE_TAMAR = 'BCRA, variable 136: TAMAR de bancos privados (TNA)';
const FUENTE_A3500 = 'BCRA, Com. A 3500';

/** Lo que la valuación necesita además del precio. */
interface ContextoTamar {
  /** La rueda de los precios. */
  rueda: IsoDate;
  tamar: TamarConocida;
  /** Para el tipo de cambio inicial del dual con dólar linked. */
  a3500: SerieDiaria | null;
}

/**
 * Si la última TAMAR conocida es más vieja que esto, algo dejó de publicarse
 * y la proyección arrastra un dato viejo: se avisa.
 */
const HABILES_TAMAR_VIEJA = 3;

const ULTIMO_ANIO_CON_FERIADOS = MARKET_HOLIDAYS[MARKET_HOLIDAYS.length - 1].slice(0, 4);

/**
 * Desde cuándo se pide la TAMAR: la emisión más vieja de todas las
 * condiciones cargadas, menos el rezago. Fija, para que sea una sola clave de
 * cache: al rehacer cientos de ruedas, cada una pedía otra serie.
 */
const INICIO_TAMAR = toIsoDate(
  addDays(
    restarDiasHabiles(
      parseIsoDate(Object.values(CONDICIONES_TAMAR).map((c) => c.emision).sort()[0]),
      TAMAR_LAG_BUSINESS_DAYS,
    ),
    -7,
  ),
);

/** Desde cuándo se pide el A3500: la licitación más vieja de los duales con dólar. */
const INICIO_A3500 = toIsoDate(
  addDays(
    parseIsoDate(
      Object.values(CONDICIONES_TAMAR)
        .map((c) => c.licitacion)
        .filter((f): f is IsoDate => Boolean(f))
        .sort()[0] ?? INICIO_TAMAR,
    ),
    -10,
  ),
);

function tcInicial(symbol: string, a3500: SerieDiaria | null): TipoDeCambio | null {
  const licitacion = CONDICIONES_TAMAR[symbol]?.licitacion;
  if (!licitacion || !a3500) return null;
  const fecha = toIsoDate(restarDiasHabiles(parseIsoDate(licitacion), 1));
  const valor = a3500.valor(fecha);
  return valor === null ? null : { fecha, valor, fuente: FUENTE_A3500 };
}

export const tamar: UniverseDefinition<TamarReference, ContextoTamar> = {
  slug: 'tamar',
  label: 'TAMAR',
  description:
    'Letras y bonos del Tesoro a tasa TAMAR y los duales que tienen una pata TAMAR: TIR con la TAMAR de hoy constante contra duration.',
  bymaPanels: TAMAR_PANELS,
  vista: {
    tituloCurva: 'Curva TAMAR',
    // Todos son cero cupón: la duration de Macaulay es el plazo, en años.
    ejeX: 'duration',
    breakeven: false,
    curvaEnTem: true,
    // Decisión del usuario (13/10/2026): parábola contra Macaulay, con los
    // duales CER/TAMAR y TAMAR/dólar adentro. El dual con tasa fija queda
    // afuera (`fueraDelAjuste` en cada papel). Ver docs/tamar.md.
    modeloCurva: 'parabolico',
    tabla: 'tamar',
  },
  candidateSymbol: CANDIDATE_SYMBOL,
  thresholds: DEFAULT_THRESHOLDS,
  conventions: TAMAR_CONVENTIONS_META,
  reference,
  knownNonMembers,
  unresolved: referenceData.unresolved as string[],

  /**
   * La TAMAR que se conocía en la rueda de los precios. El dato de un día se
   * publica el hábil siguiente, así que entran sólo los anteriores a la
   * rueda: en vivo es lo último publicado, y al rehacer un día pasado es lo
   * que se sabía ese día.
   */
  async prepararValuacion(vigentes, liquidacion, signal) {
    const rueda = toIsoDate(restarDiasHabiles(liquidacion, 1));
    const conDolar = vigentes.some((r) => CONDICIONES_TAMAR[r.symbol]?.tipo === 'dual-dolar-linked');
    const [serie, a3500] = await Promise.all([
      fetchTamar(INICIO_TAMAR, signal),
      conDolar ? fetchA3500(INICIO_A3500, signal).catch(() => null) : null,
    ]);
    const fechas = serie.fechas.filter((f) => f < rueda);
    const ultima = fechas[fechas.length - 1];
    if (!ultima) throw new Error(`el BCRA no tiene TAMAR anterior al ${rueda}`);
    const valor = (f: IsoDate) => {
      const v = serie.valor(f);
      return v === null ? null : v / 100;
    };
    return {
      rueda,
      tamar: {
        fechas,
        valor,
        vigente: { fecha: ultima, valor: valor(ultima)!, fuente: FUENTE_TAMAR },
      },
      a3500,
    };
  },

  avisos(vigentes, contexto) {
    const avisos: string[] = [];
    for (const r of vigentes) {
      if (!CONDICIONES_TAMAR[r.symbol]) {
        avisos.push(`${r.symbol}: sin condiciones verificadas en CONDICIONES_TAMAR; no se valúa.`);
        continue;
      }
      const fin = toIsoDate(restarDiasHabiles(parseIsoDate(r.maturityDate), TAMAR_LAG_BUSINESS_DAYS));
      if (fin.slice(0, 4) > ULTIMO_ANIO_CON_FERIADOS) {
        avisos.push(
          `${r.symbol}: su TAMAR se promedia hasta ${fin} y no hay feriados cargados después de ${ULTIMO_ANIO_CON_FERIADOS}; los hábiles proyectados de esos años cuentan los feriados como hábiles.`,
        );
      }
      if (CONDICIONES_TAMAR[r.symbol].tipo === 'dual-dolar-linked' && contexto && !tcInicial(r.symbol, contexto.a3500)) {
        avisos.push(`${r.symbol}: no se encontró el A3500 del tipo de cambio inicial; sale sin TIR.`);
      }
    }
    if (contexto) {
      const { fecha } = contexto.tamar.vigente;
      const vieja = toIsoDate(restarDiasHabiles(parseIsoDate(contexto.rueda), HABILES_TAMAR_VIEJA));
      if (fecha < vieja) {
        avisos.push(`La última TAMAR publicada antes de la rueda del ${contexto.rueda} es del ${fecha}.`);
      }
    }
    return avisos;
  },

  valuate(ref, _quote, price, settlement, contexto) {
    const c = CONDICIONES_TAMAR[ref.symbol];
    if (!contexto || !c) return null;
    const v = valuateTamar(ref, price, settlement, c, contexto.tamar, tcInicial(ref.symbol, contexto.a3500));
    return (
      v && {
        finalPayment: null,
        daysToMaturity: v.daysToMaturity,
        // Cero cupón: la duration de Macaulay es el plazo.
        durationDays: v.daysToMaturity,
        tem: v.tem,
        tea: v.tea,
        tamar: v.detalle,
        // Decisión del usuario (13/10/2026): el dual con tasa fija se dibuja
        // pero no define la curva. Sin margen y a meses de vencer, tiraba el
        // tramo corto tres puntos para abajo.
        ...(c.tipo === 'dual-tasa-fija' && { fueraDelAjuste: true }),
      }
    );
  },

  descubrir: (simbolos, signal) => descubrirPorFicha(simbolos, reglasTamar, signal),
};
