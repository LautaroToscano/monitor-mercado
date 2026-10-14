/**
 * Validación de la curva TAMAR, sin levantar Next.
 *
 *   npm run validate:tamar
 *
 * Imprime la TAMAR que se proyecta, la tabla con las condiciones de cada
 * papel (margen, TAMAR promedio, pago proyectado, valor técnico, paridad,
 * TIR, duration y la norma) y la parábola de la curva con lo que se aparta
 * cada papel.
 */
import { regresionCuadratica } from '../src/lib/ajuste';
import { buildUniverse } from '../src/lib/build';
import type { InstrumentRow } from '../src/lib/types';
import { tamar } from '../src/lib/universes/tamar';

const pct = (v: number | null | undefined, d = 2) =>
  v === null || v === undefined ? '—' : `${(v * 100).toFixed(d)}%`;
const num = (v: number | null | undefined, d = 2) =>
  v === null || v === undefined ? '—' : v.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });

const entraAlAjuste = (i: InstrumentRow) =>
  i.quality.level === 'ok' && i.tea !== null && !i.fueraDelAjuste;

async function main() {
  const r = await buildUniverse(tamar, new Date(), 'vivo');
  const vigente = r.instruments.find((i) => i.tamar)?.tamar?.tamarVigente;

  console.log(`\nTAMAR  rueda ${r.tradeDate}  liquidación ${r.settlementDate}  sesión ${r.session}`);
  console.log(`  TAMAR proyectada ${vigente ? `${pct(vigente.valor, 4)} TNA del ${vigente.fecha} (${vigente.fuente})` : '—'}`);

  console.log('\nTabla');
  console.log(
    [
      'ticker'.padEnd(6), 'vence'.padEnd(10), 'días'.padStart(4), 'precio'.padStart(10),
      'VT'.padStart(10), 'paridad'.padStart(8), 'margen'.padStart(6), 'TAMAR prom.'.padStart(11),
      'háb. pub+proy'.padStart(13), 'pago proy.'.padStart(11), 'TIR'.padStart(7), 'TEM'.padStart(6),
      'dur.'.padStart(5), 'ajuste', 'norma · margen',
    ].join('  '),
  );
  for (const i of r.instruments) {
    const t = i.tamar;
    console.log(
      [
        i.ticker.padEnd(6),
        i.maturityDate,
        String(i.daysToMaturity).padStart(4),
        num(i.lastPrice).padStart(10),
        num(t?.valorTecnico).padStart(10),
        pct(t?.paridad).padStart(8),
        pct(t?.margen).padStart(6),
        pct(t?.tamarPromedio, 3).padStart(11),
        (t ? `${t.habilesPublicados}+${t.habilesProyectados}` : '—').padStart(13),
        num(t?.pagoProyectado).padStart(11),
        pct(i.tea).padStart(7),
        pct(i.tem).padStart(6),
        num(i.durationDays === null ? null : i.durationDays / 365).padStart(5),
        (entraAlAjuste(i) ? 'sí' : i.fueraDelAjuste ? 'aparte' : 'no').padEnd(6),
        t ? `${t.norma} · ${t.fuenteMargen.replace(/ \(http.*\)$/, '')}` : '—',
      ].join('  '),
    );
  }

  const puntos = r.instruments.filter(entraAlAjuste);
  const aj = regresionCuadratica(puntos.map((i) => ({ dias: i.durationDays! / 365, valor: i.tea! })));
  console.log('\nParábola contra la duration de Macaulay (años)');
  if (!aj) console.log('  menos de cuatro papeles: no se ajusta');
  else {
    console.log(`  TIR = ${aj.a.toFixed(4)} + ${aj.b.toFixed(4)}·x + ${aj.c.toFixed(4)}·x²   R² ${aj.r2.toFixed(3)}   n ${aj.n}   de ${num(aj.desde)} a ${num(aj.hasta)} años`);
    for (const i of r.instruments.filter((i) => i.tea !== null)) {
      const x = i.durationDays! / 365;
      console.log(`  ${i.ticker.padEnd(6)} ${pct(i.tea).padStart(7)}  curva ${pct(aj.evaluar(x)).padStart(7)}  ${((i.tea! - aj.evaluar(x)) * 100).toFixed(2).padStart(6)} pp${entraAlAjuste(i) ? '' : '  (aparte)'}`);
    }
  }

  if (r.warnings.length) console.log(`\nAvisos\n  ${r.warnings.join('\n  ')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
