import type { IsoDate } from '../conventions';

/**
 * El calendario bursátil que publica BYMA en su sitio: los días del año sin
 * rueda y los días con negociación pero sin liquidación.
 *
 * Hace falta porque esos días no salen de ninguna regla. El 6/11/2026 (Día
 * del Bancario) BYMA operó pero no liquidó, y las operaciones a 24 horas del
 * 5 y del 6 liquidaron el 11, porque el 9 y el 10 no hubo rueda por la
 * visita del Papa (Decreto 1103/26, publicado a fines de octubre). El
 * proyecto no sabía nada de eso: ni que el 9 y el 10 no había mercado ni
 * que la liquidación se corría. Leerlo de la fuente es la única forma de
 * enterarse a tiempo de un feriado decretado de un día para el otro.
 *
 * La página es una tabla (fecha, día, motivo) donde cada motivo termina en
 * una referencia, y abajo la lista de referencias. La que dice "con
 * negociación" es un día sin liquidación; todas las demás (feriados
 * nacionales, días sin negociación ni liquidación, fechas por decreto) son
 * días sin rueda. El año casi nunca está escrito en las filas: sale de la
 * única fila que lo trae o del nombre del calendario descargable.
 */

export const URL_CALENDARIO_BYMA = 'https://www.byma.com.ar/mercado/calendario-bursatil';

export interface CalendarioByma {
  anio: number;
  /** Sin negociación ni liquidación. */
  sinRueda: IsoDate[];
  /** Con negociación pero sin liquidación: la liquidación pasa al siguiente. */
  sinLiquidacion: IsoDate[];
}

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

const texto = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;|‍/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function parsearCalendarioByma(html: string): CalendarioByma {
  // Las referencias, en orden: la n-ésima es la (n).
  const lista = html.match(/Referencias[\s\S]*?<ol[^>]*>([\s\S]*?)<\/ol>/)?.[1];
  if (!lista) throw new Error('calendario de BYMA: no aparecen las referencias');
  const referencias = [...lista.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => texto(m[1]));
  if (referencias.length === 0) throw new Error('calendario de BYMA: referencias vacías');

  // Cada fila son tres celdas seguidas: fecha, día de la semana y motivo.
  const celdas = [...html.matchAll(/class="byma_table_cell"[^>]*>\s*<div[^>]*>([\s\S]*?)<\/div>/g)].map((m) => texto(m[1]));
  const filas: string[][] = [];
  for (let k = 0; k + 2 < celdas.length; k += 3) filas.push(celdas.slice(k, k + 3));
  // El encabezado (Fecha, Día, Motivo), si viene como celdas, no es una fecha.
  filas.splice(0, filas.length, ...filas.filter(([f]) => /^\d{1,2} de /i.test(f)));
  if (filas.length === 0) throw new Error('calendario de BYMA: la tabla vino vacía');

  const anios = filas.map(([f]) => f.match(/\b(20\d{2})\b/)?.[1]).filter(Boolean).map(Number);
  const anio = anios[0] ?? Number(html.match(/(20\d{2})_BYMA_Trading_Calendar/)?.[1]);
  if (!anio) throw new Error('calendario de BYMA: no se sabe de qué año es');
  if (anios.some((a) => a !== anio)) throw new Error(`calendario de BYMA: mezcla años (${[...new Set(anios)].join(', ')})`);

  const sinRueda: IsoDate[] = [];
  const sinLiquidacion: IsoDate[] = [];
  for (const [fecha, , motivo] of filas) {
    const m = fecha.toLowerCase().match(/^(\d{1,2}) de ([a-záéíóú]+)/);
    const mes = m && MESES[m[2]];
    if (!m || !mes) throw new Error(`calendario de BYMA: fecha ilegible "${fecha}"`);
    const iso = `${anio}-${String(mes).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    const ref = Number(motivo.match(/\((\d+)\)\s*$/)?.[1]);
    const nota = referencias[ref - 1];
    if (!nota) throw new Error(`calendario de BYMA: "${motivo}" sin referencia conocida`);
    (/con negociaci[oó]n/i.test(nota) ? sinLiquidacion : sinRueda).push(iso);
  }
  return { anio, sinRueda: [...new Set(sinRueda)].sort(), sinLiquidacion: [...new Set(sinLiquidacion)].sort() };
}

export async function fetchCalendarioByma(signal?: AbortSignal): Promise<CalendarioByma> {
  const res = await fetch(URL_CALENDARIO_BYMA, {
    headers: { 'User-Agent': 'monitor-mercado/1.0 (+https://github.com/LautaroToscano/monitor-mercado)' },
    signal: signal ?? AbortSignal.timeout(20_000),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`calendario de BYMA respondió ${res.status}`);
  return parsearCalendarioByma(await res.text());
}
