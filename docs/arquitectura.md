# Arquitectura

Dónde vive cada cosa. Volver al [README](../README.md).

## Rutas

    /                              redirige al primer universo
    /tasa-fija, /tasa-cer,
    /dolar-linked, /tamar          tablero de cada curva
    GET /api/universe              catálogo de universos
    GET /api/universe/[slug]       un universo completo, ya calculado
    GET /api/breakeven             inflación breakeven por mes INDEC
    GET /api/devaluacion           devaluación implícita (futuros y bonos), sin pantalla todavía

Los avisos de cada cálculo viajan en el campo `warnings` de la respuesta; en
pantalla no se muestran.

## Código

    src/lib/conventions.ts        convenciones de cálculo: único lugar donde viven
    src/lib/pricing/              valuación: tasa fija, CER, dólar linked y TAMAR
    src/lib/ajuste.ts             curva ajustada (logarítmica; Nelson-Siegel para comparar)
    src/lib/breakeven.ts          inflación breakeven
    src/lib/quality.ts            reglas de calidad del dato
    src/lib/build.ts              orquestador: fuente + referencia + cálculo + calidad
    src/lib/historico.ts          fotos de cierre
    src/lib/cache.ts              cache en proceso y cortacircuitos
    src/lib/devaluacion.ts        devaluación implícita de futuros y de bonos
    src/lib/sources/              BYMA, BCRA (CER, A3500, TAMAR), INDEC, A3, Secretaría de Finanzas
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
| `npm run validate:dolar-linked` | curva dólar linked, A3 contra A3500 y devaluación implícita |
| `npm test` | tests: convenciones, fórmulas y el cierre congelado del 13/10/2026 |
| `npm run vigilar` | revisa producción (o `-- --base=URL`) y falla si algo no está bien |
| `npm run validate:tamar` | curva TAMAR: condiciones de cada papel, TAMAR proyectada, valor técnico y ajuste |
| `npm run validate:modelos` | logaritmo contra Nelson-Siegel sobre la historia guardada |
| `npm run historico:ajustes` | factores para deshacer el ajuste por pagos de la serie de BYMA |
| `npm run historico:resguardar` | guarda en `data/series/` la serie de BYMA de todos los papeles de los últimos dos años |
| `npm run historico:reconstruir -- --desde=AAAA-MM-DD --hasta=AAAA-MM-DD` | rehace fotos de días pasados |

## Que no se rompa

Las fuentes fallan de maneras que ningún control previo anticipa (el
14/10/2026 BYMA devolvió el panel a medias mientras rotaba de sesión y la
curva TAMAR salió con un papel). En vez de un arreglo por caso, tres capas:

1. **Nunca se sirve una curva rota** (`src/lib/respaldo.ts`). Si a la
   respuesta recién calculada le falta el rendimiento de una parte de la
   curva (dos papeles o el 20%, lo que sea más) que la última respuesta
   completa sí tenía, se sirve esa última completa —la de la memoria de la
   instancia o el último cierre guardado, de hasta una semana—, con su
   propia rueda y su hora, y el motivo va a `warnings` ("Respuesta de
   respaldo: ..."). Si el cálculo falla entero, lo mismo en vez de un 502.
   Un papel suelto sin dato sale marcado como siempre: congelar la curva
   por él sería peor. Lo mismo para el breakeven, con el último guardado.
   Una respuesta degradada se retiene 15 segundos en el CDN, no diez
   minutos.
2. **Un vigilante de guardia continua** (`npm run vigilar`, `vigilar.yml`,
   `scripts/vigilar-turno.sh`): revisa cada 10 minutos. GitHub no garantiza
   los horarios programados (con un cron de media hora corrió 5 veces en 20
   horas), así que cada corrida se queda de guardia 5 h 30 min y la
   siguiente espera en fila; en un repo público no tiene costo.
   Revisa producción como un visitante: cada curva completa, con TIR
   posibles y de la rueda que corresponde (en rueda la de hoy; cerrada, a
   lo sumo un hábil de atraso), las páginas, el breakeven y que la foto
   diaria esté (desde el mediodía del día siguiente). Cada control se
   reintenta una vez. Una respuesta de respaldo se informa sin fallar.
3. **El aviso llega solo.** Ante una falla el vigilante abre un issue con
   la etiqueta `caida` que menciona al dueño (eso manda el mail), comenta
   sólo si cambia lo que falla y lo cierra cuando todo se normaliza.

## Control de cambios

- **Tests** (`npm test`, `test/`), con el `node:test` de Node, sin
  dependencias. Lo central es `cierre-congelado.test.ts`: el cierre del
  13/10/2026 de las cuatro curvas, validado a mano, congelado en
  `test/fixtures/`; el test recalcula la TIR de los 59 papeles desde su
  precio con el código de hoy y falla si una se mueve en la novena cifra.
  Si una convención cambia a propósito, se regenera el congelado sabiendo
  por qué. Además: convenciones y calendario, la TAMAR TEM contra la TEA que
  publica el BCRA (variable 137), los ajustes, la regla del panel a medias,
  los casos del respaldo y que todo endpoint use las protecciones.
- **CI** (`ci.yml`) en cada push a main y cada pull request: tipos, tests,
  build y `npm audit` sin vulnerabilidades altas. Vercel publica en
  paralelo: un commit en rojo hay que corregirlo enseguida.
- **Dependabot**: alertas y actualizaciones de seguridad automáticas, y una
  revisión semanal (lunes 08:00) de npm y de las acciones, agrupada. Las
  propuestas que pasan el CI se aplican solas (`dependabot-auto.yml`,
  decisión del usuario del 15/10/2026); las versiones mayores quedan para
  hacer a mano.
- **CodeQL** analiza el código en cada cambio (configuración por defecto de
  GitHub).
- **Mantenimiento**: el vigilante junta los avisos que piden una acción (un
  título que no se pudo incorporar o sin sus condiciones, la TAMAR que dejó
  de publicarse, los feriados del año que viene desde octubre) y abre un
  issue `mantenimiento`, aparte del de caídas.

## Seguridad

- **La API no recibe parámetros.** Un pedido con `?algo` da 400 antes de
  calcular nada (`src/lib/api.ts`): si no, cualquiera se salteaba el cache
  del CDN y obligaba a recalcular, con pedidos a BYMA, que bloquea por IP.
- **Los archivos guardados se leen del dominio del proyecto**
  (`VERCEL_PROJECT_PRODUCTION_URL`), no de la dirección que trae el pedido.
- **Encabezados** (`next.config.mjs`): CSP que sólo deja cargar lo del
  propio sitio, prohibido meter la página en un iframe, nosniff,
  Referrer-Policy y ningún permiso del navegador. HSTS lo pone Vercel.
- **Workflows** con las acciones fijadas por SHA, permisos mínimos y
  `git pull --rebase` antes de subir, para que dos procesos no se pisen.
- **Dependencias:** `npm audit` en cero al 15/10/2026 (Next 16.4.1).

## Procesos automáticos

GitHub Actions corre estas tareas; las dos primeras suben el resultado si cambió algo:

- **Guardar cierre**, de lunes a viernes a las 18:00 y otra vez a las 07:00
  del día siguiente: la foto de cada curva, la respuesta completa del último
  cierre y el breakeven de esa rueda.
- **Refrescar referencia**, lunes y jueves: las especies vigentes según BYMA.
- **Vigilar producción**, guardia continua cada 10 minutos: ver "Que no se rompa".
- **CI** en cada push y pull request, y **CodeQL** en cada cambio.
