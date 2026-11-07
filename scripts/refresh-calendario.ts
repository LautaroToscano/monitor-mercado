/**
 * Trae el calendario bursátil de BYMA y lo guarda en
 * src/lib/reference/calendario.json, que leen las convenciones
 * (`src/lib/conventions.ts`).
 *
 *   npm run refresh:calendario
 *
 * Lo corre GitHub Actions antes de guardar la foto de cada día
 * (`guardar-cierre.yml`): un feriado decretado de un día para el otro —el 9 y
 * el 10/11/2026, por la visita del Papa— entra solo, sin que nadie toque el
 * código. Lo de los años que ya no están en la página se conserva; lo del
 * año que la página muestra se reemplaza entero, por si BYMA saca una fecha.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchCalendarioByma, URL_CALENDARIO_BYMA } from '../src/lib/sources/byma-calendario';

const ARCHIVO = join(dirname(fileURLToPath(import.meta.url)), '../src/lib/reference/calendario.json');

/** Un año con menos feriados que esto es una página que cambió de forma, no un año tranquilo. */
const MINIMO_SIN_RUEDA = 10;

interface Archivo {
  generatedAt: string;
  source: string;
  sinRueda: string[];
  sinLiquidacion: string[];
}

async function main() {
  const cal = await fetchCalendarioByma();
  const finDeSemana = [...cal.sinRueda, ...cal.sinLiquidacion].filter((f) => [0, 6].includes(new Date(`${f}T12:00:00Z`).getUTCDay()));
  if (finDeSemana.length) throw new Error(`fechas en fin de semana, la página se leyó mal: ${finDeSemana.join(', ')}`);
  if (cal.sinRueda.length < MINIMO_SIN_RUEDA) {
    throw new Error(`sólo ${cal.sinRueda.length} días sin rueda en ${cal.anio}; no se guarda`);
  }

  const previo: Archivo = existsSync(ARCHIVO)
    ? JSON.parse(readFileSync(ARCHIVO, 'utf8'))
    : { generatedAt: '', source: '', sinRueda: [], sinLiquidacion: [] };
  const deOtroAnio = (f: string) => !f.startsWith(`${cal.anio}-`);
  const out: Archivo = {
    generatedAt: new Date().toISOString(),
    source: URL_CALENDARIO_BYMA,
    sinRueda: [...previo.sinRueda.filter(deOtroAnio), ...cal.sinRueda].sort(),
    sinLiquidacion: [...previo.sinLiquidacion.filter(deOtroAnio), ...cal.sinLiquidacion].sort(),
  };
  writeFileSync(ARCHIVO, JSON.stringify(out, null, 1) + '\n');
  console.log(`${cal.anio}: ${cal.sinRueda.length} sin rueda, ${cal.sinLiquidacion.length} sin liquidación (${cal.sinLiquidacion.join(', ')})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
