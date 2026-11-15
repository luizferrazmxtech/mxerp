# Restaura uma copia da pasta backups. APAGA os dados atuais do sistema e coloca os da copia.
param([Parameter(Mandatory = $true)][string]$Arquivo)
# "Continue": o docker escreve progresso no stderr, e com "Stop" o PowerShell 5 trataria isso como erro
$ErrorActionPreference = "Continue"
Set-Location (Split-Path -Parent $PSScriptRoot)
$nome = Split-Path -Leaf $Arquivo
if (-not (Test-Path "backups\$nome")) { Write-Host "Coloque o arquivo na pasta backups e informe so o nome." -ForegroundColor Red; exit 1 }
$ok = Read-Host "Isto substitui TODOS os dados atuais pelos da copia $nome. Digite RESTAURAR para continuar"
if ($ok -ne "RESTAURAR") { Write-Host "Cancelado."; exit 0 }
docker compose stop app agendador
docker compose exec -T backup sh -c "pg_restore -h db -U mxerp -d mxerp --clean --if-exists --no-owner /backups/$nome"
docker compose start app agendador
Write-Host "Restaurado." -ForegroundColor Green
