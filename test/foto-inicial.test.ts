/**
 * Lo que cada pestaña muestra apenas abre: la foto del último cierre, nunca
 * una de hace días, y reemplazada sólo por algo más nuevo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esReciente, cierreInicial } from '../src/lib/foto-inicial';
import { reemplaza } from '../src/lib/reemplazo';

/** Viernes 16/10/2026 a la noche (la rueda del 16 ya terminó). */
const VIERNES_NOCHE = new Date('2026-10-17T00:30:00Z');
/** Lunes 19/10/2026 antes de la rueda. */
const LUNES_TEMPRANO = new Date('2026-10-19T12:00:00Z');

test('la foto vale si es de la última rueda o de la anterior', () => {
  assert.equal(esReciente('2026-10-16', VIERNES_NOCHE), true, 'la del día');
  assert.equal(esReciente('2026-10-15', VIERNES_NOCHE), true, 'la de ayer: el proceso de la noche no corrió');
  assert.equal(esReciente('2026-10-14', VIERNES_NOCHE), false, 'de hace dos ruedas: no se muestra');
  assert.equal(esReciente('2026-10-16', LUNES_TEMPRANO), true, 'el fin de semana no la vuelve vieja');
  assert.equal(esReciente('2026-10-15', LUNES_TEMPRANO), true);
  assert.equal(esReciente('2026-10-13', LUNES_TEMPRANO), false);
});

test('una pestaña sin archivo arranca sin foto', () => {
  assert.equal(cierreInicial('no-existe', VIERNES_NOCHE), null);
});

test('al llegar una respuesta: sólo se reemplaza por algo más nuevo', () => {
  const r = (tradeDate: string, fetchedAt: string, session = 'cierre') => ({ tradeDate, fetchedAt, session });
  const foto = r('2026-10-15', '2026-10-15T23:00:00Z');
  assert.equal(reemplaza(null, foto), true, 'sin nada en pantalla');
  assert.equal(reemplaza(foto, r('2026-10-16', '2026-10-16T21:00:00Z')), true, 'rueda más nueva');
  assert.equal(reemplaza(foto, r('2026-10-14', '2026-10-14T21:00:00Z')), false, 'rueda más vieja');
  assert.equal(reemplaza(foto, { ...foto }), false, 'la misma respuesta: no se vuelve a dibujar');
  assert.equal(
    reemplaza(r('2026-10-16', 'a', 'intradiaria'), r('2026-10-16', 'b', 'intradiaria')),
    true,
    'en rueda, cada precio nuevo',
  );
});
