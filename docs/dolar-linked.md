# Dólar linked

Curva de los títulos del Tesoro vinculados al dólar oficial. Volver al [README](../README.md).

## Qué papeles

Letras (D30O6, D30N6, D15E7, D31M7, D10Y7), bonos (TZV27, TZV28, TZVD8) y el
dual TAMAR / dólar linked TMVE8. El universo es dinámico como el resto: un
título nuevo entra solo si la ficha de BYMA dice "vinculada al dólar" o
"dólar linked" y el emisor es el Gobierno Nacional. Precios de los mismos
dos paneles de BYMA que tasa fija y CER.

## Dos tipos de cambio distintos

- **Spot, para valuar hoy:** el cierre mayorista de A3 (UST$T, contado,
  segmento mayorista, último precio de la rueda).
- **A3500, contractual:** el que fija con cuántos pesos se suscribió y
  cuánto paga cada título. No valúa nada hoy.

Las condiciones se verificaron en la norma de emisión de cada papel
(`src/lib/universes/dolar-linked-condiciones.ts`, con el link). Los nueve
dicen lo mismo:

- suscripción: A3500 del día hábil previo a la licitación (T-1);
- pago: A3500 del **tercer día hábil previo a la fecha de pago**.

El dual llama a la primera "tipo de cambio inicial" y la usa además para su
pata TAMAR. La ficha de BYMA sólo escribe la regla en TZV27; por eso la
regla vive en código y no se asume para un papel nuevo: entra a la curva,
pero sin fecha de fijación y con un aviso en `warnings`.

D10Y7: la norma dice emisión 17/07/2026 y la ficha 16/07/2026. Manda la
norma; no cambia la TIR.

El cierre de A3 y el A3500 no son el mismo número. En las veinte ruedas al
07/10/2026 se apartaron entre −4,26 y +4,39 pesos (−0,28% a +0,29%), 1,53
pesos en promedio absoluto. `npm run validate:dolar-linked` lo repite.

## Rendimiento

    TIR = (100 × spot A3 / precio)^(365/días) − 1

La tasa sobre el dólar oficial: lo que rinde por encima de la devaluación.
Puede ser negativa. Actual/365, días de la liquidación T+1 al vencimiento.
TEM con exponente 30/días. En el dual es la de la pata dólar, un piso: el
precio incluye además la opción de cobrar TAMAR.

Eje X: **duration modificada**, plazo / 365 / (1 + TIR). Son cero cupón, así
que la de Macaulay es el plazo.

## La curva

Mismo ajuste que tasa fija, `TIR = a + b · ln(duration)`. Entran los cero
cupón sin marca de calidad; el dual se dibuja pero no entra. **No hay mínimo
de días**: el papel más corto entra siempre (`sinMinimoDeHabiles`).

Medido el 07/10/2026, sacar D30O6 del ajuste mueve la curva 4,1 pp en su
propio plazo, 0,8 pp a seis meses y −1,3 pp a dos años (R² 0,40 con, 0,67
sin). La forma logarítmica describe mal esta curva: el tramo corto viene de
4,9% a 1,5% y los dos papeles de 2028 saltan a 10,6–11,5%.

## Una sola rueda para los cuatro insumos

Bonos, LECAPs, spot de A3 y futuros de A3 salen del cierre de la última
rueda terminada, como el breakeven: con el mercado abierto, el de ayer. Si a
esa rueda le falta alguno no se mezclan fechas: se baja a la anterior en que
estén los cuatro, y `insumos` en la respuesta dice de qué rueda es cada uno.

| insumo | fuente | cierra | disponible |
|---|---|---|---|
| bonos dólar linked | BYMA | 17:00 | 17:20 (feed con 20 min de retraso) |
| LECAP / BONCAP | BYMA | 17:00 | 17:20 |
| mayorista | A3, mercado de cambios | 15:00 | en la API de A3 a la noche |
| futuros DLR | A3 (ex Matba Rofex), precio de ajuste | 15:00 | en la API de A3 a la noche |
| A3500 | BCRA | — | en la API el mismo día |

**Desfasaje:** spot y futuros son de las 15:00 y los bonos de las 17:00. Lo
que se mueva el dólar en esas dos horas queda en los precios de los bonos y
no en el spot. No hay un mayorista a las 17: el mercado de cambios ya cerró.

La API de cierres de A3 devuelve como mucho 100 filas sin avisar que cortó;
con doce contratos por rueda se pide de a una semana.
