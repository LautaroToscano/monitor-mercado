/**
 * Regresión: el cierre del 13/10/2026, congelado.
 *
 * Esa rueda se validó a mano: la TAMAR contra la página de referencia del
 * usuario (seis de nueve TIR idénticas con el mismo dato), dólar linked y
 * CER contra sus normas. `fixtures/cierre-2026-10-13/` tiene la respuesta
 * completa de cada curva y la serie de la TAMAR que se conocía ese día.
 *
 * Cada test recalcula la TIR de todos los papeles desde su precio y los
 * insumos de ese día, con el código de hoy. Si un cambio mueve un solo
 * número, falla: o el cambio está mal, o cambió una convención a propósito y
 * hay que regenerar el congelado sabiendo por qué.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseIsoDate as P, type IsoDate } from '../src/lib/conventions';
import { valuate as valuarTasaFija } from '../src/lib/pricing/zero-coupon';
import { valuateCer } from '../src/lib/pricing/cer';
import { valuateDolarLinked } from '../src/lib/pricing/dolar-linked';
import { valuateTamar, type TamarConocida } from '../src/lib/pricing/tamar';
import { CONDICIONES_DOLAR_LINKED } from '../src/lib/universes/dolar-linked-condiciones';
import { CONDICIONES_TAMAR } from '../src/lib/universes/tamar-condiciones';
import type { SerieDiaria } from '../src/lib/sources/bcra';
import type {
  CerReference,
  DolarLinkedReference,
  InstrumentRow,
  TamarReference,
  UniverseResponse,
  ZeroCouponReference,
} from '../src/lib/types';

const DIR = new URL('./fixtures/cierre-2026-10-13/', import.meta.url);
const leer = <T>(archivo: string): T => JSON.parse(readFileSync(new URL(archivo, DIR), 'utf8'));
const curva = (slug: string) => leer<UniverseResponse>(`${slug}.json`);

/** La liquidación de cada papel: T+1, o la rueda misma si cotiza en contado. */
const liquidacion = (u: UniverseResponse, i: InstrumentRow) =>
  P(i.settlementBasis === 'contado' ? u.tradeDate : u.settlementDate);

const base = (i: InstrumentRow) => ({
  symbol: i.ticker,
  name: i.name,
  isin: i.reference?.isin ?? null,
  issueDate: i.reference!.issueDate,
  maturityDate: i.maturityDate,
});

/** Mismo número hasta la novena cifra: es la misma cuenta, no una parecida. */
function igual(calculada: number | null | undefined, guardada: number | null, quien: string) {
  assert.notEqual(calculada, null, `${quien}: no se pudo calcular`);
  assert.notEqual(guardada, null, `${quien}: el congelado no tiene TIR`);
  assert.ok(
    Math.abs(calculada! - guardada!) < 1e-9,
    `${quien}: TIR ${(calculada! * 100).toFixed(6)}% contra ${(guardada! * 100).toFixed(6)}% congelada`,
  );
}

function serie(puntos: { fecha: IsoDate; valor: number }[]): SerieDiaria {
  const m = new Map(puntos.map((p) => [p.fecha, p.valor]));
  const fechas = [...m.keys()].sort();
  return { valor: (f) => m.get(f) ?? null, ultimaFecha: fechas.at(-1) ?? null, fechas };
}

test('tasa fija: los 9 papeles', () => {
  const u = curva('tasa-fija');
  assert.equal(u.instruments.length, 9);
  for (const i of u.instruments) {
    const ref: ZeroCouponReference = {
      ...base(i),
      issueTem: i.reference!.issueTem!,
      temSource: i.reference!.temSource!,
    };
    const v = valuarTasaFija(ref, i.lastPrice, liquidacion(u, i));
    igual(v?.tea, i.tea, i.ticker);
    assert.ok(Math.abs(v!.finalPayment - i.finalPayment!) < 1e-9, `${i.ticker}: pago final`);
  }
});

test('CER: los 29 papeles, con cupón y del canje incluidos', () => {
  const u = curva('tasa-cer');
  assert.equal(u.instruments.length, 29);
  for (const i of u.instruments) {
    const ref: CerReference = { ...base(i), estructura: i.estructura };
    const cer = serie([i.cer!.emision, i.cer!.liquidacion]);
    const v = valuateCer(ref, i.lastPrice, liquidacion(u, i), cer);
    igual(v?.tea, i.tea, i.ticker);
  }
});

test('dólar linked: los 9 papeles, con el mayorista de la rueda', () => {
  const u = curva('dolar-linked');
  assert.equal(u.instruments.length, 9);
  for (const i of u.instruments) {
    const ref: DolarLinkedReference = { ...base(i), estructura: i.estructura as 'cero-cupon' | 'dual' };
    const v = valuateDolarLinked(
      ref,
      i.lastPrice,
      liquidacion(u, i),
      i.dolarLinked!.spot,
      CONDICIONES_DOLAR_LINKED[i.ticker],
      null,
    );
    igual(v?.tea, i.tea, i.ticker);
  }
});

test('TAMAR: los 12 papeles, con la TAMAR que se conocía ese día', () => {
  const u = curva('tamar');
  assert.equal(u.instruments.length, 12);
  const { datos } = leer<{ datos: { fecha: IsoDate; valor: number }[] }>('tamar-136.json');
  const conocidas = datos.filter((d) => d.fecha < u.tradeDate);
  const ultima = conocidas.at(-1)!;
  const tamar: TamarConocida = {
    fechas: conocidas.map((d) => d.fecha),
    valor: (() => {
      const m = new Map(conocidas.map((d) => [d.fecha, d.valor / 100]));
      return (f: IsoDate) => m.get(f) ?? null;
    })(),
    vigente: { fecha: ultima.fecha, valor: ultima.valor / 100, fuente: 'congelado' },
  };
  assert.equal(ultima.fecha, '2026-10-09', 'la TAMAR del 13/10 se proyecta con la del 09/10');

  for (const i of u.instruments) {
    const ref: TamarReference = { ...base(i), estructura: i.estructura as 'cero-cupon' | 'dual' };
    const v = valuateTamar(
      ref,
      i.lastPrice,
      liquidacion(u, i),
      CONDICIONES_TAMAR[i.ticker],
      tamar,
      i.tamar!.tcInicial,
    );
    igual(v?.tea, i.tea, i.ticker);
    assert.ok(Math.abs(v!.detalle.paridad - i.tamar!.paridad) < 1e-9, `${i.ticker}: paridad`);
  }
});

test('TAMAR: coincide con la página de referencia del usuario', () => {
  // Con la TAMAR del 08/10 (24,125%), la que proyectaba la página, seis de
  // los nueve papeles de su tabla dan la misma TIR al centésimo.
  const u = curva('tamar');
  const { datos } = leer<{ datos: { fecha: IsoDate; valor: number }[] }>('tamar-136.json');
  const conocidas = datos.filter((d) => d.fecha <= '2026-10-08');
  const m = new Map(conocidas.map((d) => [d.fecha, d.valor / 100]));
  const tamar: TamarConocida = {
    fechas: conocidas.map((d) => d.fecha),
    valor: (f) => m.get(f) ?? null,
    vigente: { fecha: '2026-10-08', valor: 0.24125, fuente: 'congelado' },
  };
  const pagina: Record<string, number> = {
    TML27: 31.21, TMF28: 37.1, TXMJ8: 37.38, TMG28: 38.93, TXMD8: 38.2, TXMJ9: 39.08,
  };
  for (const [ticker, tir] of Object.entries(pagina)) {
    const i = u.instruments.find((x) => x.ticker === ticker)!;
    const ref: TamarReference = { ...base(i), estructura: i.estructura as 'cero-cupon' | 'dual' };
    const v = valuateTamar(ref, i.lastPrice, liquidacion(u, i), CONDICIONES_TAMAR[ticker], tamar, i.tamar!.tcInicial);
    assert.equal(Number((v!.tea * 100).toFixed(2)), tir, ticker);
  }
});
