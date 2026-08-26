#!/usr/bin/env bash

# Keep the published Autoscale deployment warm only during notification windows.
# The workflow itself stays alive between windows so it is ready for the next one.
set -u

readonly PRODUCTION_HEALTH_URL="https://circles-by-bridges.replit.app/api/health"
readonly POLL_SECONDS=300

while true; do
  now="$(TZ=America/Toronto date -Iseconds)"
  hour_text="$(TZ=America/Toronto date +%H)"
  minute_text="$(TZ=America/Toronto date +%M)"
  hour=$((10#$hour_text))
  minute=$((10#$minute_text))
  local_minutes=$((hour * 60 + minute))

  # Start inclusive, end exclusive:
  #   morning   08:30–09:30
  #   afternoon 16:30–17:30
  if (( (local_minutes >= 510 && local_minutes < 570) ||
        (local_minutes >= 990 && local_minutes < 1050) )); then
    echo "$now pinging production health"
    if curl --fail --silent --show-error --location --max-time 20 "$PRODUCTION_HEALTH_URL"; then
      echo
      echo "$now production health OK"
    else
      echo "$now production health unavailable; retrying in five minutes" >&2
    fi
  else
    echo "$now outside notification window; sleeping until next check"
  fi

  sleep "$POLL_SECONDS"
done