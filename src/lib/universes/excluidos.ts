/**
 * Especies que ninguna curva considera, por decisión del usuario.
 *
 * El descubrimiento mira todo ticker del panel con forma de candidato y pide
 * su ficha para ver si es nuevo. Los que están acá no se miran: ni en el
 * request, ni en el refresco de la referencia. Cada uno con el motivo.
 */
export const EXCLUIDOS: ReadonlyMap<string, string> = new Map([
  [
    'TVSJ1',
    'decisión del usuario (21/10/2026): no le interesa. No es del Tesoro: BYMA no tiene su ficha, no tiene descripción, nunca operó y no figura en A3. Como su ficha a veces no respondía a tiempo, abría avisos de mantenimiento.',
  ],
]);
