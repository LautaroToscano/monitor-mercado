/**
 * Reconstruye fotos de cierre de días pasados con la serie histórica de BYMA.
 *
 *   npm run historico:reconstruir -- --desde=2026-09-16 --hasta=2026-09-24
 *   npm run historico:reconstruir -- --desde=... --pisar   (reescribe las que ya hay)
 *
 * Usa el mismo cálculo que la pantalla, con los cierres de cada día. Los
 * cierres salen de las series resguardadas en `data/series/` (ver
 * `resguardar-series.ts`); sólo si un papel no tiene la suya se le pide a
 * BYMA. Los papeles ya vencidos están en la referencia gracias a
 * `reference/vencidos.json`; un día en que vivía uno que no está ahí (los
 * CER con cupón de 2024-2025) se arma sin él.
 *
 * Por defecto no pisa una foto existente: la guardada el mismo día por el
 * proceso de cierre es la que se vio en pantalla y manda sobre cualquier
 * reconstrucción.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUniverse } from '../src/lib/build';
import { addDays, isBusinessDay, parseIsoDate, toIsoDate } from '../src/lib/conventions';
import { fotoDesde, type IndiceHistorico } from '../src/lib/historico';
import { memo } from '../src/lib/cache';
import { DIAS_SERIE_COMPLETA, precargarSeries, type Cierre } from '../src/lib/sources/byma';
import { dolarLinked } from '../src/lib/universes/dolar-linked';
import { cronograma } from '../src/lib/universes/tasa-cer-condiciones';
import type { CerReference } from '../src/lib/types';
import { tasaCer } from '../src/lib/universes/tasa-cer';
import { tasaFija } from '../src/lib/universes/tasa-fija';

const UNIVERSOS = [tasaFija, tasaCer, dolarLinked];
const SERIES = join(dirname(fileURLToPath(import.meta.url)), '../data/series');
/** Lo que dura una reconstrucción larga, con margen. */
const TTL_SERIE_MS = 12 * 60 * 60_000;

/** Deja la serie guardada en el mismo cache que usan los cierres. */
/** Último cierre de cada serie guardada: hasta ahí llega el ajuste de BYMA. */
const ultimoCierre = new Map<string, string>();
/**
 * Primer cierre de cada serie. Un papel recién emitido puede tardar días en
 * operar (TZXM8, semanas): antes de su primer cierre no tenía precio, y eso
 * no es un hueco de la fuente sino un papel que todavía no cotizaba.
 */
const primerCierre = new Map<string, string>();

async function cargarGuardada(symbol: string): Promise<boolean> {
  const archivo = join(SERIES, `${symbol}.json`);
  if (!existsSync(archivo)) return false;
  const serie = JSON.parse(readFileSync(archivo, 'utf8')) as Cierre[];
  if (serie.length) {
    const primero = serie.find((b) => b.close > 0);
    if (primero) primerCierre.set(symbol, primero.date);
    ultimoCierre.set(symbol, serie[serie.length - 1].date);
  }
  await memo(`historia:${symbol}:${DIAS_SERIE_COMPLETA}`, TTL_SERIE_MS, async () => serie);
  return true;
}

const DIR = join(dirname(fileURLToPath(import.meta.url)), '../public/historico');
const INDICE = join(DIR, 'indice.json');
/**
 * Menos papeles que esto es una respuesta rota de la fuente. Dólar linked es
 * la excepción: a comienzos de 2025 la familia tenía cuatro papeles, y tres
 * alcanzan para el ajuste.
 */
const MINIMO_INSTRUMENTOS: Record<string, number> = { 'dolar-linked': 3 };
const MINIMO_POR_DEFECTO = 5;

/**
 * La serie histórica de BYMA viene ajustada por amortizaciones, como un
 * gráfico ajustado por dividendos: antes de cada cuota de capital, los
 * precios de un bono que amortiza aparecen rebajados. Medido con TX26 el
 * 14/04/2025: BYMA 451, A3 1.922 cada 100 de VN, que es lo que da su
 * capital ajustado. Los cero cupón y los que sólo pagan renta no se tocan.
 *
 * Un bono que amortizó entre el día que se rehace y el último cierre de su
 * serie tiene ese día un precio que no es el que se operó: sale de la foto.
 */
function ajustadoPorAmortizacion(ref: CerReference, fecha: string, ultimoCierre: string): boolean {
  if (ref.estructura !== 'con-cupon') return false;
  const plan = cronograma(ref, parseIsoDate(fecha));
  return (plan?.flujos ?? []).some((f) => f.amortizacion > 0 && f.fecha > fecha && f.fecha <= ultimoCierre);
}

const arg = (nombre: string) =>
  process.argv.find((a) => a.startsWith(`--${nombre}=`))?.split('=')[1];

async function main() {
  const desde = arg('desde');
  const hasta = arg('hasta');
  const pisar = process.argv.includes('--pisar');
  if (!desde || !hasta) throw new Error('Faltan --desde=AAAA-MM-DD y --hasta=AAAA-MM-DD');

  const indice: IndiceHistorico = existsSync(INDICE) ? JSON.parse(readFileSync(INDICE, 'utf8')) : {};

  // Todas las series primero: las guardadas en el repo, y las que falten de
  // BYMA, despacio y con reintentos. Después cada día se arma sin tocar la red.
  const papeles = UNIVERSOS.flatMap((u) =>
    [...u.reference.values()]
      .filter((r) => r.maturityDate > desde && r.issueDate <= hasta)
      .map((r) => r.symbol),
  );
  const faltan: string[] = [];
  for (const p of papeles) if (!(await cargarGuardada(p))) faltan.push(p);
  console.log(`${papeles.length - faltan.length} series del repo; ${faltan.length} a BYMA`);
  const fallidos = faltan.length ? await precargarSeries(faltan) : [];
  if (fallidos.length > 0) console.warn(`No se pudo bajar: ${fallidos.join(', ')}`);

  for (let d = parseIsoDate(desde); toIsoDate(d) <= hasta; d = addDays(d, 1)) {
    if (!isBusinessDay(d)) continue;
    const fecha = toIsoDate(d);

    for (const universo of UNIVERSOS) {
      const archivo = join(DIR, universo.slug, `${fecha}.json`);
      if (existsSync(archivo) && !pisar) {
        console.log(`${fecha} ${universo.slug}: ya estaba`);
        indice[universo.slug] = [...new Set([...(indice[universo.slug] ?? []), fecha])].sort();
        continue;
      }
      const armada = await buildUniverse(universo, new Date(), { cierreDe: fecha });
      const respuesta = {
        ...armada,
        instruments: armada.instruments.filter(
          (i) =>
            (primerCierre.get(i.ticker) ?? '') <= fecha &&
            !ajustadoPorAmortizacion(
              universo.reference.get(i.ticker) as CerReference,
              fecha,
              ultimoCierre.get(i.ticker) ?? hasta,
            ),
        ),
      };
      // Si ese día no hubo rueda, la serie devuelve la anterior: no se guarda
      // con una fecha que no es la suya.
      if (respuesta.tradeDate !== fecha) {
        console.log(`${fecha} ${universo.slug}: sin rueda (último cierre ${respuesta.tradeDate})`);
        continue;
      }
      // Un papel de la referencia que ese día vivía y no tiene cierre es un
      // hueco de la fuente, no un dato: la foto quedaría con una curva
      // distinta de la real. Mejor no guardarla y reintentar después.
      const sinCierre = respuesta.instruments.filter((i) => i.lastPrice === null).map((i) => i.ticker);
      if (sinCierre.length > 0) {
        console.warn(`${fecha} ${universo.slug}: sin cierre para ${sinCierre.join(', ')}; no se guarda`);
        continue;
      }
      const foto = fotoDesde(respuesta);
      if (foto.instrumentos.length < (MINIMO_INSTRUMENTOS[universo.slug] ?? MINIMO_POR_DEFECTO)) {
        console.warn(`${fecha} ${universo.slug}: sólo ${foto.instrumentos.length} con rendimiento, no se guarda`);
        continue;
      }
      mkdirSync(dirname(archivo), { recursive: true });
      writeFileSync(archivo, JSON.stringify(foto) + '\n');
      indice[universo.slug] = [...new Set([...(indice[universo.slug] ?? []), fecha])].sort();
      console.log(`${fecha} ${universo.slug}: ${foto.instrumentos.length} instrumentos`);
    }
  }

  writeFileSync(INDICE, JSON.stringify(indice, null, 1) + '\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
