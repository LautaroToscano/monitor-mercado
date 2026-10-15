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
  isBusinessDay,
  parseIsoDate as P,
  restarDiasHabiles,
  settlementDate,
  sumarDiasHabiles,
  toIsoDate as I,
} from '../src/lib/conventions';

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
