# TAMAR

Curva de los títulos del Tesoro que pagan TAMAR. Volver al [README](../README.md).

## Qué papeles

Bonos y letras TAMAR (TMF27, TML27, TMG27, TMF28, TMG28), los duales
CER / TAMAR (TXMJ8, TXMD8, TXMJ9, TXMD9, TXMJ0), el dual TAMAR / dólar
linked (TMVE8) y el dual tasa fija / TAMAR (TTD26). El universo es dinámico:
entra cualquier especie del Gobierno Nacional cuya ficha de BYMA nombre la
TAMAR, pero sólo si sus condiciones están cargadas en
`src/lib/universes/tamar-condiciones.ts`. El margen no está en la ficha y no
se asume: un TAMAR nuevo sin condiciones queda en `warnings` para cargarlo.
Precios de los mismos dos paneles de BYMA que las otras curvas. El universo
se confirmó el 13/10/2026 contra la ficha de BYMA y el detalle diario de A3.

Los TXM están también en la curva CER, con su pata CER, y TMVE8 en dólar
linked, con su pata dólar. Acá van con su pata TAMAR.

## Condiciones

Cada una verificada en la norma de emisión del Boletín Oficial; el margen,
en el resultado de la licitación de la Secretaría de Finanzas (con el link
en el código). Todas dicen lo mismo de la tasa:

- **Qué TAMAR:** promedio aritmético simple de la TAMAR de bancos privados,
  en TNA (BCRA, variable 136), publicada desde diez hábiles antes de la
  emisión hasta diez hábiles antes del vencimiento. La 137 es la TEA de esa
  misma tasa, la conversión ya hecha y sin margen: no se usa.
- **Cómo pasa a mensual:** TAMAR TEM = ((1 + (TAMAR + margen) × 32/365)^(365/32))^(1/12) − 1.
- **Cómo paga:** capitaliza mensualmente sobre 30/360 y amortiza todo al
  vencimiento. VPV = VNO × (1 + TAMAR TEM)^(días30/360 / 30).

| papel | norma | margen |
|---|---|---|
| TMF27 | RC 9/2026 | 6,50% (licitación 11/02/2026) |
| TML27 | RC 36/2026 | 5,40% (26/06/2026) |
| TMG27 | RC 16/2026 | 6,00% (27/03/2026) |
| TMF28 | RC 21/2026 | 6,50% (conversión 15/04/2026) |
| TMG28 | RC 23/2026 | 6,90% (28/04/2026) |
| TXM* | RC 25, 23 y 32/2026 | 3% (norma) |
| TMVE8 | RC 46/2026 | sin margen; base VN USD × A3500 del 28/07/2026 |
| TTD26 | RC 4/2025 | sin margen; la pata fija paga 2,14% TEM |

Dos fechas de la ficha de BYMA están mal y manda la norma: TMF28 vence el
25/02/2028 (la ficha dice 15/02) y TMG27 se emitió el 01/04/2026 (la ficha
dice 31/03). A3 describe TMG27 como "31/07/2027": vence el 31/08/2027.

## Rendimiento

Con la **TAMAR de hoy constante hasta el vencimiento**. El promedio que
paga el bono se arma con los días ya publicados, cada uno con su valor, y
la última TAMAR publicada para los hábiles que faltan. Con eso sale el pago
proyectado y:

    TIR = (pago proyectado / precio)^(365/días) − 1

Actual/365, días desde la liquidación T+1, TEM con exponente 30/días. En
los duales es la TIR de la pata TAMAR, un piso: el precio incluye la opción
de cobrar la otra.

**La TAMAR de un día sale el hábil siguiente.** El 13/10/2026 a las 23:13 el
último dato publicado era el del 09/10. Por eso entran sólo las anteriores a
la rueda de los precios, en vivo y al rehacer la historia: es lo que se
sabía ese día. La cabecera muestra cuál se está proyectando.

**Valor técnico y paridad.** El valor técnico es lo devengado a la
liquidación: VNO capitalizado al promedio de la TAMAR publicada hasta diez
hábiles antes de la liquidación más el margen. Paridad = precio / valor
técnico.

Los títulos que promedian TAMAR después de 2028 (TXMJ9, TXMD9, TXMJ0) cuentan
los feriados de esos años como hábiles, porque no están cargados. Va en
`warnings`; mueve apenas el peso de los días proyectados en el promedio.

## Contra la página de referencia

El 13/10/2026 se comparó con la tabla de una página de mercado que mandó el
usuario. Con el mismo dato de TAMAR las TIR coinciden: seis de nueve
idénticas, TMF27 a −0,03 pp, TMVE8 a −0,07 y TMG27 a +0,07. Despejando el
margen que reproduce cada TIR salen los de la licitación (6,51 / 5,40 / 6,50
/ 3,00 / 6,90...), así que la fórmula, los márgenes y el rezago son los
mismos. La diferencia de ese día venía de que la página proyectaba la TAMAR
del 08/10 (24,125%): la del 09/10 todavía no había salido.

Lo que no cierra:

- **TMG27** pide un margen de 5,965% contra el 6% publicado. Contar el 31/08
  como día 30 (30E/360) tampoco lo explica: da 30,72% contra 30,77%.
- **TMVE8** pide un tipo de cambio inicial de 1.500,88 contra el A3500 del
  28/07, 1.499,84.
- **Paridad:** la de la página es más alta en todos, de 0,06 a 1,7 pp, y la
  diferencia crece con el margen y el tiempo desde la emisión. Ninguna
  variante probada la reproduce. Se dejó la de la norma (decisión del
  usuario, 13/10/2026).
- **Duration:** la página cuenta el plazo desde la fecha de operación; acá,
  desde la liquidación. Difiere a veces en el segundo decimal.

## La curva

**Parábola**, `TIR = a + b · x + c · x²`, contra la **duration de Macaulay**
en años (son todos cero cupón: es el plazo). Como la página de referencia.
Entran al ajuste todos los papeles **menos TTD26**, que se dibuja hueco y
aparte: no tiene margen, vence en dos meses y tiraba el tramo corto tres
puntos para abajo (decisión del usuario, 13/10/2026). Se dibuja sólo entre
el primer y el último papel, sin extrapolar, y con menos de cuatro no se
dibuja.

Probada sobre la historia de la serie de BYMA (09/2025 a 10/2026, 210 ruedas
con cuatro papeles puros o más), con medianas:

| entran al ajuste | modelo | eje | distancia a los papeles | salto a 1 año |
|---|---|---|---|---|
| sólo los puros | logarítmica | modificada | 1,67 pp | 0,38 pp |
| sólo los puros | parábola | modificada | 1,06 pp | 0,47 pp |
| todos menos TTD26 | parábola | modificada | 0,84 pp | 0,40 pp |
| **todos menos TTD26** | **parábola** | **Macaulay** | **0,81 pp** | **0,38 pp** |
| todos con TTD26 | parábola | Macaulay | 0,87 pp | 0,65 pp |

La parábola queda a la mitad de distancia de los papeles que la
logarítmica (en 2026, 0,61 contra 1,40 pp). Con los duales la curva llega
a 2030 en vez de terminar en TMG28.

## La pantalla

Curva y tabla en vivo, como las otras. La cabecera muestra la TAMAR que se
proyecta y su fecha. La tabla lleva duration, precio, variación, TEM, TIR,
margen, valor técnico y paridad; los duales van con la etiqueta "Dual" en
tinta y en el título dicen qué pagan.

## Historia

Rehecha desde 04/2025 con la serie de BYMA guardada. Además de los vigentes
entran los vencidos con TAMAR, con sus condiciones en el mismo archivo:
siete letras (M31L5, M10N5, M16E6, M15D5, M27F6, M31G6, M30A6, con márgenes
de 1,5% a 7,5%) y los tres duales TTM26, TTJ26 y TTS26 de la RC 4/2025.
M28N5 no entra: su serie de BYMA no tiene ningún precio (operó sólo en A3) y
no se mezclan fuentes. La imagen de la fórmula de M15D5 en la norma es
ilegible en el exponente; el resto del artículo es igual al de las otras.

`npm run validate:tamar` imprime la tabla con cada condición y el ajuste.
