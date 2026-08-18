$ErrorActionPreference = 'Continue'

$repoRoot = Split-Path $PSScriptRoot -Parent
$outFile = Join-Path $repoRoot 'h2h_cache.json'

$curl = if ($IsWindows -or $env:OS -match 'Windows') { 'curl.exe' } else { 'curl' }
$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

function Get-WebFile([string]$url) {
    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
    for ($try = 0; $try -lt 2; $try++) {
        Remove-Item $tmp -Force -ErrorAction SilentlyContinue
        & $curl -s --compressed --max-time 30 -L -A $ua -H 'Accept: text/html,*/*' -H 'Referer: https://www.google.com/' -o $tmp $url 2>$null
        if ((Test-Path $tmp) -and ((Get-Item $tmp).Length -gt 100)) {
            $text = [System.IO.File]::ReadAllText($tmp)
            Remove-Item $tmp -Force -ErrorAction SilentlyContinue
            return $text
        }
        Start-Sleep -Seconds 2
    }
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    return $null
}

function Search-TePlayer([string]$name) {
    $q = [uri]::EscapeDataString($name)
    $json = Get-WebFile "https://www.tennisexplorer.com/res/ajax/search.php?s=$q&t=p"
    if (-not $json) { return $null }
    try {
        $obj = $json | ConvertFrom-Json
        if ($obj.links -and $obj.links.Count -gt 0) {
            return ($obj.links | Where-Object { $_.type -eq 'p' } | Select-Object -First 1)
        }
    } catch {}
    return $null
}

function Get-H2HByName([string]$p1, [string]$p2) {
    $s1 = Search-TePlayer $p1; $s2 = Search-TePlayer $p2
    if (-not $s1 -or -not $s2) { return $null }
    $html = Get-WebFile "https://www.tennisexplorer.com/mutual/$($s1.url)/$($s2.url)/"
    if (-not $html) { return $null }
    $name1 = ($s1.name -replace '\s*\([A-Z]+\)\s*$', '').Trim()
    $name2 = ($s2.name -replace '\s*\([A-Z]+\)\s*$', '').Trim()
    $scoreM = [regex]::Match($html, 'class="gScore"[^>]*>\s*(\d+)\s*-\s*(\d+)\s*</td>')
    $score = if ($scoreM.Success) { "$($scoreM.Groups[1].Value)-$($scoreM.Groups[2].Value)" } else { '0-0' }
    $meetings = @()
    $tables = [regex]::Matches($html, '<table[^>]*class="result"[^>]*>([\s\S]*?)</table>')
    $tableContent = ''
    foreach ($t in $tables) { if ($t.Groups[1].Value -match '<th[^>]*>Year</th>') { $tableContent = $t.Groups[1].Value; break } }
    if ($tableContent) {
        $tbodyM = [regex]::Match($tableContent, '<tbody>([\s\S]*?)</tbody>')
        if ($tbodyM.Success) {
            $allTrs = [regex]::Matches($tbodyM.Groups[1].Value, '<tr[^>]*>([\s\S]*?)</tr>')
            $i = 0
            while ($i -lt $allTrs.Count) {
                $tr1 = $allTrs[$i].Groups[1].Value; $i++
                if ($i -ge $allTrs.Count) { break }
                $tr2 = $allTrs[$i].Groups[1].Value; $i++
                $n1M = [regex]::Match($tr1, 'class="t-name"[^>]*>.*?<strong>([^<]+)</strong>', 'Singleline')
                $n2M = [regex]::Match($tr2, 'class="t-name"[^>]*>([^<]+)</td>')
                $winner = if ($n1M.Success) { $n1M.Groups[1].Value.Trim() } else { '' }
                $loser = if ($n2M.Success) { $n2M.Groups[1].Value.Trim() } else { '' }
                $tournM = [regex]::Match($tr1, 'class="t-name"[^>]*>.*?<a[^>]*>([^<]+)</a>', 'Singleline')
                if (-not $tournM.Success) { $tournM = [regex]::Match($tr1, '<a[^>]*href="/[^"]*">([^<]+)</a>') }
                $surfM = [regex]::Match($tr1, 'class="sColorLong"[^>]*>.*?title="([^"]*)"', 'Singleline')
                $sets1 = @(); $sets2 = @()
                foreach ($sm in [regex]::Matches($tr1, 'class="score"[^>]*>([\s\S]*?)</td>')) { $v = ($sm.Groups[1].Value -replace '<[^>]+>', '').Trim(); if ($v -and $v -ne '&nbsp;') { $sets1 += $v } }
                foreach ($sm in [regex]::Matches($tr2, 'class="score"[^>]*>([\s\S]*?)</td>')) { $v = ($sm.Groups[1].Value -replace '<[^>]+>', '').Trim(); if ($v -and $v -ne '&nbsp;') { $sets2 += $v } }
                $roundM = [regex]::Match($tr1, 'class="round"[^>]*>([\s\S]*?)</td>')
                $yearM = [regex]::Match($tr1, 'class="first"[^>]*>\s*(\d{4})\s*</td>')
                $tourn = if ($tournM.Success) { ($tournM.Groups[1].Value -replace '<[^>]+>', '').Trim() } else { '' }
                $surface = if ($surfM.Success) { $surfM.Groups[1].Value } else { '' }
                $round = if ($roundM.Success) { ($roundM.Groups[1].Value -replace '<[^>]+>', '').Trim() } else { '' }
                $year = if ($yearM.Success) { $yearM.Groups[1].Value } else { '' }
                if ($winner -or $loser) { $meetings += @{ year=$year; tournament=$tourn; surface=$surface; round=$round; winner=$winner; loser=$loser; sets1=$sets1; sets2=$sets2 } }
            }
        }
    }
    return @{ ok=$true; p1=$name1; p2=$name2; h2h=$score; meetings=$meetings }
}

Write-Host "Fetching ESPN scoreboard..."
$scoreboardTmp = Join-Path ([System.IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
& $curl -s --compressed --max-time 15 -A $ua -o $scoreboardTmp 'https://www.espn.com/apis/site/v2/sports/tennis/atp/scoreboard' 2>$null
$atpJson = if ((Test-Path $scoreboardTmp) -and (Get-Item $scoreboardTmp).Length -gt 100) { [System.IO.File]::ReadAllText($scoreboardTmp) | ConvertFrom-Json } else { $null }
Remove-Item $scoreboardTmp -Force -ErrorAction SilentlyContinue

$scoreboardTmp2 = Join-Path ([System.IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
& $curl -s --compressed --max-time 15 -A $ua -o $scoreboardTmp2 'https://www.espn.com/apis/site/v2/sports/tennis/wta/scoreboard' 2>$null
$wtaJson = if ((Test-Path $scoreboardTmp2) -and (Get-Item $scoreboardTmp2).Length -gt 100) { [System.IO.File]::ReadAllText($scoreboardTmp2) | ConvertFrom-Json } else { $null }
Remove-Item $scoreboardTmp2 -Force -ErrorAction SilentlyContinue

$pairs = @{}
foreach ($json in @($atpJson, $wtaJson)) {
    if (-not $json) { continue }
    foreach ($ev in $json.events) {
        foreach ($g in $ev.groupings) {
            foreach ($c in $g.competitions) {
                if ($c.competitors.Count -lt 2) { continue }
                $n1 = if ($c.competitors[0].athlete) { $c.competitors[0].athlete.displayName } else { '' }
                $n2 = if ($c.competitors[1].athlete) { $c.competitors[1].athlete.displayName } else { '' }
                if ($n1 -and $n2) {
                    $key = ($n1.ToLower().Replace(' ','')) + '::' + ($n2.ToLower().Replace(' ',''))
                    $pairs[$key] = @{ p1=$n1; p2=$n2 }
                }
            }
        }
    }
}

Write-Host "Found $($pairs.Count) player pairs. Fetching H2H..."
$h2hCache = @{}
$count = 0
foreach ($kv in $pairs.GetEnumerator()) {
    $p = $kv.Value
    $count++
    Write-Host "  [$count/$($pairs.Count)] $($p.p1) vs $($p.p2)"
    $result = Get-H2HByName $p.p1 $p.p2
    if ($result -and $result.ok) {
        $h2hCache[$kv.Key] = $result
    }
    Start-Sleep -Milliseconds 500
}

$payload = @{ ok=$true; updated=(Get-Date).ToUniversalTime().ToString('s')+'Z'; pairs=$h2hCache }
$json = $payload | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText($outFile, $json, [System.Text.UTF8Encoding]::new($false))
Write-Host "h2h_cache.json: $($h2hCache.Count) pares"
