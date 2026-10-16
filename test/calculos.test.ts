/**
 * Fórmulas, ajustes de curva y reglas de datos, con casos de resultado
 * conocido.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tamarTem } from '../src/lib/pricing/tamar';
import { finalPayment } from '../src/lib/pricing/zero-coupon';
import { elegirParaElAjuste, regresionCuadratica, regresionLogaritmica } from '../src/lib/ajuste';
import { panelTieneDatos } from '../src/lib/build';
import { tasaFija } from '../src/lib/universes/tasa-fija';
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

test('la curva se dibuja aunque a la mañana casi todos operaron poco (16/10/2026, 11:45)', () => {
  // Dólar linked con 45 minutos de rueda: 3 papeles con diez operaciones o
  // más, 5 con menos y uno sin operar. La parábola pide 4.
  const vista = { modeloCurva: 'parabolico' as const, fueraDelAjuste: undefined };
  const papel = (ticker: string, nivel: 'ok' | 'warn' | 'bad') => ({ ticker, estructura: 'cero-cupon' as const, nivel });
  const rueda = [
    papel('D30O6', 'ok'), papel('D30N6', 'ok'), papel('TMVE8', 'ok'),
    papel('D15E7', 'warn'), papel('D31M7', 'warn'), papel('TZV27', 'warn'), papel('TZV28', 'warn'), papel('TZVD8', 'warn'),
    papel('D10Y7', 'bad'),
  ];
  const elegidos = elegirParaElAjuste(rueda, (p) => p.nivel, vista).map((p) => p.ticker);
  assert.equal(elegidos.length, 8, 'entran los de poco volumen');
  assert.ok(!elegidos.includes('D10Y7'), 'el que no operó, nunca');

  // Con suficientes papeles sin marcas, los de poco volumen no entran.
  const tarde = rueda.map((p) => (p.ticker === 'D15E7' ? { ...p, nivel: 'ok' as const } : p));
  assert.deepEqual(
    elegirParaElAjuste(tarde, (p) => p.nivel, vista).map((p) => p.ticker),
    ['D30O6', 'D30N6', 'TMVE8', 'D15E7'],
  );
});
