/**
 * Factores para deshacer el ajuste de la serie histórica de BYMA.
 *
 *   npm run historico:ajustes
 *
 * La serie histórica de BYMA viene ajustada como un gráfico de acciones:
 * cuando un bono paga (renta o amortización), todos los precios anteriores
 * se multiplican por (P − D) / P, con P el último precio con derecho al pago
 * y D lo que se pagó. El precio del gráfico en el día es el real; los de
 * antes, no. Medido con TX26 el 14/04/2025: BYMA 451, A3 1.922 cada 100.
 *
 * Deshacerlo no necesita otra fuente. Yendo del pago más reciente al más
 * viejo, el precio de BYMA del día con derecho, ya sin los ajustes
 * posteriores, es P − D; D sale del cronograma y del CER del día de pago:
 *
 *   factor del pago = (precio con derecho + D) / precio con derecho
 *
 * y el factor de una rueda es el producto de los de todos los pagos que
 * vinieron después. El día ex es el hábil anterior al de pago.
 *
 * Verificado contra el precio sin ajustar de A3 el 12/10/2026: TX26, TX28,
 * DICP y DIP0 dan entre 0,01% y 0,1% de diferencia; PARP y CUAP, que en A3
 * operan poco, entre 0,2% y 1,8%.
 *
 * Sólo los CER que pagan antes del vencimiento. Los cero cupón no tienen
 * ajuste.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseIsoDate, restarDiasHabiles, toIsoDate } from '../src/lib/conventions';
import { fetchCer } from '../src/lib/sources/bcra';
import type { CerReference } from '../src/lib/types';
import { tasaCer } from '../src/lib/universes/tasa-cer';
import { cronograma } from '../src/lib/universes/tasa-cer-condiciones';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '../data');

export interface Pago {
  fecha: string;
  /** Desde esta rueda el precio ya no lleva el pago. */
  ex: string;
  /** Lo pagado por cada 100 de VN original, en pesos. */
  monto: number;
  /** Precio de BYMA del último día con derecho, sin los ajustes posteriores. */
  precioConDerecho: number;
  /** Multiplica los precios de BYMA anteriores a `ex`, junto con los de los pagos siguientes. */
  factor: number;
}

async function main() {
  const cer = await fetchCer('2003-01-01');
  const ajustes: Record<string, Pago[]> = {};

  for (const ref of tasaCer.reference.values() as Iterable<CerReference>) {
    if (ref.estructura !== 'con-cupon') continue;
    const archivo = join(DIR, 'series', `${ref.symbol}.json`);
    if (!existsSync(archivo)) continue;
    const serie = (JSON.parse(readFileSync(archivo, 'utf8')) as { date: string; close: number }[]).filter(
      (b) => b.close > 0,
    );
    if (serie.length < 2) continue;
    const inicio = serie[0].date;
    const fin = serie[serie.length - 1].date;
    const plan = cronograma(ref, parseIsoDate(inicio));
    if (!plan) continue;
    const base = cer.valor(toIsoDate(restarDiasHabiles(parseIsoDate(ref.issueDate), 10)));
    if (!base) throw new Error(`${ref.symbol}: sin CER de emisión`);

    const pagos: Pago[] = [];
    let acumulado = 1;
    for (const flujo of [...plan.flujos].filter((f) => f.fecha > inicio && f.fecha <= fin).reverse()) {
      const ex = toIsoDate(restarDiasHabiles(parseIsoDate(flujo.fecha), 1));
      const conDerecho = [...serie].reverse().find((b) => b.date < ex);
      const cerPago = cer.valor(toIsoDate(restarDiasHabiles(parseIsoDate(flujo.fecha), 10)));
      if (!conDerecho || !cerPago) throw new Error(`${ref.symbol}: falta precio o CER para el pago del ${flujo.fecha}`);
      const monto = (100 * (flujo.amortizacion + flujo.interes) * plan.capitalizacion * cerPago) / base;
      const precio = conDerecho.close * acumulado;
      const factor = (precio + monto) / precio;
      acumulado *= factor;
      pagos.push({
        fecha: flujo.fecha,
        ex,
        monto: Math.round(monto * 1e4) / 1e4,
        precioConDerecho: Math.round(precio * 1e4) / 1e4,
        factor: Math.round(factor * 1e8) / 1e8,
      });
    }
    ajustes[ref.symbol] = pagos.reverse();
    console.log(
      ref.symbol.padEnd(5),
      pagos.map((p) => `${p.fecha} ×${p.factor.toFixed(4)}`).join('  ') || 'sin pagos en la serie',
    );
  }

  writeFileSync(
    join(DIR, 'ajustes-byma.json'),
    JSON.stringify({ generado: new Date().toISOString(), ajustes }, null, 1) + '\n',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
