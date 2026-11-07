/**
 * Regenera la referencia estática de cada universo a partir de la ficha
 * técnica de BYMA. Es un script offline: la referencia es estática y no tiene
 * sentido pedirla en cada request.
 *
 *   npm run refresh:reference                        -> todos los universos
 *   npm run refresh:reference -- --universe=tasa-cer -> uno solo
 *
 * Descubre candidatos en los paneles, los clasifica con la ficha y separa los
 * miembros del resto. Los que no son miembros quedan listados con el motivo,
 * para que un ticker nuevo desconocido se distinga de uno ya evaluado y
 * descartado.
 *
 * Las reglas de clasificación son las mismas que usa el descubrimiento en
 * caliente (`ReglasDeDescubrimiento`): una sola fuente de verdad por universo.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isBusinessDay, marketToday, toIsoDate } from '../src/lib/conventions';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fetchFicha, fetchQuotes, type BymaFicha, type BymaPanel } from '../src/lib/sources/byma';
import type { ReglasDeDescubrimiento } from '../src/lib/universes/descubrimiento';
import type { InstrumentReference, ZeroCouponReference } from '../src/lib/types';
import * as fija from '../src/lib/universes/tasa-fija-spec';
import * as cer from '../src/lib/universes/tasa-cer-spec';
import * as dl from '../src/lib/universes/dolar-linked-spec';
import * as tm from '../src/lib/universes/tamar-spec';
import { reglasTasaFija } from '../src/lib/universes/tasa-fija-clasificador';
import { reglasTasaCer } from '../src/lib/universes/tasa-cer-clasificador';
import { reglasDolarLinked } from '../src/lib/universes/dolar-linked-clasificador';
import { reglasTamar } from '../src/lib/universes/tamar-clasificador';
import { EXCLUIDOS } from '../src/lib/universes/excluidos';
import { CONDICIONES_DOLAR_LINKED } from '../src/lib/universes/dolar-linked-condiciones';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '../src/lib/reference');

interface Spec<R extends InstrumentReference> {
  slug: string;
  panels: readonly BymaPanel[];
  candidato: RegExp;
  reglas: ReglasDeDescubrimiento<R>;
  /** Lo que se imprime de cada miembro para revisar la corrida a ojo. */
  describir(ref: R): string;
}

const SPECS: Spec<InstrumentReference>[] = [
  {
    slug: 'tasa-fija',
    panels: fija.TASA_FIJA_PANELS,
    candidato: fija.CANDIDATE_SYMBOL,
    reglas: reglasTasaFija as ReglasDeDescubrimiento<InstrumentReference>,
    describir: (r) => {
      const z = r as ZeroCouponReference;
      return `TEM emisión ${(z.issueTem * 100).toFixed(2)}%  (${z.temSource})`;
    },
  },
  {
    slug: 'tasa-cer',
    panels: cer.TASA_CER_PANELS,
    candidato: cer.CANDIDATE_SYMBOL,
    reglas: reglasTasaCer,
    describir: (r) => `emisión ${r.issueDate}  vence ${r.maturityDate}`,
  },
  {
    slug: 'dolar-linked',
    panels: dl.DOLAR_LINKED_PANELS,
    candidato: dl.CANDIDATE_SYMBOL,
    reglas: reglasDolarLinked as ReglasDeDescubrimiento<InstrumentReference>,
    describir: (r) => `${r.estructura}  emisión ${r.issueDate}  vence ${r.maturityDate}`,
  },
  {
    slug: 'tamar',
    panels: tm.TAMAR_PANELS,
    candidato: tm.CANDIDATE_SYMBOL,
    reglas: reglasTamar as ReglasDeDescubrimiento<InstrumentReference>,
    describir: (r) => `${r.estructura}  emisión ${r.issueDate}  vence ${r.maturityDate}`,
  },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Pausa entre pedidos de ficha.
 *
 * Este script recorre decenas de candidatos de a uno. Con pausas cortas es la
 * forma más rápida de ganarse un bloqueo por IP de BYMA, que no avisa: deja de
 * completar el handshake TCP y tarda horas en soltar. Un segundo por pedido
 * son un par de minutos en total y no molesta a nadie.
 */
const PAUSA_MS = 1_000;

/**
 * Las dos curvas comparten candidatos (un TZX calza en el patrón de tasa fija
 * y ahí se descarta por ser CER). Cada ficha se pide una sola vez por corrida.
 */
const fichas = new Map<string, BymaFicha | null>();
async function ficha(symbol: string): Promise<BymaFicha | null> {
  if (fichas.has(symbol)) return fichas.get(symbol)!;
  let f: BymaFicha | null = null;
  try {
    f = await fetchFicha(symbol);
  } catch (err) {
    console.warn(`  ${symbol}: error de ficha (${(err as Error).message})`);
  }
  await sleep(PAUSA_MS);
  fichas.set(symbol, f);
  return f;
}

const VENCIDOS = join(DIR, 'vencidos.json');

/**
 * Un papel que deja la referencia porque venció pasa a `vencidos.json`, que
 * es lo que permite rehacer las curvas de días pasados (BYMA borra la ficha
 * de un vencido). Antes se cargaba a mano y se olvidaba: S16O6, S30O6, TZXO6
 * y D30O6 vencieron en octubre de 2026 y las fotos rehechas de esos meses
 * salían sin ellos.
 */
function pasarAVencidos(slug: string, anteriores: Map<string, InstrumentReference>, miembros: InstrumentReference[]) {
  const hoy = toIsoDate(marketToday());
  const siguen = new Set(miembros.map((m) => m.symbol));
  const vencidos = JSON.parse(readFileSync(VENCIDOS, 'utf8')) as Record<string, (InstrumentReference & { origen?: unknown })[]>;
  const lista = vencidos[slug] ?? (vencidos[slug] = []);
  const ya = new Set(lista.map((r) => r.symbol));
  const nuevos = [...anteriores.values()].filter((r) => !siguen.has(r.symbol) && !ya.has(r.symbol) && r.maturityDate <= hoy);
  if (nuevos.length === 0) return;
  for (const r of nuevos) lista.push({ ...r, origen: origenDe(slug, r) });
  lista.sort((a, b) => a.symbol.localeCompare(b.symbol));
  writeFileSync(VENCIDOS, JSON.stringify(vencidos, null, 1) + '\n');
  console.log(`  pasan a vencidos: ${nuevos.map((r) => r.symbol).join(', ')}`);
}

/** De dónde salieron sus condiciones: la referencia que tenía antes de vencer. */
function origenDe(slug: string, r: InstrumentReference) {
  const desdeReferencia = 'referencia del proyecto antes de vencer (ficha de BYMA)';
  const dl = slug === 'dolar-linked' ? CONDICIONES_DOLAR_LINKED[r.symbol] : undefined;
  if (dl) {
    return { norma: dl.norma, fuente: dl.fuente, fechaEmision: desdeReferencia, reglaPago: dl.reglaPago, licitacion: dl.licitacion };
  }
  return { norma: null, fuente: null, fechaEmision: desdeReferencia };
}

/** Los miembros del archivo actual, por símbolo. */
function referenciasAnteriores(archivo: string): Map<string, InstrumentReference> {
  if (!existsSync(archivo)) return new Map();
  const { instruments = [] } = JSON.parse(readFileSync(archivo, 'utf8')) as { instruments?: InstrumentReference[] };
  return new Map(instruments.map((r) => [r.symbol, r]));
}

async function refrescar(spec: Spec<InstrumentReference>) {
  const quotes = await fetchQuotes(spec.panels);
  // Los excluidos a mano no se miran: ni ficha, ni lista de sin resolver.
  const candidatos = [...quotes.keys()].filter((s) => spec.candidato.test(s) && !EXCLUIDOS.has(s)).sort();
  console.log(`\n[${spec.slug}] ${candidatos.length} candidatos en ${spec.panels.join(', ')}`);
  // Un panel sin candidatos no es que el universo se vació: BYMA no tiene
  // rueda (un feriado) o no contestó bien. Se conserva la referencia que
  // había; escribirla vacía sólo hacía fallar el control posterior.
  if (candidatos.length === 0) {
    console.log('  panel vacío: se conserva la referencia anterior');
    return;
  }

  const archivo = join(DIR, `${spec.slug}.json`);
  const anteriores = referenciasAnteriores(archivo);
  const members: InstrumentReference[] = [];
  const nonMembers: { symbol: string; name: string; reason: string }[] = [];
  const unresolved: string[] = [];

  for (const symbol of candidatos) {
    const f = await ficha(symbol);
    const anterior = anteriores.get(symbol);
    if (!f) {
      if (anterior) {
        console.warn(`  ${symbol}: sin ficha; se conserva la referencia anterior`);
        members.push(anterior);
      } else unresolved.push(symbol);
      continue;
    }
    const { esMiembro, motivo } = spec.reglas.clasificar(f);
    if (!esMiembro) {
      nonMembers.push({ symbol, name: f.denominacion, reason: motivo });
      continue;
    }
    const referencia = await spec.reglas.resolver(f);
    if (!referencia) {
      // Las condiciones de emisión no cambian: si una corrida anterior las
      // resolvió, siguen valiendo. S29E7 tenía su TEM de la licitación; el
      // 29/10/2026 la licitación salió de la ventana de novedades de
      // Finanzas, el refresco la borró y quedó un aviso de mantenimiento
      // abierto durante días.
      if (anterior) {
        console.warn(`  ${symbol}: ${spec.reglas.motivoSinResolver}; se conserva la referencia anterior`);
        members.push(anterior);
      } else {
        console.warn(`  ${symbol}: ${spec.reglas.motivoSinResolver}`);
        unresolved.push(symbol);
      }
      continue;
    }
    members.push(referencia);
    console.log(`  ✓ ${symbol}  ${spec.describir(referencia)}`);
  }

  const out = {
    generatedAt: new Date().toISOString(),
    source: 'BYMA ficha técnica (bnown/fichatecnica/especies/general)',
    instruments: members,
    nonMembers,
    unresolved,
  };
  writeFileSync(archivo, JSON.stringify(out, null, 2) + '\n');
  pasarAVencidos(spec.slug, anteriores, members);
  console.log(`${members.length} instrumentos, ${nonMembers.length} descartados, ${unresolved.length} sin resolver`);
  console.log(`escrito en ${archivo}`);
}

async function main() {
  // Sin rueda, BYMA devuelve los paneles vacíos: no hay nada que refrescar.
  if (!isBusinessDay(marketToday())) {
    console.log('Hoy no hay rueda: no se refresca la referencia.');
    return;
  }
  const pedido = process.argv.find((a) => a.startsWith('--universe='))?.split('=')[1];
  const specs = pedido ? SPECS.filter((s) => s.slug === pedido) : SPECS;
  if (specs.length === 0) throw new Error(`Universo desconocido: ${pedido}`);
  for (const spec of specs) await refrescar(spec);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
