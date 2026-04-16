#!/bin/sh
set -e
cd /app
if [ ! -d node_modules ]; then
  npm ci
fi
exec "$@"
