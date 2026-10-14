/**
 * Guarda la foto de cierre de cada curva en public/historico/.
 *
 *   npm run historico:guardar
 *
 * Toma los cierres de la última rueda terminada —con el mercado abierto, la
 * de ayer—. Una foto ya guardada no se pisa, así que correrlo dos veces, o un
 * feriado, no cambia nada; si BYMA todavía no tiene esa rueda, la curva queda
 * para la corrida siguiente. Lo corre GitHub Actions a la noche y a la mañana
 * siguiente (ver .github/workflows/guardar-cierre.yml).
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AVISO_SIN_CIERRE, buildBreakeven } from '../src/lib/breakeven';
import { buildUniverse } from '../src/lib/build';
import { fotoDesde, type IndiceHistorico } from '../src/lib/historico';
import type { UniverseResponse } from '../src/lib/types';
import { CARPETA_ULTIMO_CIERRE } from '../src/lib/ultimo-cierre';
import { ultimaRuedaTerminada } from '../src/lib/conventions';
import { tasaCer } from '../src/lib/universes/tasa-cer';
import { tasaFija } from '../src/lib/universes/tasa-fija';
import { dolarLinked } from '../src/lib/universes/dolar-linked';
import { tamar } from '../src/lib/universes/tamar';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '../public/historico');
const INDICE = join(DIR, 'indice.json');

/**
 * Menos de esto no es una curva: es una respuesta rota de la fuente. No se
 * guarda, para no dejar en la historia un día que después nadie puede
 * distinguir de uno real.
 */
const MINIMO_INSTRUMENTOS = 5;

async function main() {
  const indice: IndiceHistorico = existsSync(INDICE)
    ? JSON.parse(readFileSync(INDICE, 'utf8'))
    : {};

  // Una después de la otra: fuera del panel, los cierres son un pedido por
  // papel y juntas duplicarían los pedidos simultáneos a BYMA.
  const esperada = ultimaRuedaTerminada(new Date());
  const errores: string[] = [];
  for (const universo of [tasaFija, tasaCer, dolarLinked, tamar]) {
    const respuesta = await buildUniverse(universo, new Date(), 'cierre');
    const foto = fotoDesde(respuesta);
    // De noche BYMA rota el panel a la sesión siguiente, y si lo agarra a
    // medias los precios salen de la serie histórica, que puede no tener
    // todavía la rueda del día. Eso no es un error: la corrida de la mañana
    // la levanta. Guardar el cierre anterior con la fecha vieja no suma nada.
    if (respuesta.tradeDate !== esperada) {
      console.log(`${universo.slug}: BYMA todavía no tiene el cierre del ${esperada} (da ${respuesta.tradeDate}); queda para la próxima corrida`);
      continue;
    }
    if (foto.instrumentos.length < MINIMO_INSTRUMENTOS) {
      // Una curva rota no frena a las otras; el job igual termina en falla.
      errores.push(
        `${universo.slug}: sólo ${foto.instrumentos.length} instrumentos con rendimiento el ${foto.tradeDate}; no se guarda.`,
      );
      continue;
    }

    const carpeta = join(DIR, universo.slug);
    const archivo = join(carpeta, `${foto.tradeDate}.json`);
    // La foto ya guardada de esa rueda no se pisa: la primera sale del panel
    // de la rueda (con volumen y operaciones), y una corrida posterior desde
    // la serie la reemplazaría con otras marcas de calidad.
    if (existsSync(archivo)) {
      console.log(`${universo.slug}: ${foto.tradeDate} ya estaba guardada`);
    } else {
      mkdirSync(carpeta, { recursive: true });
      writeFileSync(archivo, JSON.stringify(foto) + '\n');
    }
    guardarUltimoCierre(respuesta);

    const fechas = new Set(indice[universo.slug] ?? []);
    fechas.add(foto.tradeDate);
    indice[universo.slug] = [...fechas].sort();
    console.log(`${universo.slug}: ${foto.tradeDate}, ${foto.instrumentos.length} instrumentos`);
  }

  await guardarBreakeven(indice);
  writeFileSync(INDICE, JSON.stringify(indice, null, 1) + '\n');
  if (errores.length > 0) throw new Error(errores.join('\n'));
}

/**
 * La respuesta completa del endpoint para este cierre, la que sirve con el
 * mercado cerrado (ver `src/lib/ultimo-cierre.ts`). Se pisa la de la rueda
 * anterior: no es historia, es la última. No se reescribe la misma rueda —un
 * feriado sólo cambiaría la hora de cálculo— ni se guarda si a algún cero
 * cupón le faltó el precio.
 */
function guardarUltimoCierre(respuesta: UniverseResponse) {
  const archivo = join(DIR, CARPETA_ULTIMO_CIERRE, `${respuesta.universe}.json`);
  if (existsSync(archivo)) {
    const previa = JSON.parse(readFileSync(archivo, 'utf8')) as UniverseResponse;
    if (previa.tradeDate === respuesta.tradeDate) return;
  }
  const sinPrecio = respuesta.instruments.filter(
    (i) => i.estructura === 'cero-cupon' && i.lastPrice === null,
  );
  if (sinPrecio.length > 0) {
    console.log(
      `${respuesta.universe}: último cierre sin guardar, faltan ${sinPrecio.map((i) => i.ticker).join(', ')}`,
    );
    return;
  }
  mkdirSync(dirname(archivo), { recursive: true });
  writeFileSync(archivo, JSON.stringify(respuesta) + '\n');
  console.log(`${respuesta.universe}: último cierre ${respuesta.tradeDate}`);
}

/**
 * El breakeven de la misma rueda, ya calculado: el endpoint lo sirve de acá
 * en vez de calcularlo en cada visita, y de paso queda su historia.
 *
 * Se escribe una sola vez por rueda —un feriado no lo reescribe con otra
 * hora de cálculo— y nunca incompleto: si a una curva le faltó un papel, no
 * se guarda y el endpoint lo sigue calculando en vivo. Un fallo acá no frena
 * las fotos, que son lo que no se puede recuperar.
 */
async function guardarBreakeven(indice: IndiceHistorico) {
  try {
    const be = await buildBreakeven(new Date());
    const carpeta = join(DIR, 'breakeven');
    const archivo = join(carpeta, `${be.tradeDate}.json`);
    if (existsSync(archivo)) {
      console.log(`breakeven: ${be.tradeDate} ya estaba guardado`);
      return;
    }
    const fotos = indice['tasa-cer'] ?? [];
    if (fotos[fotos.length - 1] !== be.tradeDate) {
      console.log(`breakeven: la rueda ${be.tradeDate} no es la de las fotos; no se guarda`);
      return;
    }
    if (be.warnings.some((w) => w.startsWith(AVISO_SIN_CIERRE))) {
      console.log(`breakeven: incompleto el ${be.tradeDate}; no se guarda`);
      return;
    }
    mkdirSync(carpeta, { recursive: true });
    writeFileSync(archivo, JSON.stringify(be) + '\n');
    const fechas = new Set(indice.breakeven ?? []);
    fechas.add(be.tradeDate);
    indice.breakeven = [...fechas].sort();
    console.log(`breakeven: ${be.tradeDate}, ${be.meses.length} meses`);
  } catch (err) {
    console.error(`breakeven: no se pudo guardar (${(err as Error).message})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
