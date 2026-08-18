# update-elo.ps1 — Scrapes TennisAbstract Elo ratings and writes elo.json
param([string]$OutDir = "$PSScriptRoot\..")

function Get-EloPage([string]$url) {
    try {
        $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30 `
            -Headers @{ 'User-Agent' = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' }
        return $r.Content
    } catch { return $null }
}

function Parse-EloTable([string]$html) {
    $tableM = [regex]::Match($html, '<table[^>]*id="reportable"[^>]*>([\s\S]*?)</table>')
    if (-not $tableM.Success) { return @() }
    $tableHtml = $tableM.Groups[1].Value
    $rows = [regex]::Matches($tableHtml,
        '<tr>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>.*?</td>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>.*?</td>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>.*?</td>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*</tr>')
    $result = @()
    foreach ($r in $rows) {
        $cells = @($r.Groups[1..16] | ForEach-Object { ($_ -replace '<[^>]+>', '' -replace '&nbsp;', ' ' -replace '&#\d+;', '').Trim() })
        $name = ($cells[1] -replace '\s+', ' ').Trim()
        if (-not $name) { continue }
        $result += [pscustomobject]@{
            rank = $cells[0]; player = $name; age = $cells[2]; elo = $cells[3]
            hElo = $cells[5]; cElo = $cells[7]; gElo = $cells[9]
            peakElo = $cells[12]; peakMonth = $cells[13]; officialRank = $cells[15]
        }
    }
    return $result
}

$atpHtml = Get-EloPage 'https://www.tennisabstract.com/reports/atp_elo_ratings.html'
$wtaHtml = Get-EloPage 'https://www.tennisabstract.com/reports/wta_elo_ratings.html'

$atp = if ($atpHtml) { Parse-EloTable $atpHtml } else { @() }
$wta = if ($wtaHtml) { Parse-EloTable $wtaHtml } else { @() }

$output = @{
    ok = $true
    atp = $atp
    wta = $wta
    updated = (Get-Date).ToString('s')
} | ConvertTo-Json -Depth 5 -Compress

$outPath = Join-Path $OutDir 'elo.json'
[System.IO.File]::WriteAllText($outPath, $output, [System.Text.Encoding]::UTF8)
Write-Host "elo.json written: ATP $($atp.Count) players, WTA $($wta.Count) players"
