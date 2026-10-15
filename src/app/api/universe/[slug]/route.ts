import { NextResponse } from 'next/server';
import { buildUniverse } from '@/lib/build';
import { getUniverse, listUniverses } from '@/lib/universes';
import type { UniverseResponse } from '@/lib/types';
import { CARPETA_ULTIMO_CIERRE, leerGuardado } from '@/lib/ultimo-cierre';
import { elegirRespuesta } from '@/lib/respaldo';
import { origenPropio, rechazarParametros } from '@/lib/api';

/**
 * Proxy server-side hacia la fuente de mercado.
 *
 * El frontend nunca le pega a BYMA. Además del CORS, todos los cálculos de
 * rendimiento viven de este lado: el cliente recibe números listos y sólo los
 * dibuja.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/**
 * La rama de cierre es un pedido por papel a la serie histórica de BYMA
 * (treinta en la CER), más el CER del BCRA y alguna ficha nueva. Cada paso
 * tiene su techo; esto es la suma de los techos con margen.
 */
export const maxDuration = 45;

/** En rueda los precios refrescan cada ~20s en la fuente. */
const CACHE_EN_RUEDA = 20;
/**
 * Con el mercado cerrado los precios ya no cambian, pero el cache no puede ser
 * largo: la sesión pasa a "en curso" sola al abrir la rueda, y un cache de diez
 * minutos dejaría la pantalla anunciando mercado cerrado un rato después de la
 * apertura. Un minuto alcanza para descargar la fuente sin que se note.
 */
const CACHE_CERRADO = 60;
/**
 * Vencido el cache, el CDN sirve la última respuesta en el acto y la renueva
 * por detrás. El primero que entra después de un rato no espera las treinta
 * series de BYMA: ve la curva de hace unos minutos y el tablero, que vuelve a
 * pedir enseguida, recibe la nueva.
 */
const STALE_WHILE_REVALIDATE = 600;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const rechazo = rechazarParametros(request);
  if (rechazo) return rechazo;
  const { slug } = await params;
  const universe = getUniverse(slug);

  if (!universe) {
    return NextResponse.json(
      { error: `Universo desconocido: ${slug}`, available: listUniverses() },
      { status: 404 },
    );
  }

  const origen = origenPropio(request);
  const ruta = `${CARPETA_ULTIMO_CIERRE}/${slug}.json`;
  let actual: UniverseResponse | null = null;
  let motivo: string | undefined;
  try {
    // Con el mercado cerrado, el último cierre ya calculado si está guardado.
    const guardado = await leerGuardado<UniverseResponse>(origen, ruta);
    actual = guardado ?? (await buildUniverse(universe));
  } catch (err) {
    motivo = (err as Error).message;
  }

  // Si vino incompleta o no vino, la última completa (ver `respaldo.ts`). El
  // archivo guardado se lee sólo en ese caso: no suma espera a una normal.
  const necesitaRespaldo = !actual || actual.instruments.some((i) => i.tea === null);
  const guardada = necesitaRespaldo
    ? await leerGuardado<UniverseResponse>(origen, ruta, { cualquierFecha: true })
    : null;
  const eleccion = elegirRespuesta(slug, actual, guardada, motivo);

  if (!eleccion) {
    return NextResponse.json(
      { error: 'No se pudo construir el universo', detail: motivo },
      { status: 502 },
    );
  }

  // La vista (eje, forma de la curva, qué entra al ajuste) es del universo y
  // no de la rueda: sale siempre del código, para que un cambio se vea
  // aunque la respuesta servida sea de antes.
  const payload = { ...eleccion.respuesta, vista: universe.vista };
  // Una respuesta degradada no se deja en el CDN: se vuelve a calcular
  // apenas alguien entra, para que la fuente recuperada se vea enseguida.
  const cacheControl = eleccion.degradada
    ? `public, s-maxage=${CACHE_DEGRADADA}`
    : `public, s-maxage=${payload.session === 'cierre' ? CACHE_CERRADO : CACHE_EN_RUEDA}, stale-while-revalidate=${STALE_WHILE_REVALIDATE}`;
  return NextResponse.json(payload, { headers: { 'Cache-Control': cacheControl } });
}

/** Lo que se retiene una respuesta degradada o de respaldo. */
const CACHE_DEGRADADA = 15;
