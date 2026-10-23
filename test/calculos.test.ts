/**
 * Fórmulas, ajustes de curva y reglas de datos, con casos de resultado
 * conocido.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tamarTem } from '../src/lib/pricing/tamar';
import { finalPayment } from '../src/lib/pricing/zero-coupon';
import { datoQueNoCierra, elegirParaElAjuste, regresionCuadratica, regresionLogaritmica } from '../src/lib/ajuste';
import { panelTieneDatos } from '../src/lib/build';
import { tasaFija } from '../src/lib/universes/tasa-fija';
import { pagoFijado } from '../src/lib/universes/tasa-cer';
import type { Quote } from '../src/lib/types';

test('TAMAR TEM: reproduce la TEA que publica el BCRA (variable 137)', () => {
  // La 137 es la misma TAMAR de la 136 llevada a efectiva anual con la
  // capitalización a 32 días de las normas. Es un control externo de la
  // fórmula: el BCRA la calcula por su cuenta.
  for (const [tna, teaBcra] of [
    [24.0625, 26.8864], // 09/10/2026
    [24.125, 26.9641], // 08/10/2026
  ]) {
    const tea = (1 + tamarTem(tna / 100)) ** 12 - 1;
    assert.equal(Number((tea * 100).toFixed(4)), teaBcra, `TNA ${tna}%`);
  }
});

test('pago final de una LECAP: VN capitalizado a la TEM de emisión', () => {
  const pago = finalPayment({
    symbol: 'S15L6',
    name: 'prueba',
    isin: null,
    issueDate: '2026-01-15',
    maturityDate: '2026-07-15',
    issueTem: 0.02,
    temSource: 'manual',
  });
  assert.ok(Math.abs(pago - 100 * 1.02 ** 6) < 1e-9);
});

test('ajustes: pasan exactos por puntos que tienen su forma', () => {
  const xs = [0.3, 0.8, 1.2, 1.9, 2.7, 3.6];
  const par = regresionCuadratica(xs.map((x) => ({ dias: x, valor: 0.25 + 0.1 * x - 0.02 * x * x })))!;
  assert.ok(Math.abs(par.a - 0.25) < 1e-12 && Math.abs(par.b - 0.1) < 1e-12 && Math.abs(par.c + 0.02) < 1e-12);
  assert.ok(Math.abs(par.r2 - 1) < 1e-12);
  assert.equal(par.desde, 0.3);
  assert.equal(par.hasta, 3.6, 'se dibuja sólo entre el primer y el último papel');

  const log = regresionLogaritmica([30, 90, 180, 365].map((d) => ({ dias: d, valor: 0.2 + 0.01 * Math.log(d) })))!;
  assert.ok(Math.abs(log.a - 0.2) < 1e-12 && Math.abs(log.b - 0.01) < 1e-12);
});

test('ajustes: con pocos puntos no se dibuja curva', () => {
  assert.equal(regresionCuadratica([1, 2, 3].map((x) => ({ dias: x, valor: x }))), null, 'parábola con 3');
  assert.equal(regresionLogaritmica([10, 20].map((x) => ({ dias: x, valor: x }))), null, 'logaritmo con 2');
});

/** Un panel de BYMA con precio para los papeles pedidos. */
function panel(tickers: string[], conHora = true): Map<string, Quote> {
  return new Map(
    tickers.map((s) => [
      s,
      { symbol: s, last: 100, previousClose: 99, lastTradeTime: conHora ? '16:59:00' : null } as Quote,
    ]),
  );
}

test('panel de BYMA: a medias no se usa (el caso del 14/10/2026)', () => {
  const hoy = '2026-10-14';
  const vigentes = [...tasaFija.reference.values()]
    .filter((r) => r.maturityDate > hoy && r.issueDate <= hoy)
    .map((r) => r.symbol);
  assert.ok(vigentes.length >= 5);
  assert.equal(panelTieneDatos(panel(vigentes), tasaFija, hoy), true, 'completo');
  assert.equal(panelTieneDatos(panel(vigentes.slice(0, 1)), tasaFija, hoy), false, 'un solo papel');
  assert.equal(panelTieneDatos(panel(vigentes, false), tasaFija, hoy), false, 'sin ninguna operación');
  assert.equal(panelTieneDatos(new Map(), tasaFija, hoy), false, 'vacío');
});

test('la curva usa siempre el último precio, aunque haya pocas operaciones (16/10/2026)', () => {
  // Dólar linked con 45 minutos de rueda: 3 papeles con diez operaciones o
  // más, 5 con menos y uno sin operar. Decisión del usuario: entran todos.
  // Sólo queda afuera un dato que no cierra (vencimiento distinto del de la
  // norma) y lo apartado por lo que es (el dual con tasa fija de TAMAR).
  const vista = { fueraDelAjuste: undefined };
  const papel = (ticker: string, marca: string | null, fueraDelAjuste?: true) => ({
    ticker,
    estructura: 'cero-cupon' as const,
    fueraDelAjuste,
    quality: { level: 'ok' as const, flags: marca ? [{ code: marca, level: 'warn', message: '' }] : [] },
  });
  const rueda = [
    papel('D30O6', null), papel('D30N6', null), papel('TMVE8', null),
    papel('D15E7', 'THIN_VOLUME'), papel('D31M7', 'THIN_VOLUME'), papel('TZV27', 'THIN_VOLUME'),
    papel('TZV28', 'THIN_VOLUME'), papel('TZVD8', 'THIN_VOLUME'),
    papel('D10Y7', 'NO_TRADES_TODAY'),
    papel('MAL01', 'MATURITY_MISMATCH'),
    papel('TTD26', null, true),
  ];
  const elegidos = elegirParaElAjuste(rueda as never[], datoQueNoCierra, vista).map((p: { ticker: string }) => p.ticker);
  assert.equal(elegidos.length, 9, 'los 9 con precio, operaran mucho, poco o nada hoy');
  assert.ok(!elegidos.includes('MAL01'), 'un dato que no cierra, nunca');
  assert.ok(!elegidos.includes('TTD26'), 'lo apartado por lo que es, nunca');
});

test('un CER con el pago ya fijado no mide una tasa real (TZXO6, 23/10/2026)', () => {
  // El BCRA tenía publicado el CER hasta el 15/11/2026. TZXO6 vence el 30/10
  // y X30N6 el 30/11: el CER de diez hábiles antes de su vencimiento ya
  // estaba publicado, así que su pago ya está fijado. TZXD6 vence el 15/12:
  // su CER todavía no existe, mide una tasa real.
  const serie = { valor: () => null, ultimaFecha: '2026-11-15', fechas: [] };
  assert.equal(pagoFijado('2026-10-30', serie), true, 'TZXO6');
  assert.equal(pagoFijado('2026-11-30', serie), true, 'X30N6');
  assert.equal(pagoFijado('2026-12-15', serie), false, 'TZXD6');
  assert.equal(pagoFijado('2026-10-30', { ...serie, ultimaFecha: null }), false, 'sin CER publicado, no se presume');
});
