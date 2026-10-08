import { NextResponse } from 'next/server';
import { buildDevaluacion } from '@/lib/devaluacion';

/**
 * Devaluación implícita por mes: de los futuros de dólar de A3 y, al lado,
 * la que sale de comparar la curva de tasa fija con la dólar linked. Todo de
 * la misma rueda, calculado en el backend.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Dos curvas de BYMA, el mayorista y los futuros de A3, y el A3500. */
export const maxDuration = 60;

/** Sale de cierres: cambia una vez por rueda. */
const CACHE_S = 600;
const STALE_WHILE_REVALIDATE = 86_400;

export async function GET() {
  try {
    const payload = await buildDevaluacion();
    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': `public, s-maxage=${CACHE_S}, stale-while-revalidate=${STALE_WHILE_REVALIDATE}`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'No se pudo calcular la devaluación implícita', detail: (err as Error).message },
      { status: 502 },
    );
  }
}
