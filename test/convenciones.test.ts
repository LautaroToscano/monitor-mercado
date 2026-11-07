/**
 * Convenciones de cálculo: calendario, liquidación y conteo de días. Son la
 * base de todas las curvas; un error acá corre todas las tasas a la vez.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  businessDaysBetween,
  capitalizationExponent,
  daysBetween,
  dias30360,
  effectiveAnnualRate,
  effectiveMonthlyRate,
  esDiaDeLiquidacion,
  isBusinessDay,
  parseIsoDate as P,
  restarDiasHabiles,
  settlementDate,
  sumarDiasHabiles,
  toIsoDate as I,
} from '../src/lib/conventions';
import { parsearCalendarioByma } from '../src/lib/sources/byma-calendario';

test('feriados y fines de semana no son hábiles', () => {
  assert.equal(isBusinessDay(P('2026-10-12')), false, '12/10/2026, feriado');
  assert.equal(isBusinessDay(P('2026-10-10')), false, 'sábado');
  assert.equal(isBusinessDay(P('2026-10-13')), true);
  assert.equal(isBusinessDay(P('2026-06-15')), false, '15/06/2026, Güemes trasladado');
});

test('la liquidación T+1 saltea el fin de semana y el feriado', () => {
  assert.equal(I(settlementDate(P('2026-10-09'))), '2026-10-13');
  assert.equal(I(settlementDate(P('2026-10-13'))), '2026-10-14');
});

test('un día con negociación y sin liquidación no liquida (calendario de BYMA, nov/dic 2026)', () => {
  // 6/11 Día del Bancario: rueda sin liquidación; 9 y 10/11 sin rueda (visita
  // del Papa). Lo operado a 24 horas el 5 y el 6 liquidó el 11.
  assert.equal(isBusinessDay(P('2026-11-06')), true, 'el 6/11 hubo rueda');
  assert.equal(isBusinessDay(P('2026-11-09')), false, 'el 9/11 no');
  assert.equal(isBusinessDay(P('2026-11-10')), false, 'el 10/11 no');
  assert.equal(esDiaDeLiquidacion(P('2026-11-06')), false);
  assert.equal(I(settlementDate(P('2026-11-05'))), '2026-11-11');
  assert.equal(I(settlementDate(P('2026-11-06'))), '2026-11-11');
  assert.equal(I(settlementDate(P('2026-11-11'))), '2026-11-12');
  // 7/12 no laborable turístico (sin liquidación) y 8/12 feriado.
  assert.equal(I(settlementDate(P('2026-12-04'))), '2026-12-09');
  assert.equal(I(settlementDate(P('2026-12-07'))), '2026-12-09');
});

test('el calendario de BYMA se lee de su página', () => {
  const fila = (fecha: string, dia: string, motivo: string) =>
    `<div role="listitem" class="byma_table_row w-dyn-item"><div class="byma_table_cell"><div>${fecha}</div></div><div class="byma_table_cell"><div>${dia}</div></div><div class="byma_table_cell"><div>${motivo}</div></div></div>`;
  const html = [
    fila('6 de Noviembre', 'Viernes', 'Día del Bancario (3)'),
    fila('9 de noviembre', 'Lunes', 'Visita de Su Santidad el Papa León XIV (5)'),
    fila('31 de Diciembre de 2026', 'Jueves', 'Jornada sin Negociación ni Liquidación (4)'),
    '<h4>Referencias<br/>‍</h4><ol role="list"><li>Feriado Nacional Inamovible / Ley 27.399 – Art. 1</li>',
    '<li>Feriado Nacional Trasladable / Ley 27.399 – Art. 1 y 6</li><li>Jornada sin Liquidación | Jornada con Negociación</li>',
    '<li>Fechas con el criterio dispuesto en el <a href="#"><strong>Comunicado 18897 </strong></a>de BYMA</li>',
    '<li>Fecha con el criterio dispuesto en el Decreto 1103/26</li></ol>',
  ].join('');
  assert.deepEqual(parsearCalendarioByma(html), {
    anio: 2026,
    sinRueda: ['2026-11-09', '2026-12-31'],
    sinLiquidacion: ['2026-11-06'],
  });
  assert.throws(() => parsearCalendarioByma(html.replace(/<ol[\s\S]*<\/ol>/, '')), /referencias/);
});

test('sumar y restar hábiles', () => {
  assert.equal(I(restarDiasHabiles(P('2026-10-13'), 1)), '2026-10-09');
  assert.equal(I(sumarDiasHabiles(P('2026-10-09'), 1)), '2026-10-13');
  assert.equal(businessDaysBetween(P('2026-10-09'), P('2026-10-14')), 2);
});

test('días corridos y 30/360', () => {
  assert.equal(daysBetween(P('2026-10-14'), P('2027-02-26')), 135);
  assert.equal(dias30360(P('2026-02-13'), P('2027-02-26')), 373);
  assert.equal(dias30360(P('2026-04-01'), P('2027-08-31')), 510);
  assert.equal(dias30360(P('2026-07-31'), P('2028-01-31')), 540, 'el 31 cuenta como 30 en las dos puntas');
});

test('capitalización: meses enteros más el remanente sobre 30', () => {
  assert.equal(capitalizationExponent(P('2026-01-15'), P('2026-07-15')), 6);
  assert.equal(capitalizationExponent(P('2026-01-15'), P('2026-07-30')), 6.5);
});

test('TEM y TEA son la misma tasa en dos plazos', () => {
  const tem = effectiveMonthlyRate(95, 100, 90);
  const tea = effectiveAnnualRate(95, 100, 90);
  assert.ok(Math.abs((1 + tem) ** (365 / 30) - 1 - tea) < 1e-12);
  assert.ok(Math.abs(tea - ((100 / 95) ** (365 / 90) - 1)) < 1e-12);
});
