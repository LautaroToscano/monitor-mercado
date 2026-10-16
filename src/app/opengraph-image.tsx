import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import {
  ajustarCurva,
  apartadoDelAjuste,
  datoQueNoCierra,
  elegirParaElAjuste,
  entraALaCurvaPorDefecto,
} from '@/lib/ajuste';
import { listUniverses, getUniverse } from '@/lib/universes';
import type { InstrumentRow, UniverseResponse, VistaUniverso } from '@/lib/types';
import { ALT_IMAGEN } from '@/lib/compartir';

/**
 * La tarjeta que aparece al compartir el link (WhatsApp, LinkedIn, mail).
 *
 * Muestra lo que muestra el sitio: las cuatro curvas del último cierre
 * guardado, una al lado de la otra, con la misma regla de ajuste que cada
 * pestaña. Se arma en el build con `public/historico/ultimo/`, y el sitio se
 * publica de nuevo con cada foto de cierre, así que la imagen se renueva
 * sola todos los días.
 *
 * Mismos tokens que la pantalla (`globals.css`): panel claro, tinta, y
 * ningún color saturado, que en el sitio queda reservado para la dirección
 * del precio. Las fuentes van en TTF de un solo peso porque el generador no
 * lee woff2 ni fuentes variables (Archivo de Omnibus-Type e IBM Plex Mono,
 * las dos con licencia OFL).
 */
export const alt = ALT_IMAGEN;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const TINTA = '#0d1214';
const TINTA_2 = '#545d61';
const TINTA_3 = '#868f93';
const PANEL = '#fbfbf9';
const PLANO = '#eeefeb';
const REGLA = '#dedfd8';

const RAIZ = process.cwd();
const fuente = (archivo: string) => readFileSync(join(RAIZ, 'src/app/fuentes', archivo));

const ANCHO_CURVA = 246;
const ALTO_CURVA = 190;

interface Mini {
  label: string;
  puntos: { x: number; y: number; aparte: boolean }[];
  trazo: string | null;
  rango: string;
  n: number;
}

function leer(slug: string): UniverseResponse | null {
  try {
    return JSON.parse(readFileSync(join(RAIZ, 'public/historico/ultimo', `${slug}.json`), 'utf8'));
  } catch {
    return null;
  }
}

/** El plazo en el eje de cada curva, igual que en la pantalla (`plazoEnEje`). */
function plazo(i: InstrumentRow, eje: VistaUniverso['ejeX']): number {
  if (eje === 'duration-modificada') return i.dolarLinked?.durationModificada ?? i.daysToMaturity / 365;
  if (eje === 'duration') return (i.durationDays ?? i.daysToMaturity) / 365;
  return i.daysToMaturity;
}

function mini(slug: string, label: string): Mini | null {
  const u = leer(slug);
  const def = getUniverse(slug);
  if (!u || !def) return null;
  const vista = def.vista;
  const con = u.instruments.filter((i) => i.tea !== null && entraALaCurvaPorDefecto(i, vista));
  if (con.length < 3) return null;

  const xs = con.map((i) => plazo(i, vista.ejeX));
  const ys = con.map((i) => i.tea!);
  const [x0, x1] = [0, Math.max(...xs) * 1.05];
  const [yMin, yMax] = [Math.min(...ys), Math.max(...ys)];
  const colchon = (yMax - yMin) * 0.18 || 0.01;
  const [y0, y1] = [yMin - colchon, yMax + colchon];
  const X = (v: number) => ((v - x0) / (x1 - x0)) * ANCHO_CURVA;
  const Y = (v: number) => ALTO_CURVA - ((v - y0) / (y1 - y0)) * ALTO_CURVA;

  const aparte = (i: InstrumentRow) => apartadoDelAjuste(i, vista);
  const ajuste = ajustarCurva(
    elegirParaElAjuste(con, datoQueNoCierra, vista).map((i) => ({ dias: plazo(i, vista.ejeX), valor: i.tea! })),
    vista.modeloCurva,
  );
  let trazo: string | null = null;
  if (ajuste) {
    const pasos: string[] = [];
    for (let k = 0; k <= 48; k += 1) {
      const d = ajuste.desde + ((ajuste.hasta - ajuste.desde) * k) / 48;
      pasos.push(`${k === 0 ? 'M' : 'L'}${X(d).toFixed(1)} ${Y(ajuste.evaluar(d)).toFixed(1)}`);
    }
    trazo = pasos.join(' ');
  }

  // Signo menos tipográfico, como en toda la pantalla (`format.ts`).
  const pct = (v: number) => `${v < 0 ? '−' : ''}${Math.abs(v * 100).toFixed(0)}%`;
  return {
    label,
    puntos: con.map((i) => ({ x: X(plazo(i, vista.ejeX)), y: Y(i.tea!), aparte: aparte(i) })),
    trazo,
    rango: `TIR ${pct(yMin)} a ${pct(yMax)}`,
    n: con.length,
  };
}

function fechaLarga(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

export default async function Image() {
  const curvas = listUniverses()
    .map((u) => mini(u.slug, u.label))
    .filter((m): m is Mini => m !== null);
  const rueda = listUniverses()
    .map((u) => leer(u.slug)?.tradeDate)
    .filter((f): f is string => Boolean(f))
    .sort()
    .at(-1);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: PLANO,
          padding: 40,
          fontFamily: 'Archivo',
          color: TINTA,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            background: PANEL,
            border: `1px solid ${REGLA}`,
            borderRadius: 6,
            padding: '44px 48px 36px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', fontSize: 64, letterSpacing: -1.5, lineHeight: 1 }}>
                <span style={{ fontWeight: 700 }}>Monitor</span>
                <span style={{ fontWeight: 400, color: TINTA_2, marginLeft: 16 }}>Mercado</span>
              </div>
              <div style={{ display: 'flex', fontSize: 26, color: TINTA_2, marginTop: 14 }}>
                Renta fija en pesos del Tesoro argentino
              </div>
            </div>
            {rueda && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span style={{ fontSize: 15, letterSpacing: 2, color: TINTA_3, fontWeight: 700 }}>
                  CIERRE
                </span>
                <span style={{ fontFamily: 'Plex Mono', fontSize: 26, marginTop: 4 }}>{fechaLarga(rueda)}</span>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 34, marginBottom: 22, flex: 1 }}>
            {curvas.map((c) => (
              <div
                key={c.label}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  width: ANCHO_CURVA,
                  borderTop: `2px solid ${TINTA}`,
                  paddingTop: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 24, fontWeight: 700 }}>{c.label}</span>
                  <span style={{ fontFamily: 'Plex Mono', fontSize: 15, color: TINTA_3 }}>{c.n} papeles</span>
                </div>
                <svg
                  width={ANCHO_CURVA}
                  height={ALTO_CURVA}
                  viewBox={`-6 -6 ${ANCHO_CURVA + 12} ${ALTO_CURVA + 12}`}
                  style={{ marginTop: 14 }}
                >
                  {c.trazo && <path d={c.trazo} fill="none" stroke={TINTA_3} strokeWidth={2.5} />}
                  {c.puntos.map((p, k) =>
                    p.aparte ? (
                      <circle key={k} cx={p.x} cy={p.y} r={4.5} fill={PANEL} stroke={TINTA} strokeWidth={1.6} />
                    ) : (
                      <circle key={k} cx={p.x} cy={p.y} r={4.5} fill={TINTA} />
                    ),
                  )}
                </svg>
                <span style={{ fontFamily: 'Plex Mono', fontSize: 15, color: TINTA_2, marginTop: 10 }}>
                  {c.rango}
                </span>
              </div>
            ))}
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              borderTop: `1px solid ${REGLA}`,
              paddingTop: 16,
              fontSize: 17,
              color: TINTA_3,
            }}
          >
            <span>Curvas en vivo e inflación breakeven</span>
            <span style={{ fontFamily: 'Plex Mono' }}>BYMA · A3 · BCRA · INDEC</span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Archivo', data: fuente('Archivo-Regular.ttf'), weight: 400, style: 'normal' },
        { name: 'Archivo', data: fuente('Archivo-Bold.ttf'), weight: 700, style: 'normal' },
        { name: 'Plex Mono', data: fuente('IBMPlexMono-Regular.ttf'), weight: 400, style: 'normal' },
      ],
    },
  );
}
