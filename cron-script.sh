#!/bin/sh
apk add --no-cache curl

WATCH_INTERVAL=21600
MEETING_BRIEFS_INTERVAL=900
LAST_WATCH=0

while true; do
  NOW=$(date +%s)

  echo "[cron] Processing meeting briefs..."
  curl -s -X GET 'http://inbox-zero-web:3000/api/meeting-briefs' \
    -H "Authorization: Bearer $CRON_SECRET" || echo "[cron] Warning: meeting-briefs request failed"

  if [ $((NOW - LAST_WATCH)) -ge $WATCH_INTERVAL ]; then
    echo "[cron] Renewing email watches..."
    curl -s -X GET 'http://inbox-zero-web:3000/api/watch/all' \
      -H "Authorization: Bearer $CRON_SECRET" || echo "[cron] Warning: watch request failed"
    LAST_WATCH=$NOW
  fi

  echo "[cron] Sleeping for 15 minutes..."
  sleep $MEETING_BRIEFS_INTERVAL
done
