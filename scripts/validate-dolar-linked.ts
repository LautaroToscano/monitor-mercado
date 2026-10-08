/**
 * Validación de la curva dólar linked, sin levantar Next.
 *
 *   npm run validate:dolar-linked
 *
 * Imprime de qué rueda es cada insumo, la tabla con las condiciones de
 * emisión y la TIR de cada papel, el ajuste con y sin el papel más corto, y
 * el cierre mayorista de A3 contra el A3500 de las últimas veinte ruedas.
 */
import { regresionLogaritmica, type AjusteLogaritmico } from '../src/lib/ajuste';
import { addDays, parseIsoDate, toIsoDate } from '../src/lib/conventions';
import { fetchCierresMayorista } from '../src/lib/sources/a3';
import { fetchA3500 } from '../src/lib/sources/bcra';
import type { InstrumentRow } from '../src/lib/types';
import { dolarLinked } from '../src/lib/universes/dolar-linked';
import { CONDICIONES_DOLAR_LINKED } from '../src/lib/universes/dolar-linked-condiciones';

const pct = (v: number | null, d = 2) => (v === null ? '—' : `${(v * 100).toFixed(d)}%`);
const num = (v: number | null | undefined, d = 2) =>
  v === null || v === undefined ? '—' : v.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });

function entraAlAjuste(i: InstrumentRow): boolean {
  return i.estructura === 'cero-cupon' && i.quality.level === 'ok' && i.tea !== null && !!i.dolarLinked;
}

function ajustar(instrumentos: InstrumentRow[]): AjusteLogaritmico | null {
  return regresionLogaritmica(
    instrumentos.map((i) => ({ dias: i.dolarLinked!.durationModificada, valor: i.tea! })),
  );
}

async function main() {
  const r = await dolarLinked.construir!(new Date());
  const ins = r.insumos!;

  console.log(`\nDÓLAR LINKED  rueda ${ins.rueda} (pedida ${ins.ruedaPedida})  liquidación ${r.settlementDate}  sesión ${r.session}`);
  console.log('\nInsumos');
  console.log(`  bonos     ${ins.bonos.rueda}   cierre ${ins.bonos.cierre}   ${ins.bonos.fuente}`);
  console.log(`  LECAPs    ${ins.lecaps.rueda}   cierre ${ins.lecaps.cierre}   ${ins.lecaps.fuente}`);
  console.log(`  spot A3   ${ins.spot?.fecha}   ${num(ins.spot?.valor ?? null, 2)}   cierre ${ins.spot?.cierre}`);
  console.log(`  futuros   ${ins.futuros.rueda}   ${ins.futuros.contratos.length} contratos   cierre ${ins.futuros.cierre}`);
  console.log(`  A3500     ${ins.a3500?.fecha}   ${num(ins.a3500?.valor ?? null, 4)}   (sólo referencia: no valúa)`);

  console.log('\nTabla');
  console.log(
    [
      'ticker'.padEnd(6), 'vence'.padEnd(10), 'días'.padStart(4), 'dur.mod'.padStart(7),
      'precio'.padStart(10), 'TC impl.'.padStart(9), 'TC inicial'.padStart(22), 'spot A3'.padStart(8),
      'TIR TEA'.padStart(8), 'TEM'.padStart(7), 'fija pago'.padStart(10), 'ajuste', 'norma',
    ].join('  '),
  );
  for (const i of r.instruments) {
    const dl = i.dolarLinked;
    const ini = dl?.tcInicial ? `${num(dl.tcInicial.valor, 4)} (${dl.tcInicial.fecha.slice(5)})` : '—';
    console.log(
      [
        i.ticker.padEnd(6),
        i.maturityDate,
        String(i.daysToMaturity).padStart(4),
        num(dl?.durationModificada ?? null, 3).padStart(7),
        num(i.lastPrice, 2).padStart(10),
        num(dl?.tcImplicito ?? null, 2).padStart(9),
        ini.padStart(22),
        num(dl?.spot.valor ?? null, 1).padStart(8),
        pct(i.tea).padStart(8),
        pct(i.tem, 3).padStart(7),
        (dl?.fijacionPago ?? '—').padStart(10),
        (entraAlAjuste(i) ? 'sí' : `no (${i.estructura === 'dual' ? 'dual' : i.quality.flags.map((f) => f.code).join(',')})`).padEnd(6),
        `${dl?.norma ?? 'SIN CONDICIONES'}  ${CONDICIONES_DOLAR_LINKED[i.ticker]?.fuente ?? ''}`,
      ].join('  '),
    );
  }

  const dentro = r.instruments.filter(entraAlAjuste);
  const corto = dentro.reduce((a, b) => (a.daysToMaturity <= b.daysToMaturity ? a : b));
  const con = ajustar(dentro);
  const sin = ajustar(dentro.filter((i) => i !== corto));
  console.log(`\nAjuste TEA = a + b·ln(duration modificada en años)`);
  for (const [nombre, f] of [[`con ${corto.ticker}`, con], [`sin ${corto.ticker}`, sin]] as const) {
    console.log(`  ${nombre.padEnd(10)} ${f ? `a ${pct(f.a, 3)}  b ${pct(f.b, 3)}  R² ${f.r2.toFixed(3)}  n ${f.n}` : 'sin ajuste'}`);
  }
  if (con && sin) {
    console.log('\n  duration   con        sin        diferencia');
    const plazos = [
      ...dentro.map((i) => ({ et: i.ticker, x: i.dolarLinked!.durationModificada })),
      ...[0.25, 0.5, 1, 1.5, 2].map((x) => ({ et: `${x} años`, x })),
    ];
    for (const { et, x } of plazos) {
      const a = con.evaluar(x);
      const b = sin.evaluar(x);
      console.log(`  ${et.padEnd(9)}  ${pct(a).padStart(8)}   ${pct(b).padStart(8)}   ${((a - b) * 100).toFixed(2).padStart(6)} pp`);
    }
  }

  // Cierre de A3 contra A3500, veinte ruedas.
  const desde = toIsoDate(addDays(parseIsoDate(ins.rueda), -40));
  const [cierres, a3500] = await Promise.all([
    fetchCierresMayorista(desde, ins.rueda),
    fetchA3500(desde),
  ]);
  const fechas = [...cierres.keys()].filter((f) => a3500.valor(f) !== null).sort().slice(-20);
  console.log('\nCierre mayorista A3 contra A3500 (últimas 20 ruedas)');
  console.log('  rueda        A3 cierre   A3500       dif $    dif %');
  const difs: number[] = [];
  for (const f of fechas) {
    const c = cierres.get(f)!.cierre;
    const a = a3500.valor(f)!;
    difs.push(c - a);
    console.log(`  ${f}   ${num(c, 2).padStart(9)}   ${num(a, 4).padStart(10)}   ${(c - a).toFixed(2).padStart(6)}   ${(((c / a) - 1) * 100).toFixed(3).padStart(6)}%`);
  }
  const media = difs.reduce((s, d) => s + d, 0) / difs.length;
  const mediaAbs = difs.reduce((s, d) => s + Math.abs(d), 0) / difs.length;
  console.log(`  media ${media.toFixed(2)}   media absoluta ${mediaAbs.toFixed(2)}   rango ${Math.min(...difs).toFixed(2)} a ${Math.max(...difs).toFixed(2)}`);
  const sinA3 = a3500.fechas.filter((f) => f >= fechas[0] && !cierres.has(f));
  if (sinA3.length) console.log(`  con A3500 y sin cierre de A3: ${sinA3.join(', ')}`);

  if (r.warnings.length) console.log('\nwarnings\n  ' + r.warnings.join('\n  '));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
