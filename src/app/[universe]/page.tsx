import { notFound } from 'next/navigation';
import { Tablero } from '@/components/Tablero';
import { getUniverse, listUniverses } from '@/lib/universes';
import { ALT_IMAGEN } from '@/lib/compartir';
import { breakevenInicial, cierreInicial } from '@/lib/foto-inicial';

/**
 * El universo es un parámetro de ruta. Cuando se sumen las curvas CER y dólar
 * linked al registro, aparecen solas en la navegación y en su propia URL sin
 * tocar esta página.
 */
/**
 * La página se arma con el último cierre guardado (`foto-inicial.ts`) y se
 * regenera cada hora: así el control de que esa foto sea reciente se
 * reevalúa aunque no haya deploy. El deploy diario, que dispara la foto de
 * cierre, la renueva igual.
 */
export const revalidate = 3600;

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

  // La curva, la tabla y el breakeven llegan ya dibujados en el HTML, con el
  // último cierre guardado; el tablero pide después los datos de siempre.
  const inicial = cierreInicial(universe);
  // La vista (eje, forma de la curva) es del código, no del archivo, como en
  // el endpoint: un cambio se ve aunque la foto sea de antes.
  const datosIniciales = inicial ? { ...inicial, vista: def.vista } : null;

  // La clave hace que cada curva arranque su propio tablero al navegar entre
  // pestañas, sin arrastrar las elecciones ni los datos de la otra.
  return (
    <Tablero
      key={universe}
      slug={universe}
      universos={listUniverses().map(({ slug, label }) => ({ slug, label }))}
      conBreakeven={def.vista.breakeven}
      inicial={datosIniciales}
      breakevenInicial={def.vista.breakeven ? breakevenInicial() : null}
    />
  );
}
