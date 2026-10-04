import { NextResponse } from 'next/server';
import { AVISO_SIN_CIERRE, buildBreakeven, type BreakevenResponse } from '@/lib/breakeven';
import { ultimaRuedaTerminada } from '@/lib/conventions';
import { leerGuardado } from '@/lib/ultimo-cierre';

/**
 * Inflación breakeven, calculada entera en el backend: arma las dos curvas
 * con los cierres de la última rueda terminada, trae el CER del BCRA y el
 * IPC del INDEC, y devuelve los forwards por mes INDEC. El cliente sólo
 * dibuja.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Dos universos uno después del otro, el CER y el IPC: más que una curva sola. */
export const maxDuration = 60;

/**
 * Sale de precios de cierre, así que cambia una vez por día. Diez minutos de
 * cache le ahorran a BYMA las series históricas de cuarenta papeles y, al
 * cerrar la rueda, el cálculo nuevo aparece a lo sumo diez minutos después.
 */
const CACHE_S = 600;
/**
 * Pasado eso, el CDN sigue sirviendo la última respuesta al instante y la
 * renueva por detrás. Como el dato cambia una vez por día, servir el de hace
 * un rato a un solo visitante no se nota; esperar el cálculo, sí.
 */
const STALE_WHILE_REVALIDATE = 86_400;

/**
 * Si a alguna curva le faltó un papel, la respuesta se retiene sólo un
 * minuto: un hueco pasajero de BYMA no puede quedar servido veinte.
 */
const CACHE_INCOMPLETO_S = 60;

/**
 * El breakeven de la última rueda terminada, si ya está guardado.
 *
 * El proceso diario lo guarda junto con las fotos de cierre (ver
 * `scripts/guardar-historico.ts`). Leerlo es un archivo estático; calcularlo
 * son cuarenta series de BYMA, el CER y el IPC, unos diez segundos en frío.
 * Sale de cierres, así que vale también con la rueda abierta. Entre el
 * cierre y el proceso diario todavía no está, y se calcula como siempre.
 */
const guardado = (origen: string) =>
  leerGuardado<BreakevenResponse>(origen, `breakeven/${ultimaRuedaTerminada()}.json`, {
    tambienEnRueda: true,
  });

export async function GET(request: Request) {
  try {
    const payload = (await guardado(new URL(request.url).origin)) ?? (await buildBreakeven());
    const incompleto = payload.warnings.some((w) => w.startsWith(AVISO_SIN_CIERRE));
    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': incompleto
          ? `public, s-maxage=${CACHE_INCOMPLETO_S}`
          : `public, s-maxage=${CACHE_S}, stale-while-revalidate=${STALE_WHILE_REVALIDATE}`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'No se pudo calcular el breakeven', detail: (err as Error).message },
      { status: 502 },
    );
  }
}
