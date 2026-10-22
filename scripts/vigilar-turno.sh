#!/usr/bin/env bash
# Un turno de guardia del vigilante (lo corre .github/workflows/vigilar.yml).
#
# GitHub no garantiza los horarios programados: con un cron de media hora,
# el 15/10/2026 el vigilante corrió 5 veces en 20 horas. En vez de depender
# de que arranque a tiempo, cada corrida se queda de guardia DURACION_MIN
# minutos revisando el sitio cada INTERVALO_MIN, y al terminar arranca la
# siguiente (el workflow tiene una en espera). Sin cuentas ni servicios
# externos: en un repo público los minutos de Actions no se cobran.
#
# En cada vuelta corre scripts/vigilar.ts y maneja dos avisos (issues) con
# la misma mecánica: "caida" (algo se ve mal o no responde) y
# "mantenimiento" (algo pide una mano). Se abren con la primera falla y
# mencionan al dueño (eso manda el mail), comentan sólo si cambia lo que
# falla y se cierran solos cuando se resuelve.
#
# Variables: GH_TOKEN, CORRIDA (link a la corrida), BASE (opcional, otra
# dirección a vigilar), DURACION_MIN (0 = una sola vuelta), INTERVALO_MIN.
set -u

DURACION_MIN=${DURACION_MIN:-0}
INTERVALO_MIN=${INTERVALO_MIN:-10}
fin=$(( $(date +%s) + DURACION_MIN * 60 ))

gh label create caida --color B60205 --description 'El vigilante encontró un problema en producción' --force > /dev/null
gh label create mantenimiento --color FBCA04 --description 'Algo del proyecto pide una mano' --force > /dev/null

# gestionar <etiqueta> <título> <marca de línea> <intro> <hay: 1 o vacío>
gestionar() {
  local etiqueta=$1 titulo=$2 marca=$3 intro=$4 hay=$5 abierto lineas previas
  abierto=$(gh issue list --label "$etiqueta" --state open --json number -q '.[0].number')
  lineas=$(grep "^- $marca" informe.md || true)
  if [ -n "$hay" ]; then
    if [ -z "$abierto" ]; then
      gh issue create --title "$titulo" --label "$etiqueta" \
        --body "$(printf '@LautaroToscano %s\n\n%s\n\nCorrida: %s\n\nSe cierra solo cuando se resuelve.' "$intro" "$(cat informe.md)" "$CORRIDA")"
    else
      previas=$(gh issue view "$abierto" --json body,comments -q '([.body] + [.comments[].body]) | last' | grep "^- $marca" || true)
      if [ "$lineas" != "$previas" ]; then
        gh issue comment "$abierto" --body "$(printf 'Cambió:\n\n%s\n\nCorrida: %s' "$(cat informe.md)" "$CORRIDA")"
      fi
    fi
  elif [ -n "$abierto" ]; then
    gh issue comment "$abierto" --body "$(printf 'Resuelto.\n\n%s\n\nCorrida: %s' "$(cat informe.md)" "$CORRIDA")"
    gh issue close "$abierto"
  fi
}

VUELTAS_MANTENIMIENTO=${VUELTAS_MANTENIMIENTO:-3}
con_mant=0
sin_mant=0
vuelta=0
while :; do
  vuelta=$((vuelta + 1))
  # El resumen de la corrida se escribe una vez, al final, no en cada vuelta.
  if GITHUB_STEP_SUMMARY='' npm run -s vigilar -- ${BASE:+--base=$BASE} > informe.md 2>&1; then falla=''; else falla=1; fi
  echo "── vuelta $vuelta, $(date -u +%H:%M) UTC: $([ -n "$falla" ] && echo 'con fallas' || echo 'en orden')"
  [ -n "$falla" ] && cat informe.md

  # Un error de GitHub al manejar los avisos no corta la guardia.
  gestionar caida 'Producción con problemas' '✗' 'el vigilante encontró problemas en producción.' "$falla" || true
  # Con el sitio caído no se sabe si el mantenimiento sigue pendiente: se
  # deja como está hasta la próxima vuelta sana.
  #
  # El mantenimiento no es urgente, así que se confirma antes de avisar: el
  # aviso se abre (o cambia) recién cuando lo mismo aparece en
  # VUELTAS_MANTENIMIENTO vueltas seguidas, y se cierra con otras tantas
  # limpias. Sin esto, algo intermitente abría y cerraba el aviso cada 20
  # minutos, con un mail por cada paso (TVSJ1, octubre de 2026).
  if [ -z "$falla" ]; then
    if grep -q '^- 🔧' informe.md; then
      con_mant=$((con_mant + 1)); sin_mant=0
    else
      sin_mant=$((sin_mant + 1)); con_mant=0
    fi
    if [ "$con_mant" -ge "$VUELTAS_MANTENIMIENTO" ]; then
      gestionar mantenimiento 'Mantenimiento pendiente' '🔧' 'hay algo del proyecto que pide una mano.' 1 || true
    elif [ "$sin_mant" -ge "$VUELTAS_MANTENIMIENTO" ]; then
      gestionar mantenimiento 'Mantenimiento pendiente' '🔧' 'hay algo del proyecto que pide una mano.' '' || true
    fi
  fi

  [ "$(date +%s)" -ge "$fin" ] && break
  sleep $(( INTERVALO_MIN * 60 ))
done

# La última vuelta queda en el resumen de la corrida.
cat informe.md >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
