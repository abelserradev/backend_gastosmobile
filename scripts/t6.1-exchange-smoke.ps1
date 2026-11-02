# T6.1 — Exchange API smoke (no Gastos DB required).
# Usage:
#   .\scripts\t6.1-exchange-smoke.ps1
#   .\scripts\t6.1-exchange-smoke.ps1 -BaseUrl https://exchange.tudominio.com
param(
  [string]$BaseUrl = "http://localhost:3010",
  [string]$ServiceKey = $env:EXCHANGE_SERVICE_KEY,
  [string]$ConsumerUser = "smoke-user-t6.1"
)

$ErrorActionPreference = "Stop"
$BaseUrl = $BaseUrl.TrimEnd("/")

Write-Host "T6.1 Exchange smoke → $BaseUrl"

$tasas = Invoke-RestMethod -Uri "$BaseUrl/api/v1/tasas" -TimeoutSec 45
if (-not $tasas.oficial.valor) {
  throw "GET /api/v1/tasas: missing oficial.valor"
}
Write-Host "OK tasas oficial=$($tasas.oficial.valor) paralelo=$($tasas.paralelo.valor)"

$offer = @{
  metodos           = @("efectivo", "electronico", "bs")
  precioUsd         = "380"
  precioBs          = @{ modo = "monto_bs"; monto = "391400" }
  comisionElectronicoPct = 3
  producto          = "T6.1 smoke"
} | ConvertTo-Json -Depth 6

$headers = @{ Accept = "application/json"; "Content-Type" = "application/json" }
if ($ServiceKey) {
  $headers.Authorization = "Bearer $ServiceKey"
  $headers["X-Consumer-User"] = $ConsumerUser
  Write-Host "POST comparaciones (consumer Gastos simulado)…"
} else {
  Write-Host "POST comparaciones (anonimo; sin EXCHANGE_SERVICE_KEY en env)…"
}

$cmp = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/v1/comparaciones" -Body $offer -Headers $headers -TimeoutSec 45
if ($cmp.version -ne "v1" -or -not $cmp.mejores) {
  throw "POST /api/v1/comparaciones: unexpected payload"
}
Write-Host "OK comparacion mejores=$($cmp.mejores -join ',') ahorroUsd=$($cmp.ahorroUsd) opciones=$($cmp.opciones.Count)"

Write-Host "T6.1 Exchange smoke passed."
