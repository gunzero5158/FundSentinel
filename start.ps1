$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw '请先安装 Node.js 22 或更高版本。' }
if (-not (Test-Path -LiteralPath 'node_modules')) { npm ci; if ($LASTEXITCODE -ne 0) { throw '依赖安装失败。' } }
if (-not (Test-Path -LiteralPath '.next\BUILD_ID')) { npm run build; if ($LASTEXITCODE -ne 0) { throw '构建失败。' } }
Write-Host '净值哨兵 FundSentinel 0.2.0 — http://127.0.0.1:3000' -ForegroundColor Green
npm start
