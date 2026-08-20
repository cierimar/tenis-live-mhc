# update-wheelchair.ps1 — Validates and copies wheelchair.json to web-github/
# To FETCH fresh data from Sofascore, run: scripts/fetch-wheelchair-sofascore.ps1
# To update rankings manually, edit wheelchair.json directly in the project root.
# Run from project root: powershell -ExecutionPolicy Bypass -File scripts/update-wheelchair.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$wcFile = Join-Path $root 'wheelchair.json'
$outFile = Join-Path $root 'web-github' 'wheelchair.json'

if (-not (Test-Path -LiteralPath $wcFile)) {
    Write-Error "wheelchair.json not found at $wcFile"
    exit 1
}

try {
    $data = Get-Content -LiteralPath $wcFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if (-not $data.ok) {
        Write-Error "wheelchair.json has ok=false"
        exit 1
    }
    Write-Host "wheelchair.json OK — updated: $($data.updated)"
    Write-Host "  Rankings: menSingles=$($data.rankings.menSingles.Count), womenSingles=$($data.rankings.womenSingles.Count), menDoubles=$($data.rankings.menDoubles.Count), womenDoubles=$($data.rankings.womenDoubles.Count), quad=$($data.rankings.quad.Count)"
    Write-Host "  Calendar: $($data.calendar.Count) tournaments"
    Write-Host "  Recent results: $($data.recentResults.Count)"
} catch {
    Write-Error "Failed to parse wheelchair.json: $_"
    exit 1
}

$webDir = Join-Path $root 'web-github'
if (-not (Test-Path -LiteralPath $webDir)) {
    New-Item -ItemType Directory -Path $webDir -Force | Out-Null
}

Copy-Item -LiteralPath $wcFile -Destination $outFile -Force
Write-Host "Copied to $outFile"
