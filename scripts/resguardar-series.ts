/**
 * Resguarda en el repo las series de cierre de BYMA de todos los papeles de
 * las tres curvas que vivieron en los últimos dos años, vencidos incluidos.
 *
 *   npm run historico:resguardar
 *   npm run historico:resguardar -- --desde=2024-10-09   (lista desde esa fecha)
 *
 * BYMA guarda dos años de cierres y borra uno por día: lo que no se baje a
 * tiempo se pierde. Las series de los papeles vencidos siguen estando (lo
 * que BYMA borra es la ficha), pero BYMA no tiene un listado de qué papeles
 * existieron. Ese listado sale del detalle diario de renta fija de A3, que
 * trae cada papel negociado ese día con su descripción.
 *
 * Dos pasos:
 *  1. `data/papeles.json`: cada papel candidato, con su descripción de A3 y
 *     la primera y última rueda en que se lo vio.
 *  2. `data/series/<papel>.json`: su serie diaria de BYMA. Se une con la
 *     que ya estaba guardada, así que lo resguardado no se pierde aunque
 *     BYMA lo borre después.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addDays, isBusinessDay, parseIsoDate, toIsoDate } from '../src/lib/conventions';
import { DIAS_SERIE_COMPLETA, fetchHistory, type Cierre } from '../src/lib/sources/byma';
import { CANDIDATE_SYMBOL as FIJA } from '../src/lib/universes/tasa-fija-spec';
import { CANDIDATE_SYMBOL as CER } from '../src/lib/universes/tasa-cer-spec';
import { CANDIDATE_SYMBOL as DL } from '../src/lib/universes/dolar-linked-spec';
import { universes } from '../src/lib/universes';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '../data');
const PAPELES = join(DIR, 'papeles.json');
const SERIES = join(DIR, 'series');

const DETALLE_A3 =
  'https://api.marketdata.mae.com.ar/api/mercado/titulo/historicorentafija/detalle?oTitulo=';
const USER_AGENT = 'monitor-mercado/1.0 (+https://github.com/LautaroToscano/monitor-mercado)';

/** Pausas: ni A3 ni BYMA publican su límite, y BYMA castiga el exceso. */
const PAUSA_A3_MS = 300;
const PAUSA_BYMA_MS = 400;

/**
 * A3 nombra a algunos bonos CER con cupón con una P al final (T2X5P) y BYMA
 * sin ella (T2X5). Se guarda con el nombre de BYMA, que es el de la serie.
 */
const CER_CUPON_A3 = /^(T[0-9]X[0-9])P$/;
const aBYMA = (t: string) => t.replace(CER_CUPON_A3, '$1');
const esCandidato = (t: string) =>
  FIJA.test(t) || CER.test(t) || DL.test(t) || CER_CUPON_A3.test(t);
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const arg = (nombre: string) =>
  process.argv.find((a) => a.startsWith(`--${nombre}=`))?.split('=')[1];

interface Papel {
  descripcion: string;
  desde: string;
  hasta: string;
}

async function detalleA3(fecha: string): Promise<{ ticker: string; descripcion: string }[]> {
  const oTitulo = encodeURIComponent(JSON.stringify({ fecha, skip: 0, take: 2000 }));
  for (let intento = 0; ; intento += 1) {
    try {
      const res = await fetch(DETALLE_A3 + oTitulo, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`A3 respondió ${res.status}`);
      const { data, total } = (await res.json()) as {
        data: { ticker: string; descripcion: string }[];
        total: number;
      };
      if (data.length < total) throw new Error(`A3 devolvió ${data.length} de ${total} filas`);
      return data;
    } catch (err) {
      if (intento >= 2) throw err;
      await esperar(1500 * (intento + 1));
    }
  }
}

async function listarPapeles(desde: string, hasta: string): Promise<Record<string, Papel>> {
  const papeles: Record<string, Papel> = existsSync(PAPELES)
    ? JSON.parse(readFileSync(PAPELES, 'utf8'))
    : {};
  let ruedas = 0;
  for (let d = parseIsoDate(desde); toIsoDate(d) <= hasta; d = addDays(d, 1)) {
    if (!isBusinessDay(d)) continue;
    const fecha = toIsoDate(d);
    let filas;
    try {
      filas = await detalleA3(fecha);
    } catch (err) {
      console.warn(`${fecha}: sin detalle de A3 (${(err as Error).message})`);
      continue;
    }
    for (const fila of filas) {
      if (!esCandidato(fila.ticker)) continue;
      const ticker = aBYMA(fila.ticker);
      const { descripcion } = fila;
      const p = papeles[ticker];
      if (!p) papeles[ticker] = { descripcion: descripcion.trim(), desde: fecha, hasta: fecha };
      else {
        if (fecha < p.desde) p.desde = fecha;
        if (fecha > p.hasta) p.hasta = fecha;
      }
    }
    ruedas += 1;
    if (ruedas % 50 === 0) console.log(`  ${fecha}: ${Object.keys(papeles).length} papeles`);
    await esperar(PAUSA_A3_MS);
  }
  return papeles;
}

/** Une dos series por fecha; ante la misma rueda manda la nueva. */
function unir(vieja: Cierre[], nueva: Cierre[]): Cierre[] {
  const porFecha = new Map(vieja.map((c) => [c.date, c]));
  for (const c of nueva) porFecha.set(c.date, c);
  return [...porFecha.values()].sort((a, b) => a.date.localeCompare(b.date));
}

async function main() {
  const hasta = toIsoDate(new Date());
  const desde = arg('desde') ?? toIsoDate(addDays(new Date(), -DIAS_SERIE_COMPLETA));
  mkdirSync(SERIES, { recursive: true });

  console.log(`1. Papeles negociados en A3 del ${desde} al ${hasta}`);
  const papeles = await listarPapeles(desde, hasta);
  // Los de la referencia también, por si alguno no operó en A3.
  for (const u of universes.values()) {
    for (const ref of u.reference.values()) {
      papeles[ref.symbol] ??= { descripcion: ref.name, desde: ref.issueDate, hasta: ref.maturityDate };
    }
  }
  const ordenados = Object.fromEntries(Object.entries(papeles).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(PAPELES, JSON.stringify(ordenados, null, 1) + '\n');
  console.log(`   ${Object.keys(ordenados).length} papeles en data/papeles.json`);

  console.log('2. Series de BYMA');
  const sinSerie: string[] = [];
  for (const ticker of Object.keys(ordenados)) {
    let serie: Cierre[] | null = null;
    for (let intento = 0; intento < 3 && serie === null; intento += 1) {
      try {
        serie = await fetchHistory(ticker, DIAS_SERIE_COMPLETA);
      } catch {
        await esperar(2000 * (intento + 1));
      }
    }
    await esperar(PAUSA_BYMA_MS);
    if (!serie || serie.length === 0) {
      sinSerie.push(ticker);
      continue;
    }
    const archivo = join(SERIES, `${ticker}.json`);
    const vieja: Cierre[] = existsSync(archivo) ? JSON.parse(readFileSync(archivo, 'utf8')) : [];
    const unida = unir(vieja, serie);
    writeFileSync(archivo, JSON.stringify(unida) + '\n');
    console.log(`   ${ticker.padEnd(6)} ${unida.length} ruedas, ${unida[0].date} a ${unida[unida.length - 1].date}`);
  }
  if (sinSerie.length) console.log(`   sin serie en BYMA: ${sinSerie.join(', ')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
