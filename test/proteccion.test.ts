/**
 * Las protecciones de producción: el respaldo ante datos incompletos y que
 * ningún endpoint quede sin ellas.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AVISO_RESPALDO, elegirRespuesta } from '../src/lib/respaldo';
import { rechazarParametros } from '../src/lib/api';
import type { UniverseResponse } from '../src/lib/types';

const T = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
const respuesta = (fecha: string, filas: [string, number | null][]) =>
  ({
    tradeDate: fecha,
    fetchedAt: `${fecha}T20:00:00Z`,
    warnings: [],
    instruments: filas.map(([ticker, tea]) => ({ ticker, tea })),
  }) as unknown as UniverseResponse;
const completa = (fecha: string) => respuesta(fecha, T.map((t) => [t, 0.3]));
const conHuecos = (fecha: string, huecos: number) =>
  respuesta(fecha, T.map((t, i) => [t, i < huecos ? null : 0.3]));

test('respaldo: una curva completa se sirve tal cual', () => {
  const e = elegirRespuesta('r1', completa('2026-10-14'), null)!;
  assert.equal(e.degradada, false);
  assert.equal(e.respuesta.tradeDate, '2026-10-14');
});

test('respaldo: media curva sin dato se cambia por la última completa', () => {
  elegirRespuesta('r2', completa('2026-10-14'), null);
  const e = elegirRespuesta('r2', conHuecos('2026-10-14', 8), null)!;
  assert.equal(e.degradada, true);
  assert.equal(e.respuesta.instruments.every((i) => i.tea !== null), true);
  assert.ok(e.respuesta.warnings.some((w) => w.startsWith(AVISO_RESPALDO)));
});

test('respaldo: sin memoria, usa el último cierre guardado', () => {
  const e = elegirRespuesta('r3', conHuecos('2026-10-14', 5), completa('2026-10-13'))!;
  assert.equal(e.respuesta.tradeDate, '2026-10-13');
});

test('respaldo: un papel suelto sin dato no congela la curva', () => {
  const e = elegirRespuesta('r4', conHuecos('2026-10-14', 1), completa('2026-10-13'))!;
  assert.equal(e.respuesta.tradeDate, '2026-10-14');
  assert.equal(e.degradada, true);
});

test('respaldo: papeles nuevos sin precio no disparan el respaldo', () => {
  const actual = respuesta('2026-10-14', [...T.map((t) => [t, 0.3] as [string, number]), ['N1', null], ['N2', null], ['N3', null]]);
  const e = elegirRespuesta('r5', actual, completa('2026-10-13'))!;
  assert.equal(e.respuesta.tradeDate, '2026-10-14');
});

test('respaldo: si el cálculo falla entero, la última completa en vez de un error', () => {
  // Sin respuesta nueva, la antigüedad del respaldo se mide contra hoy: la
  // fecha del caso tiene que ser relativa, no fija (con una fija, el test
  // empezó a fallar solo una semana después de escrito).
  const ayer = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const haceDiezDias = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);
  const e = elegirRespuesta('r6', null, completa(ayer), 'BYMA no respondió')!;
  assert.equal(e.respuesta.tradeDate, ayer);
  assert.equal(elegirRespuesta('r6b', null, completa(haceDiezDias), 'BYMA no respondió'), null, 'uno de hace diez días, no');
  assert.equal(elegirRespuesta('r7', null, null, 'BYMA no respondió'), null, 'sin nada, error');
});

test('respaldo: uno de más de una semana no se sirve', () => {
  const e = elegirRespuesta('r8', conHuecos('2026-10-14', 5), completa('2026-10-02'))!;
  assert.equal(e.respuesta.tradeDate, '2026-10-14');
});

test('la API rechaza parámetros (no se puede saltear el cache)', async () => {
  const r = rechazarParametros(new Request('https://x/api/universe/tamar?x=1'))!;
  assert.equal(r.status, 400);
  assert.equal(rechazarParametros(new Request('https://x/api/universe/tamar')), null);
});

test('todo endpoint de la API usa las protecciones', () => {
  // Un endpoint nuevo tiene que rechazar parámetros; si además calcula con
  // fuentes externas, tener respaldo. Sumarlo a la lista de abajo es una
  // decisión explícita, no un olvido.
  const API = fileURLToPath(new URL('../src/app/api/', import.meta.url));
  const rutas: string[] = [];
  const recorrer = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) recorrer(p);
      else if (f === 'route.ts') rutas.push(p);
    }
  };
  recorrer(API);
  assert.ok(rutas.length >= 4);
  // Sin respaldo a propósito: el catálogo no consulta fuentes y la
  // devaluación no tiene pantalla todavía.
  const sinRespaldo = ['universe/route.ts', 'devaluacion/route.ts'];
  for (const p of rutas) {
    const codigo = readFileSync(p, 'utf8');
    const nombre = p.slice(API.length).replaceAll('\\', '/');
    assert.match(codigo, /rechazarParametros\(/, `${nombre} no rechaza parámetros`);
    if (!sinRespaldo.includes(nombre)) {
      assert.match(codigo, /elegirRespuesta\(|AVISO_RESPALDO/, `${nombre} no tiene respaldo`);
    }
  }
});
