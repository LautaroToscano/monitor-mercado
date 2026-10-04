# Arquitectura

Dónde vive cada cosa. Volver al [README](../README.md).

## Rutas

    /                              redirige al primer universo
    /tasa-fija, /tasa-cer          tablero de cada curva
    GET /api/universe              catálogo de universos
    GET /api/universe/[slug]       un universo completo, ya calculado
    GET /api/breakeven             inflación breakeven por mes INDEC

Los avisos de cada cálculo viajan en el campo `warnings` de la respuesta; en
pantalla no se muestran.

## Código

    src/lib/conventions.ts        convenciones de cálculo: único lugar donde viven
    src/lib/pricing/              valuación: cero cupón a tasa fija y títulos CER
    src/lib/ajuste.ts             curva ajustada (logarítmica; Nelson-Siegel para comparar)
    src/lib/breakeven.ts          inflación breakeven
    src/lib/quality.ts            reglas de calidad del dato
    src/lib/build.ts              orquestador: fuente + referencia + cálculo + calidad
    src/lib/historico.ts          fotos de cierre
    src/lib/cache.ts              cache en proceso y cortacircuitos
    src/lib/sources/              BYMA, BCRA, INDEC, Secretaría de Finanzas
    src/lib/universes/            registro de universos y clasificación de especies
    src/lib/reference/            especies vigentes, generado y versionado
    src/lib/format.ts, escala.ts  formateo y geometría de los gráficos (ningún cálculo)
    src/app/api/                  endpoints
    src/app/[universe]/           tablero, con el universo como parámetro de ruta
    src/components/               curva, tabla, panel de breakeven, selectores

Para sumar una curva: generar su referencia, escribir su `UniverseDefinition`
y registrarla en `src/lib/universes/index.ts`. Ni los endpoints ni el
frontend cambian.

## Velocidad

- **Breakeven guardado.** Calcularlo en frío son cuarenta series de BYMA, el
  CER y el IPC: unos diez segundos. El proceso diario lo guarda en
  `public/historico/breakeven/` y el endpoint sirve ese archivo cuando es el
  de la última rueda terminada; entre el cierre y el proceso diario lo
  calcula como siempre.
- **Último cierre guardado.** Con el mercado cerrado cada curva sale de la
  serie histórica de BYMA, un pedido por papel: en frío, 2,5 s tasa fija y
  8 s la CER. El proceso diario deja la respuesta completa de cada curva en
  `public/historico/ultimo/`, y fuera de rueda el endpoint la sirve si es de
  la última rueda terminada (`src/lib/ultimo-cierre.ts`). Con la rueda
  abierta, siempre en vivo.
- **CDN con `stale-while-revalidate`.** Vencido el cache, el CDN sirve la
  última respuesta en el acto y la renueva por detrás: diez minutos para las
  curvas, un día para el breakeven, que cambia una vez por rueda.
- **Pestañas sin recarga.** Se navega con `next/link` y lo traído queda en
  memoria (`src/lib/pedidos.ts`): volver a una curva la dibuja en el acto y
  la refresca por detrás. Con una curva en pantalla se precargan las otras y
  el breakeven, y en la CER el breakeven se pide junto con la curva, no
  después.

## Comandos de validación

| comando | qué hace |
|---|---|
| `npm run validate` | corre el pipeline de tasa fija e imprime una tabla |
| `npm run validate -- --json` | JSON crudo del endpoint |
| `npm run validate -- --universe=tasa-cer` | la curva CER, con el detalle del ajuste por CER |
| `npm run validate:breakeven` | tabla del breakeven por mes INDEC |
| `npm run validate:modelos` | logaritmo contra Nelson-Siegel sobre la historia guardada |
| `npm run historico:reconstruir -- --desde=AAAA-MM-DD --hasta=AAAA-MM-DD` | rehace fotos de días pasados |

## Procesos automáticos

GitHub Actions corre dos tareas y sube el resultado si cambió algo:

- **Guardar cierre**, de lunes a viernes a las 18:00: la foto de cada curva,
  la respuesta completa del último cierre y el breakeven de esa rueda.
- **Refrescar referencia**, lunes y jueves: las especies vigentes según BYMA.
