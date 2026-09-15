# Compatibility helper: builds Website and points to the shared deployment guide.
# Git operations and production deployment are intentionally handled separately.
param([string]$Message)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
    npm run build:website
    if ($LASTEXITCODE -ne 0) { throw 'Website build failed' }
    Write-Host 'Website build is ready in Website/dist. Follow DEPLOYMENT.md to deploy the monorepo.'
} finally {
    Pop-Location
}
