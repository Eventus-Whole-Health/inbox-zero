#!/bin/sh
set -e

echo "Installing Redis..."
apk add --no-cache redis curl wget

echo "Starting Redis server..."
redis-server --bind 127.0.0.1 --port 6379 --requirepass "${REDIS_PASSWORD}" --daemonize yes

echo "Waiting for Redis to start..."
sleep 2

echo "Downloading serverless-redis-http..."
wget -q -O /usr/local/bin/redis-http https://github.com/hiett/serverless-redis-http/releases/download/v0.1.0/serverless-redis-http-linux-amd64
chmod +x /usr/local/bin/redis-http

echo "Starting HTTP proxy on port 80..."
exec SRH_MODE=env \
  SRH_TOKEN="${REDIS_TOKEN}" \
  SRH_CONNECTION_STRING="redis://default:${REDIS_PASSWORD}@127.0.0.1:6379" \
  /usr/local/bin/redis-http
