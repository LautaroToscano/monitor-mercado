import {
  CER_CONVENTIONS_META,
  CER_LAG_BUSINESS_DAYS,
  parseIsoDate,
  restarDiasHabiles,
  toIsoDate,
} from '../conventions';
import { DEFAULT_THRESHOLDS } from '../quality';
import { fetchCer, type SerieDiaria } from '../sources/bcra';
import { valuateCer } from '../pricing/cer';
import type { CerReference } from '../types';
import type { UniverseDefinition } from './types';
import { vencidosDe } from './vencidos';
import { descubrirPorFicha } from './descubrimiento';
import { reglasTasaCer } from './tasa-cer-clasificador';
import { CANDIDATE_SYMBOL, TASA_CER_PANELS } from './tasa-cer-spec';
import referenceData from '../reference/tasa-cer.json' with { type: 'json' };

const reference = new Map<string, CerReference>(
  [...vencidosDe<CerReference>('tasa-cer'), ...(referenceData.instruments as CerReference[])].map((r) => [
    r.symbol,
    r,
  ]),
);

const knownNonMembers = new Map<string, string>(
  (referenceData.nonMembers as { symbol: string; reason: string }[]).map((n) => [n.symbol, n.reason]),
);

/**
 * Si el pago de un CER ya está fijado: el CER que lo ajusta, el de diez
 * hábiles antes del vencimiento, ya está publicado (el BCRA lo publica hasta
 * el 15 del mes siguiente). Un papel así es, en los hechos, un bono en pesos
 * con pago conocido: su TIR "real" no mide ninguna expectativa de inflación,
 * y a pocos días del vencimiento cualquier diferencia mínima de precio se
 * multiplica al anualizarla.
 *
 * El 23/10/2026 TZXO6, a 4 días del vencimiento, daba −14,74% real (el día
 * anterior, −1,31%): por el peso del papel más corto en el ajuste
 * logarítmico, dio vuelta la curva real y llevó el breakeven de octubre de
 * 1,75% a 2,22%, con los pares de control desviados hasta 0,19 puntos. Sin
 * los de pago fijado daba 1,83% y los pares, a 0,01–0,11. Decisión del
 * usuario: no entran a la curva CER ni al breakeven; siguen sólo en la
 * tabla, sin punto en el gráfico (`seGrafica` en ajuste.ts).
 */
export function pagoFijado(vencimiento: string, serie: SerieDiaria): boolean {
  const fijacion = toIsoDate(restarDiasHabiles(parseIsoDate(vencimiento), CER_LAG_BUSINESS_DAYS));
  return serie.ultimaFecha !== null && fijacion <= serie.ultimaFecha;
}

export const tasaCer: UniverseDefinition<CerReference, SerieDiaria> = {
  slug: 'tasa-cer',
  label: 'CER',
  description:
    'Títulos del Tesoro ajustables por CER: BONCER y LECER cero cupón, bonos con cupón, Discount, Par, Cuasipar y duales CER/TAMAR.',
  bymaPanels: TASA_CER_PANELS,
  vista: { tituloCurva: 'Curva CER', ejeX: 'duration', breakeven: true, curvaEnTem: false },
  candidateSymbol: CANDIDATE_SYMBOL,
  thresholds: DEFAULT_THRESHOLDS,
  conventions: CER_CONVENTIONS_META,
  reference,
  knownNonMembers,
  unresolved: referenceData.unresolved as string[],

  /**
   * Un solo pedido al BCRA por request, desde el CER de emisión más viejo que
   * haga falta. Todos los CER que usa la valuación son de fechas pasadas —diez
   * hábiles antes de la emisión o de la liquidación—, así que siempre están
   * publicados.
   */
  prepararValuacion(vigentes, liquidacion, signal) {
    const fechas = vigentes.map((ref) => parseIsoDate(ref.issueDate));
    fechas.push(liquidacion);
    const primera = fechas.reduce((a, b) => (a < b ? a : b));
    return fetchCer(toIsoDate(restarDiasHabiles(primera, CER_LAG_BUSINESS_DAYS)), signal);
  },

  valuate(ref, _quote, price, settlement, serie) {
    if (!serie) return null;
    const v = valuateCer(ref, price, settlement, serie);
    return (
      v && {
        finalPayment: null,
        daysToMaturity: v.daysToMaturity,
        durationDays: v.durationDays,
        tem: v.tem,
        tea: v.tea,
        cer: v.cer,
        // Con el pago ya fijado no mide una tasa real: va sólo en la tabla,
        // no define la curva ni entra al breakeven (`pagoFijado`).
        ...(pagoFijado(ref.maturityDate, serie) && { fueraDelAjuste: true }),
      }
    );
  },

  descubrir: (simbolos, signal) => descubrirPorFicha(simbolos, reglasTasaCer, signal),
};
