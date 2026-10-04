import { notFound } from 'next/navigation';
import { Tablero } from '@/components/Tablero';
import { getUniverse, listUniverses } from '@/lib/universes';

/**
 * El universo es un parámetro de ruta. Cuando se sumen las curvas CER y dólar
 * linked al registro, aparecen solas en la navegación y en su propia URL sin
 * tocar esta página.
 */
export function generateStaticParams() {
  return listUniverses().map((u) => ({ universe: u.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ universe: string }>;
}) {
  const { universe } = await params;
  const def = getUniverse(universe);
  return { title: def ? `${def.label} · Monitor` : 'Monitor' };
}

export default async function PaginaUniverso({
  params,
}: {
  params: Promise<{ universe: string }>;
}) {
  const { universe } = await params;
  const def = getUniverse(universe);
  if (!def) notFound();

  // La clave hace que cada curva arranque su propio tablero al navegar entre
  // pestañas, sin arrastrar las elecciones ni los datos de la otra.
  return (
    <Tablero
      key={universe}
      slug={universe}
      universos={listUniverses().map(({ slug, label }) => ({ slug, label }))}
      conBreakeven={def.vista.breakeven}
    />
  );
}
