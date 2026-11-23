$ErrorActionPreference = 'Stop'
docker compose -f "$PSScriptRoot/../compose.yaml" up --build --detach --wait
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Output 'Fieldwork is ready at http://127.0.0.1:8000/'
