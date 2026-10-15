import { NextResponse } from 'next/server';

/**
 * Ningún endpoint de la API recibe parámetros: todo sale de la ruta.
 *
 * El CDN guarda cada respuesta por su URL completa, así que con agregar
 * `?x=1`, `?x=2`... cualquiera se salteaba el cache y obligaba a recalcular,
 * con sus pedidos a BYMA, A3 y el BCRA. Un bot podía así hacer que BYMA
 * bloqueara la IP del servidor —ya lo hace con el exceso, ver
 * `refresh-reference.ts`— o agotar el plan, y el sitio se caía.
 *
 * Un pedido con parámetros se rechaza antes de calcular nada. El rechazo
 * también se guarda en el CDN, así que repetirlo no llega al servidor.
 */
export function rechazarParametros(request: Request): NextResponse | null {
  if (!new URL(request.url).search) return null;
  return NextResponse.json(
    { error: 'Este endpoint no recibe parámetros.' },
    { status: 400, headers: { 'Cache-Control': 'public, s-maxage=86400' } },
  );
}

/**
 * Dónde leer los archivos guardados del propio sitio (`public/historico/`).
 *
 * No sale de la dirección que trae el pedido, que la arma quien lo manda: en
 * producción es siempre el dominio del proyecto, que Vercel publica en
 * `VERCEL_PROJECT_PRODUCTION_URL`. Una preview lee los de producción, que es
 * lo que hay que mostrar con el mercado cerrado. En local, el propio
 * servidor.
 */
export function origenPropio(request: Request): string {
  const produccion = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return produccion ? `https://${produccion}` : new URL(request.url).origin;
}
