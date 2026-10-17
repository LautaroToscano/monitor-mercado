/**
 * Si una respuesta recién llegada reemplaza a la que está en pantalla. Una
 * rueda más nueva, sí; una más vieja, no (puede ser una copia del CDN o un
 * respaldo); de la misma rueda, sí salvo que sea la misma respuesta, que así
 * no vuelve a dibujar nada.
 */
export function reemplaza<T extends { tradeDate: string; fetchedAt: string; session?: string }>(
  actual: T | null,
  nueva: T,
): boolean {
  if (!actual) return true;
  if (nueva.tradeDate !== actual.tradeDate) return nueva.tradeDate > actual.tradeDate;
  return nueva.fetchedAt !== actual.fetchedAt || nueva.session !== actual.session;
}
