/**
 * Encabezados de seguridad de todo el sitio.
 *
 * - CSP: la página sólo carga scripts, estilos, fuentes y datos del propio
 *   sitio. Next.js mete scripts y estilos en línea (los datos de la página,
 *   las fuentes, el tema inicial), así que hace falta 'unsafe-inline'; lo que
 *   se bloquea es cualquier cosa de otro origen. Sólo en producción: el modo
 *   desarrollo de Next necesita 'unsafe-eval' para recargar en caliente.
 * - frame-ancestors / X-Frame-Options: nadie puede meter la página dentro de
 *   otra con un iframe (clickjacking). Para embeberla en un sitio propio,
 *   agregar ese dominio a frame-ancestors.
 * - El resto: no adivinar tipos de archivo, no mandar la URL completa a otros
 *   sitios, y ningún permiso del navegador (cámara, micrófono, ubicación).
 *
 * HSTS ya lo pone Vercel.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const encabezados = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  ...(process.env.NODE_ENV === 'production' ? [{ key: 'Content-Security-Policy', value: CSP }] : []),
];

/** @type {import('next').NextConfig} */
export default {
  poweredByHeader: false,
  // Las pestañas se arman con el último cierre guardado (`lib/foto-inicial.ts`)
  // y se regeneran cada hora en el servidor: ahí tienen que estar esos
  // archivos, que por ser de public/ no viajan solos con la función.
  outputFileTracingIncludes: {
    '/[universe]': [
      './public/historico/ultimo/*.json',
      './public/historico/breakeven/*.json',
      './public/historico/indice.json',
    ],
  },
  async headers() {
    return [{ source: '/:path*', headers: encabezados }];
  },
};
