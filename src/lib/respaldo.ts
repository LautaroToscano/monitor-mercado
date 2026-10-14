import { addDays, parseIsoDate, toIsoDate } from './conventions';
import type { UniverseResponse } from './types';

/**
 * Respaldo de cada curva: que una respuesta incompleta nunca llegue a la
 * pantalla.
 *
 * Las fuentes fallan de formas que ningún control previo anticipa: el
 * 14/10/2026 a las 20:17 BYMA devolvió el panel a medias mientras rotaba de
 * sesión, y la curva TAMAR salió con un solo papel. Cada arreglo puntual
 * tapa un caso; esto cubre la clase entera.
 *
 * La regla: si en la respuesta recién calculada hay papeles sin rendimiento
 * que la última respuesta completa sí tenía, se sirve esa última completa,
 * con su propia rueda y su propia hora —nada se hace pasar por nuevo—, y el
 * motivo va a `warnings`. Se compara papel por papel y no por cantidad: un
 * papel que venció no está en ninguna de las dos, y uno recién licitado sin
 * precio todavía no está en la vieja, así que ninguno de los dos dispara el
 * respaldo.
 */

/**
 * Desde qué parte de la curva sin rendimiento se usa el respaldo. El
 * 14/10/2026 faltaban 11 de 12 en TAMAR y 8 de 29 en la CER.
 */
const FRACCION_FALTANTE = 0.2;

/** Un respaldo más viejo que esto ya no describe el mercado: no se sirve. */
const ANTIGUEDAD_MAXIMA_DIAS = 7;

/** Última respuesta completa de cada curva, en la memoria de la instancia. */
const ultimaCompleta = new Map<string, UniverseResponse>();

const conRendimiento = (u: UniverseResponse) =>
  new Set(u.instruments.filter((i) => i.tea !== null).map((i) => i.ticker));

export const AVISO_RESPALDO = 'Respuesta de respaldo:';

export interface Eleccion {
  respuesta: UniverseResponse;
  /** La recién calculada vino incompleta (se sirva o no el respaldo). */
  degradada: boolean;
}

/**
 * Qué responder. `actual` es la recién calculada (null si el cálculo falló
 * entero); `guardada`, el último cierre guardado en disco, de cualquier
 * rueda, para cuando la instancia arranca en frío y no tiene memoria.
 */
export function elegirRespuesta(
  slug: string,
  actual: UniverseResponse | null,
  guardada: UniverseResponse | null,
  motivoFalla?: string,
): Eleccion | null {
  if (actual) {
    const sin = actual.instruments.filter((i) => i.tea === null).map((i) => i.ticker);
    if (sin.length === 0) {
      ultimaCompleta.set(slug, actual);
      return { respuesta: actual, degradada: false };
    }
    // Un papel suelto sin dato (uno que BYMA dejó de listar, uno recién
    // licitado) sale marcado como siempre: congelar la curva entera en una
    // rueda vieja por él sería peor. El respaldo es para cuando falta una
    // parte de la curva.
    if (sin.length < Math.max(2, actual.instruments.length * FRACCION_FALTANTE)) {
      return { respuesta: actual, degradada: true };
    }
    const respaldo = mejorRespaldo(slug, guardada, sin, actual.tradeDate);
    if (!respaldo) return { respuesta: actual, degradada: true };
    return {
      respuesta: conAviso(
        respaldo,
        `la calculada a las ${hora(actual.fetchedAt)} vino sin rendimiento para ${sin.join(', ')}; se sirve la última completa, de la rueda del ${respaldo.tradeDate} (calculada a las ${hora(respaldo.fetchedAt)}).`,
      ),
      degradada: true,
    };
  }
  const respaldo = mejorRespaldo(slug, guardada, null, null);
  if (!respaldo) return null;
  return {
    respuesta: conAviso(
      respaldo,
      `no se pudo calcular la curva (${motivoFalla ?? 'error'}); se sirve la última completa, de la rueda del ${respaldo.tradeDate}.`,
    ),
    degradada: true,
  };
}

/**
 * El respaldo que cubre más de los papeles que faltan. Con `faltan` null (el
 * cálculo falló entero) sirve cualquiera; si no, tiene que tener rendimiento
 * para al menos uno de los que faltan.
 */
function mejorRespaldo(
  slug: string,
  guardada: UniverseResponse | null,
  faltan: string[] | null,
  ruedaActual: string | null,
): UniverseResponse | null {
  const limite = toIsoDate(addDays(parseIsoDate(ruedaActual ?? toIsoDate(new Date())), -ANTIGUEDAD_MAXIMA_DIAS));
  const candidatos = [ultimaCompleta.get(slug), guardada].filter(
    (c): c is UniverseResponse =>
      Boolean(c) && c!.tradeDate >= limite && conRendimiento(c!).size === c!.instruments.length,
  );
  let mejor: UniverseResponse | null = null;
  let cubre = 0;
  for (const c of candidatos) {
    const tiene = conRendimiento(c);
    const n = faltan ? faltan.filter((t) => tiene.has(t)).length : tiene.size;
    // A igual cobertura, el más nuevo.
    if (n > cubre || (n === cubre && n > 0 && mejor && c.fetchedAt > mejor.fetchedAt)) {
      mejor = c;
      cubre = n;
    }
  }
  return cubre > 0 ? mejor : null;
}

function conAviso(u: UniverseResponse, motivo: string): UniverseResponse {
  return {
    ...u,
    warnings: [...u.warnings.filter((w) => !w.startsWith(AVISO_RESPALDO)), `${AVISO_RESPALDO} ${motivo}`],
  };
}

const HORA = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function hora(iso: string): string {
  return HORA.format(new Date(iso));
}
