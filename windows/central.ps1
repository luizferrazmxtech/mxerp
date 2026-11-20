# Liga a Central de revenda no PC para testes (http://localhost:3100). Os dados ficam num banco separado ("central").
# Criar cliente, backup e restaurar pela Central só funcionam na VPS: aqui as tarefas ficam "pendentes".
$ErrorActionPreference = "Continue"
Set-Location (Split-Path -Parent $PSScriptRoot)
$envTxt = Get-Content .env -Raw
if ($envTxt -notmatch "(?m)^COMPOSE_PROFILES=") { Add-Content .env "`r`n# liga a Central de revenda (teste no PC)`r`nCOMPOSE_PROFILES=central" }
docker compose up -d db
docker compose exec -T db sh -c "psql -U mxerp -d mxerp -tAc \"select 1 from pg_database where datname='central'\" | grep -q 1 || createdb -U mxerp central"
docker compose up -d --build central
if ($LASTEXITCODE -ne 0) { Write-Host "A Central nao subiu. Veja: docker compose logs central --tail 50" -ForegroundColor Red; exit 1 }
Write-Host "Central no ar: http://localhost:3100 (a primeira tela cria o administrador)" -ForegroundColor Green
