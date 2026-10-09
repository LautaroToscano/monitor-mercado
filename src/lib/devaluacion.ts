/**
 * Devaluación implícita: cuánto espera el mercado que suba el dólar oficial.
 *
 * Dos lecturas, de la misma rueda:
 *
 *  - **De futuros (la principal).** Cada contrato mensual de A3 liquida
 *    contra el A3500 del último hábil de su mes. Su precio de ajuste sobre el
 *    spot es la devaluación hasta ese día. No usa bonos ni tasa fija.
 *
 *  - **De bonos (la secundaria).** Fisher entre la curva de tasa fija y la
 *    dólar linked, leídas en la misma fecha. Un dólar linked que vence en t
 *    paga el A3500 de t − 3 hábiles; para compararlo con el futuro de un mes
 *    se lee en t = (último hábil del mes) + 3 hábiles, y así los dos miden el
 *    mismo A3500. Sólo donde llegan las dos curvas: no se extrapola.
 *
 *    1 + devaluación(t) = (1 + TEA nominal)^(d/365) / (1 + TEA dólar linked)^(d/365)
 *
 * La diferencia entre las dos se informa mes a mes tal cual sale. Si cambia
 * de signo o salta, va a `warnings`: no se suaviza.
 */
import { regresionLogaritmica, puntosDelAjuste, type AjusteLogaritmico } from './ajuste';
import {
  DAY_COUNT_BASIS,
  DAYS_PER_MONTH,
  daysBetween,
  parseIsoDate,
  sumarDiasHabiles,
  DL_HABILES_FIJACION_PAGO,
  toIsoDate,
  ultimoHabilDelMes,
  type IsoDate,
} from './conventions';
import type { InstrumentRow, InsumosDolarLinked } from './types';
import { armarRueda } from './universes/dolar-linked';

/** Una devaluación expresada de las formas que se piden. */
export interface Tasas {
  /** Del spot a la fecha, sin anualizar. */
  directa: number;
  /** Equivalente de 30 días. */
  mensual: number;
  /** Nominal anual: directa × 365 / días. */
  tna: number;
  /** Efectiva anual. */
  tea: number;
}

export interface MesDevaluacion {
  /** 'YYYY-MM'. */
  mes: string;
  contrato: string;
  /** Último hábil del mes: el día del A3500 contra el que liquida el futuro. */
  fijacion: IsoDate;
  /** Días de la rueda a la fijación. */
  dias: number;
  futuros: {
    ajuste: number;
    tasas: Tasas;
    /** Contra el contrato del mes anterior; el primero, contra el spot. */
    mesAMes: number;
    volumen: number;
  };
  /** Null fuera del tramo que cubren las dos curvas. */
  bonos: {
    /** Vencimiento de un dólar linked que cobraría ese A3500. */
    vencimientoEquivalente: IsoDate;
    /** Días de la liquidación a ese vencimiento: el plazo al que se leen las curvas. */
    diasCurvas: number;
    teaNominal: number;
    teaDolarLinked: number;
    /** Dólar que implican los bonos para la fijación. */
    tipoDeCambio: number;
    tasas: Tasas;
    /** Contra el mes anterior; el primero, contra el spot. Null si el anterior quedó fuera del tramo. */
    mesAMes: number | null;
  } | null;
  /** Bonos − futuros, en la devaluación mes a mes. Null sin dato de bonos. */
  diferencia: number | null;
}

export interface ResumenCurva {
  a: number;
  b: number;
  r2: number;
  n: number;
  /** Días del papel más corto y del más largo que entraron. */
  desde: number;
  hasta: number;
  papeles: string[];
}

export interface DevaluacionResponse {
  rueda: IsoDate;
  settlementDate: IsoDate;
  spot: number;
  insumos: InsumosDolarLinked;
  curvas: {
    nominal: ResumenCurva | null;
    dolarLinked: ResumenCurva | null;
    /** Plazos, en días desde la liquidación, donde están las dos. */
    tramoComun: { desde: number; hasta: number } | null;
  };
  meses: MesDevaluacion[];
  fetchedAt: string;
  warnings: string[];
}

/**
 * Cuánto puede moverse la diferencia de un mes al siguiente antes de
 * avisar, en puntos de devaluación mensual.
 */
export const SALTO_DIFERENCIA = 0.0025;

export function tasas(directa: number, dias: number): Tasas {
  return {
    directa,
    mensual: (1 + directa) ** (DAYS_PER_MONTH / dias) - 1,
    tna: (directa * DAY_COUNT_BASIS) / dias,
    tea: (1 + directa) ** (DAY_COUNT_BASIS / dias) - 1,
  };
}

function resumen(ajuste: AjusteLogaritmico, papeles: string[]): ResumenCurva {
  const { a, b, r2, n, desde, hasta } = ajuste;
  return { a, b, r2, n, desde, hasta, papeles };
}

/**
 * Curva dólar linked contra los días al vencimiento: la que se lee por
 * fecha. Mismos papeles que la de la pantalla (cero cupón, sin marcas, sin
 * mínimo de días); cambia sólo el eje.
 */
function puntosDolarLinked(instrumentos: readonly InstrumentRow[]) {
  return instrumentos.filter(
    (i) => i.estructura === 'cero-cupon' && i.quality.level === 'ok' && i.tea !== null,
  );
}

export async function buildDevaluacion(ahora: Date = new Date()): Promise<DevaluacionResponse> {
  const { dolarLinked, lecaps, futuros } = await armarRueda(ahora);
  const { insumos } = dolarLinked;
  const warnings = [...dolarLinked.warnings];
  if (!insumos.spot) throw new Error(`Sin cierre mayorista de A3 para la rueda ${insumos.rueda}`);
  const spot = insumos.spot.valor;
  const rueda = parseIsoDate(insumos.rueda);
  const liquidacion = parseIsoDate(dolarLinked.settlementDate);

  const papelesDl = puntosDolarLinked(dolarLinked.instruments);
  const ajusteDl = regresionLogaritmica(
    papelesDl.map((i) => ({ dias: i.daysToMaturity, valor: i.tea as number })),
  );
  // Los mismos papeles que la curva de tasa fija de la pantalla y del breakeven.
  const papelesNom = (lecaps?.instruments ?? []).filter((i) => puntosDelAjuste([i], 'tea').length > 0);
  const ajusteNom = regresionLogaritmica(puntosDelAjuste(papelesNom, 'tea'));
  if (!lecaps) warnings.push(`Sin curva de tasa fija de la rueda ${insumos.rueda}: no hay devaluación de bonos.`);

  const tramoComun =
    ajusteDl && ajusteNom
      ? {
          desde: Math.max(ajusteDl.desde, ajusteNom.desde),
          hasta: Math.min(ajusteDl.hasta, ajusteNom.hasta),
        }
      : null;

  const meses: MesDevaluacion[] = [];
  let previoFuturo = spot;
  let previoBonos: number | null = spot;
  for (const f of futuros) {
    const fijacion = ultimoHabilDelMes(f.mes);
    const dias = daysBetween(rueda, fijacion);
    if (dias <= 0) continue;
    const directaFut = f.ajuste / spot - 1;

    let bonos: MesDevaluacion['bonos'] = null;
    const vence = sumarDiasHabiles(fijacion, DL_HABILES_FIJACION_PAGO);
    const diasCurvas = daysBetween(liquidacion, vence);
    if (ajusteDl && ajusteNom && tramoComun && diasCurvas >= tramoComun.desde && diasCurvas <= tramoComun.hasta) {
      const teaNominal = ajusteNom.evaluar(diasCurvas);
      const teaDolarLinked = ajusteDl.evaluar(diasCurvas);
      const directa =
        ((1 + teaNominal) / (1 + teaDolarLinked)) ** (diasCurvas / DAY_COUNT_BASIS) - 1;
      const tipoDeCambio = spot * (1 + directa);
      bonos = {
        vencimientoEquivalente: toIsoDate(vence),
        diasCurvas,
        teaNominal,
        teaDolarLinked,
        tipoDeCambio,
        tasas: tasas(directa, dias),
        mesAMes: previoBonos === null ? null : tipoDeCambio / previoBonos - 1,
      };
    }

    const mesAMesFut = f.ajuste / previoFuturo - 1;
    meses.push({
      mes: f.mes,
      contrato: f.simbolo,
      fijacion: toIsoDate(fijacion),
      dias,
      futuros: { ajuste: f.ajuste, tasas: tasas(directaFut, dias), mesAMes: mesAMesFut, volumen: f.volumen },
      bonos,
      diferencia: bonos?.mesAMes == null ? null : bonos.mesAMes - mesAMesFut,
    });
    previoFuturo = f.ajuste;
    // El mes a mes de bonos sólo encadena meses seguidos con dato: si uno
    // queda fuera del tramo, el siguiente no se compara contra un hueco.
    previoBonos = bonos ? bonos.tipoDeCambio : null;
  }

  avisarSaltos(meses, warnings);

  return {
    rueda: insumos.rueda,
    settlementDate: dolarLinked.settlementDate,
    spot,
    insumos,
    curvas: {
      nominal: ajusteNom ? resumen(ajusteNom, papelesNom.map((i) => i.ticker)) : null,
      dolarLinked: ajusteDl ? resumen(ajusteDl, papelesDl.map((i) => i.ticker)) : null,
      tramoComun,
    },
    meses,
    fetchedAt: ahora.toISOString(),
    warnings,
  };
}

/** Cambios de signo y saltos de la diferencia entre meses seguidos. */
function avisarSaltos(meses: MesDevaluacion[], warnings: string[]) {
  for (let k = 1; k < meses.length; k += 1) {
    const a = meses[k - 1].diferencia;
    const b = meses[k].diferencia;
    if (a === null || b === null) continue;
    const pp = (v: number) => `${(v * 100).toFixed(2)} pp`;
    if (Math.sign(a) !== Math.sign(b) && a !== 0 && b !== 0) {
      warnings.push(
        `La diferencia bonos − futuros cambia de signo de ${meses[k - 1].mes} (${pp(a)}) a ${meses[k].mes} (${pp(b)}).`,
      );
    } else if (Math.abs(b - a) > SALTO_DIFERENCIA) {
      warnings.push(
        `La diferencia bonos − futuros salta de ${pp(a)} en ${meses[k - 1].mes} a ${pp(b)} en ${meses[k].mes}.`,
      );
    }
  }
}
