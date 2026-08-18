$ErrorActionPreference = 'Continue'

$repoRoot = Split-Path $PSScriptRoot -Parent
$outFile = Join-Path $repoRoot 'stats_cache.json'

$curl = if ($IsWindows -or $env:OS -match 'Windows') { 'curl.exe' } else { 'curl' }
$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

function Get-WebFile([string]$url) {
    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
    for ($try = 0; $try -lt 2; $try++) {
        Remove-Item $tmp -Force -ErrorAction SilentlyContinue
        & $curl -s --compressed --max-time 45 -L -A $ua -H 'Accept: text/html,*/*' -H 'Referer: https://www.google.com/' -o $tmp $url 2>$null
        if ((Test-Path $tmp) -and ((Get-Item $tmp).Length -gt 100)) {
            $text = [System.IO.File]::ReadAllText($tmp)
            Remove-Item $tmp -Force -ErrorAction SilentlyContinue
            return $text
        }
        Start-Sleep -Seconds 3
    }
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    return $null
}

function Search-TAPlayer([string]$name) {
    $slug = $name -replace '\s+', '' -replace '[^a-zA-Z0-9]', ''
    $url = "https://www.tennisabstract.com/cgi-bin/player-classic.cgi?p=$slug"
    $html = Get-WebFile $url
    if (-not $html) { return $null }
    if ($html -match 'var matchmx = \[') { return @{ html=$html; slug=$slug } }
    return $null
}

function Get-MatchStats([string]$p1Name, [string]$p2Name) {
    $p1 = Search-TAPlayer $p1Name
    if (-not $p1) { return $null }
    $html = $p1.html
    $idx = $html.IndexOf('var matchmx = ')
    if ($idx -lt 0) { return $null }
    $start = $idx + 'var matchmx = '.Length
    $depth = 0; $end = $start
    for ($i = $start; $i -lt $html.Length; $i++) {
        $c = $html[$i]
        if ($c -eq '[') { $depth++ }
        elseif ($c -eq ']') { $depth--; if ($depth -eq 0) { $end = $i + 1; break } }
    }
    $json = $html.Substring($start, $end - $start)
    $matchmx = $json | ConvertFrom-Json
    $p2Lower = $p2Name.ToLower()
    $found = $null
    for ($i = 0; $i -lt $matchmx.Count; $i++) {
        $opp = [string]$matchmx[$i][11]
        if ($opp.ToLower().Contains($p2Lower) -or $p2Lower.Contains($opp.ToLower())) { $found = $matchmx[$i]; break }
    }
    if (-not $found) { return $null }
    $m = $found
    return @{
        date=[string]$m[0]; tournament=[string]$m[1]; surface=[string]$m[2]; round=[string]$m[8]
        score=[string]$m[9]; result=[string]$m[4]; opponent=[string]$m[11]
        ranking=[string]$m[5]; oppRanking=[string]$m[12]; seed=[string]$m[6]; oppSeed=[string]$m[13]
        aces=[string]$m[21]; dfs=[string]$m[22]; pts=[string]$m[23]; firsts=[string]$m[24]
        fwon=[string]$m[25]; swon=[string]$m[26]; games=[string]$m[27]; saved=[string]$m[28]; chances=[string]$m[29]
        oaces=[string]$m[30]; odfs=[string]$m[31]; opts=[string]$m[32]; ofirsts=[string]$m[33]
        ofwon=[string]$m[34]; oswon=[string]$m[35]; ogames=[string]$m[36]; osaved=[string]$m[37]; ochances=[string]$m[38]
    }
}

Write-Host "Fetching ESPN scoreboard for finished matches..."
$scoreboardTmp = Join-Path ([System.IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
& $curl -s --compressed --max-time 15 -A $ua -o $scoreboardTmp 'https://www.espn.com/apis/site/v2/sports/tennis/atp/scoreboard' 2>$null
$atpJson = if ((Test-Path $scoreboardTmp) -and (Get-Item $scoreboardTmp).Length -gt 100) { [System.IO.File]::ReadAllText($scoreboardTmp) | ConvertFrom-Json } else { $null }
Remove-Item $scoreboardTmp -Force -ErrorAction SilentlyContinue

$scoreboardTmp2 = Join-Path ([System.IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
& $curl -s --compressed --max-time 15 -A $ua -o $scoreboardTmp2 'https://www.espn.com/apis/site/v2/sports/tennis/wta/scoreboard' 2>$null
$wtaJson = if ((Test-Path $scoreboardTmp2) -and (Get-Item $scoreboardTmp2).Length -gt 100) { [System.IO.File]::ReadAllText($scoreboardTmp2) | ConvertFrom-Json } else { $null }
Remove-Item $scoreboardTmp2 -Force -ErrorAction SilentlyContinue

$finishedPairs = @{}
foreach ($json in @($atpJson, $wtaJson)) {
    if (-not $json) { continue }
    foreach ($ev in $json.events) {
        foreach ($g in $ev.groupings) {
            foreach ($c in $g.competitions) {
                $st = if ($c.status -and $c.status.type) { $c.status.type.state } else { '' }
                if ($st -ne 'post') { continue }
                if ($c.competitors.Count -lt 2) { continue }
                $n1 = if ($c.competitors[0].athlete) { $c.competitors[0].athlete.displayName } else { '' }
                $n2 = if ($c.competitors[1].athlete) { $c.competitors[1].athlete.displayName } else { '' }
                if ($n1 -and $n2) {
                    $key = ($n1.ToLower().Replace(' ','')) + '::' + ($n2.ToLower().Replace(' ',''))
                    $finishedPairs[$key] = @{ p1=$n1; p2=$n2 }
                }
            }
        }
    }
}

Write-Host "Found $($finishedPairs.Count) finished pairs. Fetching stats..."
$statsCache = @{}
$count = 0
foreach ($kv in $finishedPairs.GetEnumerator()) {
    $p = $kv.Value
    $count++
    Write-Host "  [$count/$($finishedPairs.Count)] $($p.p1) vs $($p.p2)"
    $result = Get-MatchStats $p.p1 $p.p2
    if ($result) { $statsCache[$kv.Key] = @{ ok=$true; player=$p.p1; stats=$result } }
    Start-Sleep -Milliseconds 800
}

$payload = @{ ok=$true; updated=(Get-Date).ToUniversalTime().ToString('s')+'Z'; pairs=$statsCache }
$json = $payload | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText($outFile, $json, [System.Text.UTF8Encoding]::new($false))
Write-Host "stats_cache.json: $($statsCache.Count) pares"
