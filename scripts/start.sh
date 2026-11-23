#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
docker compose -f compose.yaml up --build --detach --wait
echo 'Fieldwork is ready at http://127.0.0.1:8000/'
