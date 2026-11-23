$ErrorActionPreference = 'Stop'
docker compose -f "$PSScriptRoot/../compose.yaml" down
exit $LASTEXITCODE
