/**
 * Pedidos del navegador a los endpoints, con memoria entre pestañas.
 *
 * Al pasar de una curva a la otra la página no se recarga, así que lo que ya
 * se trajo sigue acá: la curva aparece en el acto con lo último que se tenía
 * y se refresca por detrás. Dos pedidos simultáneos a la misma ruta comparten
 * uno solo, y eso deja precargar lo de la otra pestaña sin pedirlo dos veces.
 */

interface Entrada {
  pedido: Promise<unknown>;
  valor?: unknown;
  cuando: number;
}

const entradas = new Map<string, Entrada>();

/**
 * Lo que devolvió la ruta, sin volver a pedirlo si es más nuevo que
 * `vigenciaMs`. Un error no se guarda: el próximo intento vuelve a la red.
 */
export function pedirJson<T>(ruta: string, vigenciaMs = 0): Promise<T> {
  const previa = entradas.get(ruta);
  if (previa && Date.now() - previa.cuando <= vigenciaMs) return previa.pedido as Promise<T>;

  const pedido = fetch(ruta).then(async (res) => {
    const cuerpo = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(
        (cuerpo as { detail?: string } | null)?.detail ?? `El servidor respondió ${res.status}`,
      );
    }
    return cuerpo as T;
  });
  const entrada: Entrada = { pedido, cuando: Date.now(), valor: previa?.valor };
  entradas.set(ruta, entrada);
  pedido.then(
    (valor) => {
      entrada.valor = valor;
    },
    () => {
      if (entradas.get(ruta) === entrada) {
        if (previa) entradas.set(ruta, previa);
        else entradas.delete(ruta);
      }
    },
  );
  return pedido;
}

/** Lo último que llegó de una ruta, para dibujar sin esperar. */
export function ultimoValor<T>(ruta: string): T | null {
  return (entradas.get(ruta)?.valor as T | undefined) ?? null;
}

/** Pide algo que todavía no se necesita, cuando el navegador está libre. */
export function precargar(rutas: string[]): void {
  const pedir = () => {
    for (const ruta of rutas) pedirJson(ruta, 60_000).catch(() => undefined);
  };
  if ('requestIdleCallback' in window) window.requestIdleCallback(pedir, { timeout: 2_000 });
  else setTimeout(pedir, 500);
}
