import {
  addDays,
  daysBetween,
  dias30360,
  DAYS_PER_MONTH,
  effectiveAnnualRate,
  effectiveMonthlyRate,
  isBusinessDay,
  parseIsoDate,
  restarDiasHabiles,
  TAMAR_LAG_BUSINESS_DAYS,
  toIsoDate,
  type IsoDate,
} from '../conventions';
import type { TamarDetalle, TamarReference, TipoDeCambio } from '../types';
import type { CondicionesTamar } from '../universes/tamar-condiciones';
import { FACE_VALUE } from './zero-coupon';

/** La TAMAR publicada que se conocía en una rueda, en orden. */
export interface TamarConocida {
  /** Fechas y valores (TNA en decimal), sólo los anteriores a la rueda. */
  fechas: readonly IsoDate[];
  valor(fecha: IsoDate): number | null;
  /** La última: la que se proyecta para los hábiles que faltan. */
  vigente: { fecha: IsoDate; valor: number; fuente: string };
}

export interface TamarValuation {
  daysToMaturity: number;
  tem: number;
  tea: number;
  detalle: TamarDetalle;
}

/**
 * TAMAR TEM de la norma: la TNA más el margen, capitalizada a 32 días y
 * llevada a un mes.
 */
export function tamarTem(tna: number): number {
  return (1 + (tna * 32) / 365) ** (365 / 32 / 12) - 1;
}

/**
 * Promedio simple de la TAMAR entre dos fechas: las publicadas con su valor
 * y, si `proyectar`, la vigente para cada hábil que todavía no tiene dato.
 */
function promedio(
  tamar: TamarConocida,
  desde: IsoDate,
  hasta: IsoDate,
  proyectar: boolean,
): { valor: number; publicados: number; proyectados: number } | null {
  let suma = 0;
  let publicados = 0;
  for (const f of tamar.fechas) {
    if (f < desde || f > hasta) continue;
    suma += tamar.valor(f)!;
    publicados += 1;
  }
  let proyectados = 0;
  if (proyectar) {
    const ultima = tamar.vigente.fecha;
    let d = addDays(parseIsoDate(ultima > desde ? ultima : desde), ultima >= desde ? 1 : 0);
    for (; toIsoDate(d) <= hasta; d = addDays(d, 1)) {
      if (!isBusinessDay(d)) continue;
      suma += tamar.vigente.valor;
      proyectados += 1;
    }
  }
  const n = publicados + proyectados;
  return n === 0 ? null : { valor: suma / n, publicados, proyectados };
}

/**
 * Rendimiento de un título a tasa TAMAR, con la TAMAR de hoy constante hasta
 * el vencimiento.
 *
 * El título paga VN × (1 + TAMAR TEM)^(meses 30/360), con la TAMAR promedio
 * de todo su período. La parte ya publicada entra con su valor; sólo los
 * hábiles que faltan se completan con la última publicada. Ese pago se
 * descuenta como en tasa fija:
 *
 *   TIR = (pago proyectado / precio)^(365/días) − 1
 *
 * En los duales es la TIR de la pata TAMAR, un piso: el precio incluye la
 * opción de cobrar la otra. En el dual con dólar linked la base es VN USD
 * 100 al tipo de cambio inicial.
 *
 * El valor técnico es lo devengado a la liquidación con la TAMAR publicada
 * hasta diez hábiles antes de ella, que es la que corresponde a esos días.
 */
export function valuateTamar(
  ref: TamarReference,
  price: number | null,
  settlement: Date,
  c: CondicionesTamar,
  tamar: TamarConocida,
  tcInicial: TipoDeCambio | null,
): TamarValuation | null {
  if (price === null || price <= 0) return null;
  const emision = parseIsoDate(c.emision);
  const vencimiento = parseIsoDate(c.vencimiento);
  const dias = daysBetween(settlement, vencimiento);
  if (dias <= 0) return null;
  if (c.tipo === 'dual-dolar-linked' && !tcInicial) return null;

  const desde = toIsoDate(restarDiasHabiles(emision, TAMAR_LAG_BUSINESS_DAYS));
  const hasta = toIsoDate(restarDiasHabiles(vencimiento, TAMAR_LAG_BUSINESS_DAYS));
  const total = promedio(tamar, desde, hasta, true);
  if (!total) return null;

  const base = c.tipo === 'dual-dolar-linked' ? FACE_VALUE * tcInicial!.valor : FACE_VALUE;
  const meses = dias30360(emision, vencimiento) / DAYS_PER_MONTH;
  const pagoProyectado = base * (1 + tamarTem(total.valor + c.margen)) ** meses;

  // Lo devengado: la TAMAR que corresponde a los días ya corridos.
  const corte = toIsoDate(restarDiasHabiles(settlement, TAMAR_LAG_BUSINESS_DAYS));
  const devengado = promedio(tamar, desde, corte < hasta ? corte : hasta, false);
  const mesesCorridos = Math.max(0, dias30360(emision, settlement)) / DAYS_PER_MONTH;
  const valorTecnico = devengado
    ? base * (1 + tamarTem(devengado.valor + c.margen)) ** mesesCorridos
    : base;

  return {
    daysToMaturity: dias,
    tea: effectiveAnnualRate(price, pagoProyectado, dias),
    tem: effectiveMonthlyRate(price, pagoProyectado, dias),
    detalle: {
      tipo: c.tipo,
      tamarVigente: tamar.vigente,
      margen: c.margen,
      fuenteMargen: c.fuenteMargen,
      tamarPromedio: total.valor,
      habilesPublicados: total.publicados,
      habilesProyectados: total.proyectados,
      pagoProyectado,
      valorTecnico,
      paridad: price / valorTecnico,
      base,
      tcInicial,
      pagoTasaFija: c.tasaFijaTem === undefined ? null : FACE_VALUE * (1 + c.tasaFijaTem) ** meses,
      norma: c.norma,
    },
  };
}
