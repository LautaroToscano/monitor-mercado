/**
 * Vigilante de producción: revisa el sitio publicado como lo vería un
 * visitante y falla si algo no está bien.
 *
 *   npm run vigilar                       -> contra producción
 *   npm run vigilar -- --base=http://localhost:3210
 *
 * Lo corre GitHub Actions cada media hora (`.github/workflows/vigilar.yml`).
 * Si falla, GitHub manda un mail: es la forma de enterarse de un problema
 * antes que quien mira la página.
 *
 * Qué controla:
 *  - cada curva responde, con todos sus papeles con precio y rendimiento, y
 *    las tasas en un rango posible;
 *  - los precios son de la rueda que corresponde (en rueda, la de hoy; con
 *    el mercado cerrado, a lo sumo un hábil de atraso, que es lo que tarda
 *    BYMA en cargar el cierre en la serie histórica);
 *  - las páginas cargan;
 *  - el breakeven responde con meses;
 *  - la foto diaria se guardó (después del mediodía, la de la última rueda).
 *
 * Aparte, el mantenimiento: lo que no rompe nada hoy pero pide una mano
 * (un título nuevo que no se pudo incorporar o al que le faltan sus
 * condiciones, la TAMAR que dejó de publicarse, los feriados del año que
 * viene). Esos avisos viven en `warnings` de cada endpoint, donde nadie los
 * lee; el vigilante los junta en su propia sección, que abre otro issue.
 *
 * Una respuesta de respaldo (ver `src/lib/respaldo.ts`) no es una falla de
 * la página —se ve completa—, pero dice que una fuente anduvo mal: se
 * informa sin fallar. Cada control se reintenta una vez antes de fallar,
 * para no avisar por un pestañeo de la fuente.
 */
import { appendFileSync } from 'node:fs';
import {
  isWithinTradingHours,
  MARKET_HOLIDAYS,
  marketToday,
  momentoVisible,
  restarDiasHabiles,
  parseIsoDate,
  toIsoDate,
  ultimaRuedaTerminada,
  MARKET_TIMEZONE,
} from '../src/lib/conventions';
import { AVISO_RESPALDO } from '../src/lib/respaldo';
import {
  ajustarCurva,
  datoQueNoCierra,
  elegirParaElAjuste,
  entraALaCurvaPorDefecto,
  minimoDePuntos,
} from '../src/lib/ajuste';
import type { UniverseResponse } from '../src/lib/types';

const BASE =
  process.argv.find((a) => a.startsWith('--base='))?.split('=')[1] ??
  'https://monitor-mercado-4net.vercel.app';
const TIMEOUT_MS = 60_000;
const ESPERA_REINTENTO_MS = 45_000;

/** Fuera de esto una TIR no es mercado, es una cuenta rota (NaN, signo, escala). */
const TIR_POSIBLE = { min: -0.9, max: 5 };
const MINIMO_PAPELES = 5;

/**
 * Avisos de los endpoints que piden una acción. Los demás son de la fuente
 * (una caída pasajera) y ya los cubre el respaldo, o son conocidos y
 * permanentes (los títulos que promedian TAMAR después del último año con
 * feriados cargados: eso lo controla `feriados()`).
 */
const PIDEN_ACCION = [
  /^Especies nuevas incorporadas automáticamente/,
  /^No se pudo incorporar /,
  /sin condiciones verificadas/,
  /^La última TAMAR publicada/,
];

const fallas: string[] = [];
const mantenimiento = new Set<string>();
const avisos: string[] = [];
const ok: string[] = [];

async function pedir(ruta: string): Promise<Response> {
  // Lo mismo que pide un visitante, con el cache del CDN incluido: la API no
  // acepta parámetros (ver `src/lib/api.ts`). Una respuesta degradada se
  // retiene sólo 15 segundos, así que una falla se ve igual.
  return fetch(`${BASE}${ruta}`, {
    headers: { 'User-Agent': 'monitor-mercado-vigilante/1.0' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  });
}

async function json<T>(ruta: string): Promise<T> {
  const res = await pedir(ruta);
  if (!res.ok) throw new Error(`${ruta} respondió ${res.status}`);
  return (await res.json()) as T;
}

/** Corre un control; si falla, espera y lo repite una vez antes de darlo por fallado. */
async function control(nombre: string, fn: () => Promise<string>) {
  for (let intento = 0; ; intento += 1) {
    try {
      ok.push(`${nombre}: ${await fn()}`);
      return;
    } catch (err) {
      if (intento >= 1) {
        fallas.push(`${nombre}: ${(err as Error).message}`);
        return;
      }
      await new Promise((r) => setTimeout(r, ESPERA_REINTENTO_MS));
    }
  }
}

const ahora = new Date();
const enRueda = isWithinTradingHours(momentoVisible(ahora));
const hoy = toIsoDate(marketToday(momentoVisible(ahora)));
const ultima = ultimaRuedaTerminada(ahora);
const minimaAceptable = toIsoDate(restarDiasHabiles(parseIsoDate(ultima), 1));
const horaPlaza = Number(
  new Intl.DateTimeFormat('en-US', { timeZone: MARKET_TIMEZONE, hour: '2-digit', hour12: false }).format(ahora),
);

function revisarCurva(u: UniverseResponse): string {
  const n = u.instruments.length;
  if (n < MINIMO_PAPELES) throw new Error(`sólo ${n} papeles`);
  const sinPrecio = u.instruments.filter((i) => i.lastPrice === null).map((i) => i.ticker);
  const sinTir = u.instruments.filter((i) => i.tea === null).map((i) => i.ticker);
  if (sinPrecio.length) throw new Error(`sin precio: ${sinPrecio.join(', ')}`);
  if (sinTir.length) throw new Error(`sin rendimiento: ${sinTir.join(', ')}`);
  const raras = u.instruments.filter(
    (i) => !Number.isFinite(i.tea) || i.tea! < TIR_POSIBLE.min || i.tea! > TIR_POSIBLE.max,
  );
  if (raras.length) {
    throw new Error(`TIR imposible: ${raras.map((i) => `${i.ticker} ${((i.tea ?? NaN) * 100).toFixed(1)}%`).join(', ')}`);
  }
  if (enRueda && u.session === 'intradiaria' && u.tradeDate !== hoy) {
    throw new Error(`en rueda pero los precios son del ${u.tradeDate}`);
  }
  if (u.tradeDate < minimaAceptable) {
    throw new Error(`precios del ${u.tradeDate}; la última rueda es del ${ultima}`);
  }
  const respaldo = u.warnings.find((w) => w.startsWith(AVISO_RESPALDO));
  if (respaldo) avisos.push(`${u.universe}: ${respaldo}`);
  recogerMantenimiento(u.universe, u.warnings);
  // Que la curva se pueda dibujar, con la misma regla que la pantalla. El
  // 16/10/2026 los 9 dólar linked tenían TIR y aun así no había curva: los
  // de poco volumen quedaban afuera y no alcanzaba para la parábola.
  const candidatos = u.instruments.filter((i) => i.tea !== null && entraALaCurvaPorDefecto(i, u.vista));
  const puntos = elegirParaElAjuste(candidatos, datoQueNoCierra, u.vista);
  const eje = (i: (typeof puntos)[number]) =>
    u.vista.ejeX === 'vencimiento'
      ? i.daysToMaturity
      : u.vista.ejeX === 'duration-modificada'
        ? (i.dolarLinked?.durationModificada ?? i.daysToMaturity / 365)
        : (i.durationDays ?? i.daysToMaturity) / 365;
  const curva = ajustarCurva(puntos.map((i) => ({ dias: eje(i), valor: i.tea! })), u.vista.modeloCurva);
  if (!curva) {
    const motivo = `la curva no se dibuja: ${puntos.length} papeles para el ajuste, hacen falta ${minimoDePuntos(u.vista.modeloCurva)}`;
    // En la primera hora de rueda es normal que varios no hayan operado
    // todavía: se informa sin abrir una caída.
    if (enRueda && horaPlaza < 12) avisos.push(`${u.universe}: ${motivo} (primera hora de rueda)`);
    else throw new Error(motivo);
  }
  return `${n} papeles, ${puntos.length} en el ajuste, rueda ${u.tradeDate} (${u.session})`;
}

function recogerMantenimiento(origen: string, warnings: readonly string[] = []) {
  for (const w of warnings) if (PIDEN_ACCION.some((r) => r.test(w))) mantenimiento.add(`${origen}: ${w}`);
}

/** Desde octubre, los feriados del año que viene tienen que estar cargados. */
function feriados() {
  const anio = Number(hoy.slice(0, 4));
  const ultimo = Number(MARKET_HOLIDAYS[MARKET_HOLIDAYS.length - 1].slice(0, 4));
  const mes = Number(hoy.slice(5, 7));
  const hacenFalta = mes >= 10 ? anio + 1 : anio;
  if (ultimo < hacenFalta) {
    mantenimiento.add(
      `feriados: están cargados hasta ${ultimo}; falta ${hacenFalta} (MARKET_HOLIDAYS en src/lib/conventions.ts).`,
    );
  }
}

async function main() {
  console.log(`Vigilando ${BASE} · ${ahora.toISOString()} · ${enRueda ? 'en rueda' : 'mercado cerrado'} · última rueda ${ultima}`);

  type Catalogo = { universes: { slug: string; label: string }[] };
  const { universes } = await json<Catalogo>('/api/universe').catch((err): Catalogo => {
    fallas.push(`catálogo de curvas: ${(err as Error).message}`);
    return { universes: [] };
  });
  if (universes.length === 0) fallas.push('catálogo de curvas: vino vacío');

  for (const { slug, label } of universes) {
    await control(`curva ${slug}`, async () => revisarCurva(await json<UniverseResponse>(`/api/universe/${slug}`)));
    await control(`página ${slug}`, async () => {
      const res = await pedir(`/${slug}`);
      if (!res.ok) throw new Error(`respondió ${res.status}`);
      const html = await res.text();
      if (!html.includes(label)) throw new Error(`no aparece "${label}" en la página`);
      // La página llega con el último cierre ya dibujado (lib/foto-inicial.ts).
      // Si llega con el cartel de carga, la foto guardada es vieja o falta: la
      // página anda igual, pero la foto diaria se quedó atrás.
      const sinScripts = html.replace(/<script[\s\S]*?<\/script>/g, '');
      if (sinScripts.includes('Trayendo la rueda')) {
        avisos.push(`página ${slug}: llega sin datos (con el cartel de carga); la foto del último cierre es vieja o falta`);
        return 'carga, sin datos en el HTML';
      }
      const rueda = sinScripts.match(/Rueda<\/span><span[^>]*>(\d{2}\/\d{2}\/\d{2})/)?.[1];
      return `carga, con datos en el HTML${rueda ? ` (rueda ${rueda})` : ''}`;
    });
  }

  await control('breakeven', async () => {
    const be = await json<{ tradeDate: string; meses: unknown[]; warnings: string[] }>('/api/breakeven');
    if (!be.meses?.length) throw new Error('sin meses');
    if (be.tradeDate < minimaAceptable) throw new Error(`es del ${be.tradeDate}; la última rueda es del ${ultima}`);
    const respaldo = be.warnings.find((w) => w.startsWith(AVISO_RESPALDO));
    if (respaldo) avisos.push(`breakeven: ${respaldo}`);
    recogerMantenimiento('breakeven', be.warnings);
    return `${be.meses.length} meses, rueda ${be.tradeDate}`;
  });

  await control('fotos diarias', async () => {
    const indice = await json<Record<string, string[]>>('/historico/indice.json');
    // La foto de la noche puede demorarse; la corrida de las 07:00 la
    // levanta. Desde el mediodía del día siguiente, la de la última rueda
    // tiene que estar.
    const exigida = hoy > ultima && horaPlaza >= 12 ? ultima : minimaAceptable;
    const atrasadas = universes
      .map(({ slug }) => [slug, indice[slug]?.at(-1) ?? 'ninguna'] as const)
      .filter(([, f]) => f < exigida);
    if (atrasadas.length) {
      throw new Error(`falta la foto del ${exigida}: ${atrasadas.map(([s, f]) => `${s} (última ${f})`).join(', ')}`);
    }
    return `al día (${exigida})`;
  });

  // La devaluación no tiene pantalla: no se vigila que responda, sólo sus
  // avisos (un dólar linked nuevo sin sus condiciones aparece ahí).
  await json<{ warnings?: string[] }>('/api/devaluacion')
    .then((d) => recogerMantenimiento('devaluación', d.warnings))
    .catch(() => undefined);
  feriados();

  const informe = [
    fallas.length ? `## ✗ ${fallas.length} control(es) fallaron` : '## ✓ Todo en orden',
    ...fallas.map((f) => `- ✗ ${f}`),
    ...avisos.map((a) => `- ⚠ ${a}`),
    ...ok.map((o) => `- ✓ ${o}`),
    '',
    mantenimiento.size ? '## 🔧 Mantenimiento pendiente' : '## Sin mantenimiento pendiente',
    ...[...mantenimiento].map((m) => `- 🔧 ${m}`),
  ].join('\n');
  console.log(informe);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, informe + '\n');
  if (fallas.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
