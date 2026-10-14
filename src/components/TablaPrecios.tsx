'use client';

import { useMemo, useState, type ReactNode } from 'react';
import type { InstrumentRow, VistaUniverso } from '@/lib/types';
import {
  anios,
  entero,
  fechaCorta,
  monto,
  numeroFirmado,
  pct,
  pctFirmado,
  precio,
} from '@/lib/format';
import estilos from './TablaPrecios.module.css';

interface Columna {
  clave: string;
  titulo: string;
  ayuda?: string;
  numerica: boolean;
  /** Por qué se ordena. */
  valor: (i: InstrumentRow) => number | string | null;
  celda: (i: InstrumentRow) => ReactNode;
  /** Clases extra de la celda, además de mono/numérica. */
  clase?: string;
  tono?: (i: InstrumentRow) => 'sube' | 'baja' | undefined;
  titleCelda?: (i: InstrumentRow) => string | undefined;
}

const TICKER: Columna = {
  clave: 'ticker',
  titulo: 'Ticker',
  numerica: false,
  valor: (i) => i.ticker,
  celda: (i) => i.ticker,
};

const VENCE: Columna = {
  clave: 'maturityDate',
  titulo: 'Vence',
  numerica: false,
  valor: (i) => i.maturityDate,
  celda: (i) => fechaCorta(i.maturityDate),
};

const DIAS: Columna = {
  clave: 'daysToMaturity',
  titulo: 'Días al vto.',
  ayuda:
    'Días desde la liquidación hasta el vencimiento. Normalmente T+1; los papeles que ya no se pueden operar a 24 horas se cuentan en contado.',
  numerica: true,
  valor: (i) => i.daysToMaturity,
  celda: (i) => entero(i.daysToMaturity),
};

const DURATION: Columna = {
  clave: 'durationDays',
  titulo: 'Duration',
  ayuda:
    'Duration de Macaulay en años, a la TIR real. En un cero cupón es el plazo al vencimiento; en uno que paga cupón, menos. Es el eje de la curva.',
  numerica: true,
  valor: (i) => i.durationDays,
  celda: (i) => anios(i.durationDays),
};

const PRECIO: Columna = {
  clave: 'lastPrice',
  titulo: 'Precio',
  numerica: true,
  valor: (i) => i.lastPrice,
  celda: (i) => precio(i.lastPrice),
  clase: estilos.precio,
};

const VARIACION: Columna = {
  clave: 'priceChange',
  titulo: 'Var.',
  numerica: true,
  valor: (i) => i.priceChange,
  celda: (i) => numeroFirmado(i.priceChange),
  tono: (i) => tono(i.priceChange),
};

const VARIACION_PCT: Columna = {
  clave: 'priceChangePct',
  titulo: 'Var. %',
  numerica: true,
  valor: (i) => i.priceChangePct,
  celda: (i) => pctFirmado(i.priceChangePct),
  tono: (i) => tono(i.priceChangePct),
};

const tem = (ayuda: string): Columna => ({
  clave: 'tem',
  titulo: 'TEM',
  ayuda,
  numerica: true,
  valor: (i) => i.tem,
  celda: (i) => pct(i.tem),
});

const tir = (ayuda: string): Columna => ({
  clave: 'tea',
  titulo: 'TIR',
  ayuda,
  numerica: true,
  valor: (i) => i.tea,
  celda: (i) => pct(i.tea),
  clase: estilos.precio,
});

const PAGO_FINAL: Columna = {
  clave: 'finalPayment',
  titulo: 'Pago final',
  ayuda: 'Monto que paga el instrumento al vencimiento por cada 100 de valor nominal',
  numerica: true,
  valor: (i) => i.finalPayment,
  celda: (i) => precio(i.finalPayment),
};

const CAPITAL_AJUSTADO: Columna = {
  clave: 'capitalAjustado',
  titulo: 'Capital ajustado',
  ayuda:
    'Por cada 100 de valor nominal original: lo que falta amortizar, con la capitalización de intereses si la hubo, ajustado por el CER de diez hábiles antes de la liquidación',
  numerica: true,
  valor: (i) => i.cer?.capitalAjustado ?? null,
  celda: (i) => precio(i.cer?.capitalAjustado ?? null),
};

const TC_IMPLICITO: Columna = {
  clave: 'tcImplicito',
  titulo: 'TC implícito',
  ayuda: 'Pesos por dólar de valor nominal que se pagan hoy: precio / 100. Comparado con el mayorista, da la TIR.',
  numerica: true,
  valor: (i) => i.dolarLinked?.tcImplicito ?? null,
  celda: (i) => precio(i.dolarLinked?.tcImplicito ?? null),
};

const TC_INICIAL: Columna = {
  clave: 'tcInicial',
  titulo: 'TC inicial',
  ayuda:
    'A3500 con el que se suscribió la emisión original: el del día hábil previo a la licitación. No entra en la TIR; en el dual es la base de la pata TAMAR.',
  numerica: true,
  valor: (i) => i.dolarLinked?.tcInicial?.valor ?? null,
  celda: (i) => precio(i.dolarLinked?.tcInicial?.valor ?? null),
  titleCelda: (i) =>
    i.dolarLinked?.tcInicial ? `A3500 del ${fechaCorta(i.dolarLinked.tcInicial.fecha)}` : undefined,
};

const VOLUMEN: Columna = {
  clave: 'volumeAmount',
  titulo: 'Volumen',
  numerica: true,
  valor: (i) => i.volumeAmount ?? i.volumeNominal,
  celda: (i) => monto(i.volumeAmount ?? i.volumeNominal),
  titleCelda: (i) =>
    i.volumeAmount !== null
      ? 'Monto efectivo negociado'
      : 'Volumen nominal negociado en la rueda de cierre',
};

const DURATION_TAMAR: Columna = {
  ...DURATION,
  ayuda:
    'Duration de Macaulay en años. Son todos cero cupón: es el plazo desde la liquidación hasta el vencimiento. Es el eje de la curva.',
};

const MARGEN: Columna = {
  clave: 'margen',
  titulo: 'Margen',
  ayuda:
    'Lo que el papel paga por encima de la TAMAR, en TNA. Lo fija la licitación o la norma de emisión.',
  numerica: true,
  valor: (i) => i.tamar?.margen ?? null,
  celda: (i) => pct(i.tamar?.margen ?? null),
  titleCelda: (i) => i.tamar?.fuenteMargen.replace(/ \(http.*\)$/, ''),
};

const VALOR_TECNICO: Columna = {
  clave: 'valorTecnico',
  titulo: 'Valor técnico',
  ayuda:
    'Por cada 100 de valor nominal: lo devengado hasta la liquidación con la TAMAR ya publicada más el margen. En el dual con dólar linked, en pesos al tipo de cambio inicial.',
  numerica: true,
  valor: (i) => i.tamar?.valorTecnico ?? null,
  celda: (i) => precio(i.tamar?.valorTecnico ?? null),
};

const PARIDAD: Columna = {
  clave: 'paridad',
  titulo: 'Paridad',
  ayuda: 'Precio sobre valor técnico.',
  numerica: true,
  valor: (i) => i.tamar?.paridad ?? null,
  celda: (i) => pct(i.tamar?.paridad ?? null),
};

/** Las columnas de cada curva. Las de CER cambian el pago final, que no se conoce, por el capital ajustado. */
function columnas(vista: Pick<VistaUniverso, 'ejeX' | 'tabla'>): Columna[] {
  const { ejeX } = vista;
  if (vista.tabla === 'tamar') {
    return [
      TICKER, VENCE, DIAS, DURATION_TAMAR, PRECIO, VARIACION, VARIACION_PCT,
      tem('Efectiva mensual, con la TAMAR de hoy constante hasta el vencimiento'),
      tir('Efectiva anual, actual/365, con la última TAMAR publicada constante hasta el vencimiento. En los duales, la de la pata TAMAR.'),
      MARGEN, VALOR_TECNICO, PARIDAD, VOLUMEN,
    ];
  }
  if (ejeX === 'duration-modificada') {
    return [
      TICKER, VENCE, DIAS, PRECIO, VARIACION, VARIACION_PCT,
      tem('Rendimiento sobre el dólar oficial, efectivo mensual'),
      tir('Rendimiento sobre el dólar oficial, efectivo anual, actual/365: (100 × dólar mayorista / precio)^(365/días) − 1. En el dual, el de la pata dólar.'),
      TC_IMPLICITO, TC_INICIAL, VOLUMEN,
    ];
  }
  if (ejeX === 'duration') {
    return [
      TICKER, VENCE, DIAS, DURATION, PRECIO, VARIACION, VARIACION_PCT,
      tem('Tasa efectiva mensual real'),
      tir('TIR real, efectiva anual, actual/365'),
      CAPITAL_AJUSTADO, VOLUMEN,
    ];
  }
  return [
    TICKER, VENCE, DIAS, PRECIO, VARIACION, VARIACION_PCT,
    tem('Tasa efectiva mensual'),
    tir('TIR, efectiva anual, actual/365'),
    PAGO_FINAL, VOLUMEN,
  ];
}

export function TablaPrecios({
  instrumentos,
  vista,
}: {
  instrumentos: InstrumentRow[];
  vista: Pick<VistaUniverso, 'ejeX' | 'tabla'>;
}) {
  const cols = useMemo(() => columnas(vista), [vista]);
  // En TAMAR los duales van marcados: su TIR es la de la pata TAMAR, un piso.
  const marcarDuales = vista.tabla === 'tamar';
  const [orden, setOrden] = useState<{ clave: string; desc: boolean }>({
    clave: 'daysToMaturity',
    desc: false,
  });

  const ordenados = useMemo(() => {
    const col = cols.find((c) => c.clave === orden.clave) ?? cols[0];
    const copia = [...instrumentos];
    copia.sort((a, b) => {
      const va = col.valor(a);
      const vb = col.valor(b);
      if (va === null) return 1;
      if (vb === null) return -1;
      const cmp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb), 'es-AR');
      return orden.desc ? -cmp : cmp;
    });
    return copia;
  }, [instrumentos, orden, cols]);

  const alternar = (clave: string) =>
    setOrden((prev) =>
      prev.clave === clave ? { clave, desc: !prev.desc } : { clave, desc: true },
    );

  return (
    <div className={estilos.marco}>
      <table className={estilos.tabla}>
        <thead>
          <tr>
            {cols.map((c) => {
              const activa = orden.clave === c.clave;
              return (
                <th
                  key={c.clave}
                  scope="col"
                  className={c.numerica ? estilos.numerica : undefined}
                  aria-sort={activa ? (orden.desc ? 'descending' : 'ascending') : 'none'}
                >
                  <button
                    type="button"
                    onClick={() => alternar(c.clave)}
                    className={`${estilos.botonOrden} ${activa ? estilos.ordenActivo : ''}`}
                    title={c.ayuda}
                  >
                    {c.titulo}
                    <span aria-hidden className={estilos.flecha}>
                      {activa ? (orden.desc ? '↓' : '↑') : ''}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {ordenados.map((i) => {
            const marcado = i.quality.level !== 'ok';
            const razones = i.quality.flags.map((f) => f.message).join(' · ');
            return (
              // La fila marcada sigue atenuada y el motivo vive en su title,
              // aunque ya no haya una columna que lo anuncie.
              <tr
                key={i.ticker}
                data-marcado={marcado || undefined}
                title={marcado ? razones : undefined}
              >
                {cols.map((c) =>
                  c.clave === 'ticker' ? (
                    <th key={c.clave} scope="row" className={`mono ${estilos.ticker}`}>
                      {c.celda(i)}
                      {marcarDuales && i.estructura === 'dual' && (
                        <span className={estilos.dual} title={tituloDual(i)}>
                          Dual
                        </span>
                      )}
                    </th>
                  ) : (
                    <td
                      key={c.clave}
                      className={
                        c.numerica
                          ? `mono ${estilos.numerica} ${c.clase ?? ''}`
                          : c.clave === 'maturityDate'
                            ? estilos.fecha
                            : c.clase
                      }
                      data-tono={c.tono?.(i)}
                      title={c.titleCelda?.(i)}
                    >
                      {c.celda(i)}
                    </td>
                  ),
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const NOMBRE_DUAL: Record<string, string> = {
  'dual-tasa-fija': 'tasa fija / TAMAR. Se dibuja aparte: no entra al ajuste de la curva.',
  'dual-cer': 'CER / TAMAR + 3%.',
  'dual-dolar-linked': 'TAMAR / dólar linked.',
};

function tituloDual(i: InstrumentRow): string {
  const tipo = i.tamar?.tipo ? NOMBRE_DUAL[i.tamar.tipo] : undefined;
  return `Dual ${tipo ?? ''} La TIR es la de la pata TAMAR, un piso.`.replace(/\s+/g, ' ');
}

function tono(v: number | null): 'sube' | 'baja' | undefined {
  if (v === null || v === 0) return undefined;
  return v > 0 ? 'sube' : 'baja';
}
