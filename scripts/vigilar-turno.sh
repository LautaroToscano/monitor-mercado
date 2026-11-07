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
# Mails: casi ninguno (pedido del usuario, 07/11/2026: "la idea era
# automatizar todo"). Antes cada aviso era un issue que se abría, comentaba
# cada cambio y se cerraba solo, y cada paso era un mail: cinco en dos días
# por un mantenimiento que no rompía nada. Ahora:
#
#  - Hay UN issue fijo, "Estado de producción" (etiqueta `estado`), que no
#    se cierra nunca. Cada vuelta le reescribe el cuerpo con el informe, y
#    editar un cuerpo no manda mail. Ahí queda también el mantenimiento, que
#    se lee al empezar cada chat (hook de inicio), no por mail.
#  - Manda UN mail —un comentario que menciona al dueño— sólo cuando el
#    sitio se ve mal (un control con ✗) VUELTAS_FALLA vueltas seguidas. No
#    vuelve a mandar mientras siga mal, ni cuando se arregla: con
#    VUELTAS_FALLA vueltas sanas el estado vuelve a "en orden" en silencio.
#
# Variables: GH_TOKEN, CORRIDA (link a la corrida), BASE (opcional, otra
# dirección a vigilar), DURACION_MIN (0 = una sola vuelta), INTERVALO_MIN.
set -u

DURACION_MIN=${DURACION_MIN:-0}
INTERVALO_MIN=${INTERVALO_MIN:-10}
VUELTAS_FALLA=${VUELTAS_FALLA:-3}
fin=$(( $(date +%s) + DURACION_MIN * 60 ))

gh label create estado --color 0E8A16 --description 'Estado de producción, lo escribe el vigilante' --force > /dev/null

# El issue fijo; si no existe se crea (es la única vez que se crea uno).
issue=$(gh issue list --label estado --state open --json number -q '.[0].number')
if [ -z "$issue" ]; then
  issue=$(gh issue create --title 'Estado de producción' --label estado \
    --body '<!-- incidente: no -->' | grep -oE '[0-9]+$')
fi

# El cuerpo: la marca del incidente, una línea de estado y el informe.
escribir() {
  local incidente=$1 cuerpo
  cuerpo=$(printf '<!-- incidente: %s -->\n%s\n\nActualizado %s UTC · [corrida](%s)\n\n%s\n' \
    "$incidente" \
    "$([ "$incidente" = si ] && echo '**✗ Con problemas** (se avisó por mail)' || echo '**✓ En orden**')" \
    "$(date -u '+%d/%m %H:%M')" "$CORRIDA" "$(cat informe.md)")
  gh issue edit "$issue" --body "$cuerpo" > /dev/null
}

# Lo que importa del informe: si cambia, se reescribe el cuerpo.
importante() { grep -E '^- (✗|⚠|🔧)' "${1:-informe.md}" | sed -E 's/[0-9]{1,2}\/[0-9]{1,2}, [0-9]{2}:[0-9]{2}//g' || true; }

con_falla=0
sin_falla=0
vuelta=0
while :; do
  vuelta=$((vuelta + 1))
  # El resumen de la corrida se escribe una vez, al final, no en cada vuelta.
  if GITHUB_STEP_SUMMARY='' npm run -s vigilar -- ${BASE:+--base=$BASE} > informe.md 2>&1; then falla=''; else falla=1; fi
  echo "── vuelta $vuelta, $(date -u +%H:%M) UTC: $([ -n "$falla" ] && echo 'con fallas' || echo 'en orden')"
  [ -n "$falla" ] && cat informe.md

  if [ -n "$falla" ]; then con_falla=$((con_falla + 1)); sin_falla=0; else sin_falla=$((sin_falla + 1)); con_falla=0; fi

  # Un error de GitHub al escribir el estado no corta la guardia.
  {
    gh issue view "$issue" --json body -q .body > previo.md
    incidente=$(grep -oE 'incidente: (si|no)' previo.md | cut -d' ' -f2)
    incidente=${incidente:-no}
    if [ "$incidente" = no ] && [ "$con_falla" -ge "$VUELTAS_FALLA" ]; then
      gh issue comment "$issue" --body "$(printf '@LautaroToscano el sitio se ve mal desde hace %s minutos.\n\n%s\n\n[Estado al día](%s)' \
        "$(( VUELTAS_FALLA * INTERVALO_MIN ))" "$(grep -E '^- ✗' informe.md)" "$(gh issue view "$issue" --json url -q .url)")" > /dev/null
      escribir si
    elif [ "$incidente" = si ] && [ "$sin_falla" -ge "$VUELTAS_FALLA" ]; then
      escribir no
    elif [ "$(importante informe.md)" != "$(importante previo.md)" ]; then
      escribir "$incidente"
    fi
  } || true

  [ "$(date +%s)" -ge "$fin" ] && break
  sleep $(( INTERVALO_MIN * 60 ))
done

# La última vuelta queda en el resumen de la corrida.
cat informe.md >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
