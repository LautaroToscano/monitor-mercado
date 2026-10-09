import type { AnyUniverse } from './types';
import { tasaFija } from './tasa-fija';
import { tasaCer } from './tasa-cer';
import { dolarLinked } from './dolar-linked';

/**
 * Registro de universos. Para sumar otra curva: generar su referencia,
 * escribir su definición y agregarla acá. El endpoint y el frontend no
 * cambian.
 */
const REGISTRY: readonly AnyUniverse[] = [tasaFija, tasaCer, dolarLinked];

export const universes = new Map(REGISTRY.map((u) => [u.slug, u]));

export function getUniverse(slug: string): AnyUniverse | undefined {
  return universes.get(slug);
}

export function listUniverses() {
  return REGISTRY.map(({ slug, label, description }) => ({ slug, label, description }));
}

export type { AnyUniverse, UniverseDefinition } from './types';
