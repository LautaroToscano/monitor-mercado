import { notFound } from 'next/navigation';
import { Tablero } from '@/components/Tablero';
import { getUniverse, listUniverses } from '@/lib/universes';
import { ALT_IMAGEN } from '@/lib/compartir';

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
  if (!def) return { title: 'Monitor Mercado' };
  // Cada pestaña se comparte con su propio título y descripción; la imagen
  // es la del sitio (`app/opengraph-image.tsx`), con las cuatro curvas.
  const title = `${def.label} · Monitor Mercado`;
  return {
    title,
    description: def.description,
    // El bloque openGraph de la pestaña reemplaza entero al del sitio, así
    // que la imagen se repite acá: si no, se pierde.
    openGraph: {
      title,
      description: def.description,
      url: `/${def.slug}`,
      images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: ALT_IMAGEN }],
    },
    twitter: { card: 'summary_large_image', images: ['/opengraph-image'] },
  };
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
