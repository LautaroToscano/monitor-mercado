import {
  DAY_COUNT_BASIS,
  daysBetween,
  effectiveAnnualRate,
  effectiveMonthlyRate,
  parseIsoDate,
  restarDiasHabiles,
  toIsoDate,
} from '../conventions';
import type { SerieDiaria } from '../sources/bcra';
import type { DolarLinkedDetalle, DolarLinkedReference, TipoDeCambio } from '../types';
import type { CondicionesDolarLinked } from '../universes/dolar-linked-condiciones';
import { FACE_VALUE } from './zero-coupon';

export interface DolarLinkedValuation {
  daysToMaturity: number;
  /** TIR sobre el dólar oficial, efectiva mensual. Puede ser negativa. */
  tem: number;
  /** TIR sobre el dólar oficial, efectiva anual. Puede ser negativa. */
  tea: number;
  detalle: DolarLinkedDetalle;
}

/**
 * Rendimiento de un título dólar linked cero cupón.
 *
 * Paga VN USD 100 convertidos al A3500 de una fecha futura, que todavía no
 * existe y no se estima. Se mide en dólares de hoy: el pago vale 100 × spot,
 * con el spot del cierre mayorista de A3 de la misma rueda que el precio.
 *
 *   TIR = (100 × spot / precio)^(365/días) − 1
 *
 * Es la tasa en dólares oficiales: lo que rinde por encima de la
 * devaluación. Puede ser negativa. En el dual es la de la pata dólar, un
 * piso.
 *
 * El spot es el cierre del mercado, no el A3500: el A3500 es el que fija el
 * pago y la suscripción, y se informa aparte (`tcInicial`, `fijacionPago`).
 * Los días se cuentan de la liquidación al vencimiento, como en tasa fija.
 */
export function valuateDolarLinked(
  ref: DolarLinkedReference,
  price: number | null,
  settlement: Date,
  spot: TipoDeCambio,
  condiciones: CondicionesDolarLinked | undefined,
  a3500: SerieDiaria | null,
): DolarLinkedValuation | null {
  if (price === null || price <= 0) return null;
  const vencimiento = parseIsoDate(ref.maturityDate);
  const dias = daysBetween(settlement, vencimiento);
  if (dias <= 0) return null;

  const pagoHoy = FACE_VALUE * spot.valor;
  const tea = effectiveAnnualRate(price, pagoHoy, dias);
  const tem = effectiveMonthlyRate(price, pagoHoy, dias);

  let tcInicial: TipoDeCambio | null = null;
  if (condiciones && a3500) {
    const fecha = toIsoDate(
      restarDiasHabiles(parseIsoDate(condiciones.licitacion), condiciones.habilesTcInicial),
    );
    const valor = a3500.valor(fecha);
    if (valor !== null) tcInicial = { fecha, valor, fuente: 'BCRA, Com. A 3500' };
  }

  return {
    daysToMaturity: dias,
    tea,
    tem,
    detalle: {
      spot,
      tcImplicito: price / FACE_VALUE,
      tcInicial,
      fijacionPago: condiciones
        ? toIsoDate(restarDiasHabiles(vencimiento, condiciones.habilesFijacionPago))
        : null,
      reglaPago: condiciones?.reglaPago ?? null,
      norma: condiciones?.norma ?? null,
      durationModificada: dias / DAY_COUNT_BASIS / (1 + tea),
    },
  };
}
