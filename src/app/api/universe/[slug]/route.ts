import { NextResponse } from 'next/server';
import { buildUniverse } from '@/lib/build';
import { getUniverse, listUniverses } from '@/lib/universes';
import type { UniverseResponse } from '@/lib/types';
import { CARPETA_ULTIMO_CIERRE, leerGuardado } from '@/lib/ultimo-cierre';

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
  const { slug } = await params;
  const universe = getUniverse(slug);

  if (!universe) {
    return NextResponse.json(
      { error: `Universo desconocido: ${slug}`, available: listUniverses() },
      { status: 404 },
    );
  }

  try {
    // Con el mercado cerrado, el último cierre ya calculado si está guardado.
    const payload =
      (await leerGuardado<UniverseResponse>(
        new URL(request.url).origin,
        `${CARPETA_ULTIMO_CIERRE}/${slug}.json`,
      )) ??
      (await (universe.construir ? universe.construir(new Date()) : buildUniverse(universe)));
    // Una sesión desconocida es un estado degradado: se cachea corto para
    // volver a intentar apenas la fuente se recupere.
    const maxAge = payload.session === 'cierre' ? CACHE_CERRADO : CACHE_EN_RUEDA;
    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': `public, s-maxage=${maxAge}, stale-while-revalidate=${STALE_WHILE_REVALIDATE}`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'No se pudo construir el universo', detail: (err as Error).message },
      { status: 502 },
    );
  }
}
