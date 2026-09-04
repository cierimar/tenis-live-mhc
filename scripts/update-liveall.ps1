# Genera live_all.json (TennisTemple todos los circuitos) para Pages. Corre en Actions (cron */10) o manual.
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\update-liveall.ps1
$ErrorActionPreference = 'Stop'

function Get-TennisTempleLive {
    $ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
    $tmp = [System.IO.Path]::GetTempFileName()
    try {
        $curlCmd = @('curl.exe', 'curl') | Where-Object { Get-Command $_ -ErrorAction SilentlyContinue } | Select-Object -First 1
        if (-not $curlCmd) { Write-Output 'sin curl disponible'; return $null }
        function Get-DttHtmlValid {
            param([string]$path)
            if (-not (Test-Path $path)) { return $false }
            $fi = Get-Item $path
            if ($fi.Length -lt 2000) { return $false }
            $c = [IO.File]::ReadAllText($path)
            return ($c -match '<section class="site"')
        }
        & $curlCmd -s -L --compressed --connect-timeout 15 --max-time 40 -A $ua -o $tmp 'https://es.tennistemple.com/matches/' 2>$null
        if (-not (Get-DttHtmlValid $tmp)) {
            Write-Output 'tennistemple directo sin html valido - reintento via r.jina.ai'
            Start-Sleep 2
            & $curlCmd -s -L --connect-timeout 25 --max-time 90 -A $ua -H 'X-Return-Format: html' -o $tmp 'https://r.jina.ai/https://es.tennistemple.com/matches/' 2>$null
        }
        if (-not (Get-DttHtmlValid $tmp)) { Write-Output 'sin html util de tennistemple'; return $null }
        $html = [IO.File]::ReadAllText($tmp)
        $tournaments = New-Object System.Collections.Generic.List[object]
        $matchSeq = 0
        foreach ($site in [regex]::Matches($html, '<section class="site">[\s\S]*?</section>', 'Singleline')) {
            $sec = $site.Value
            $nameM = [regex]::Match($sec, '<h2[^>]*>([\s\S]{0,60})</h2>', 'Singleline')
            $name = if ($nameM.Success) { (($nameM.Groups[1].Value -replace '<[^>]+>', '') -replace '\s+', ' ').Trim() } else { '' }
            if (-not $name) { continue }
            $levelM = [regex]::Match($sec, '</h2>\s*<span>([\s\S]{0,30})</span>', 'Singleline')
            $level = if ($levelM.Success) { (($levelM.Groups[1].Value -replace '<[^>]+>', '') -replace '\s+', ' ').Trim() } else { '' }
            $hrefM = [regex]::Match($sec, "window\.location\.href = '([^']+)'", 'Singleline')
            $href = if ($hrefM.Success) { $hrefM.Groups[1].Value } else { '' }
            $tour = 'atp'
            $cat = $null
            if ($href -match '/(ladies|women)/') { $tour = 'wta' }
            elseif ($href -notmatch '/(ladies|women)/' -and $level -match '^WTA') { $tour = 'wta' }
            elseif ($level -match 'ATP CH') { $tour = 'chall' }
            elseif ($level -match '^W\s') { $tour = 'itf'; $cat = 'w' }
            elseif ($level -match '^M\s') { $tour = 'itf'; $cat = 'm' }
            elseif ($level -match 'MIXTO|Mixed') { $tour = 'mixto' }
            $tid = 'tt-' + $matchSeq
            $mList = New-Object System.Collections.Generic.List[object]
            foreach ($mm in [regex]::Matches($sec, '<a class="tt-match[^"]*" data-match-id="(\d+)"[\s\S]*?</a>', 'Singleline')) {
                $matchSeq++
                $m = $mm.Value
                $mid = $mm.Groups[1].Value
                $names = [regex]::Matches($m, '<span class="name[^"]*">([\s\S]{0,40}?)</span>', 'Singleline')
                $p1 = if ($names.Count -gt 0) { (($names[0].Groups[1].Value -replace '<[^>]+>', '') -replace '\s+', ' ').Trim() } else { '' }
                $p2 = if ($names.Count -gt 1) { (($names[1].Groups[1].Value -replace '<[^>]+>', '') -replace '\s+', ' ').Trim() } else { '' }
                $p3 = if ($names.Count -gt 2) { (($names[2].Groups[1].Value -replace '<[^>]+>', '') -replace '\s+', ' ').Trim() } else { '' }
                $p4 = if ($names.Count -gt 3) { (($names[3].Groups[1].Value -replace '<[^>]+>', '') -replace '\s+', ' ').Trim() } else { '' }
                $flags = [regex]::Matches($m, 'tt-flag ([a-z]{2})')
                $f1 = if ($flags.Count -gt 0) { $flags[0].Groups[1].Value } else { '' }
                $f2 = if ($flags.Count -gt 1) { $flags[1].Groups[1].Value } else { '' }
                $f3 = if ($flags.Count -gt 2) { $flags[2].Groups[1].Value } else { '' }
                $f4 = if ($flags.Count -gt 3) { $flags[3].Groups[1].Value } else { '' }
                # estado real por clases del anchor / visibilidad del bloque scores
                # OJO: el template SIEMPRE incluye los divs ocultos .postponed/.suspended -> no usar -match sobre esas palabras
                $isPlaying = $m -match 'class="tt-match match playing'
                $state = 'pre'
                if ($isPlaying) { $state = 'in' }
                $roundM = [regex]::Match($m, 'class="round-label-short[^"]*">([^<]+)<')
                $round = if ($roundM.Success) { $roundM.Groups[1].Value.Trim() } else { '' }
                # hora programada ("15:30") -> date local para mostrar en el draw
                $mDate = $null
                $stM = [regex]::Match($m, '<div class="schedule-time[^"]*"[^>]*>\s*([^<]+?)\s*<')
                if ($stM.Success) {
                    $t = $stM.Groups[1].Value.Trim()
                    if ($t -match '^\d{1,2}:\d{2}') { $mDate = '2000-01-01T' + $t + ':00' }
                }
                $games = [regex]::Matches($m, '<div class="game">\s*([^<]+)\s*</div>')
                $game1 = if ($games.Count -gt 0) { $games[0].Groups[1].Value.Trim() } else { '' }
                $game2 = if ($games.Count -gt 1) { $games[1].Groups[1].Value.Trim() } else { '' }
                $serve1 = $m -match 'class="serve p1"'
                $serve2 = $m -match 'class="serve p2"'
                $sets1 = @()
                foreach ($sm in [regex]::Matches($m, '<div class="player player1">[\s\S]*?</div>\s*</div>', 'Singleline')) {
                    foreach ($sv in [regex]::Matches($sm.Value, 'class="set set\d+[^"]*">\s*([^<]+)\s*</div>')) { if ($sv.Groups[1].Value.Trim() -ne '') { $sets1 += $sv.Groups[1].Value.Trim() } }
                }
                $sets2 = @()
                foreach ($sm in [regex]::Matches($m, '<div class="player player2">[\s\S]*?</div>\s*</div>', 'Singleline')) {
                    foreach ($sv in [regex]::Matches($sm.Value, 'class="set set\d+[^"]*">\s*([^<]+)\s*</div>')) { if ($sv.Groups[1].Value.Trim() -ne '') { $sets2 += $sv.Groups[1].Value.Trim() } }
                }
                # post = scores visibles (sin display:none) + sets no vacios y no en vivo
                if ($state -eq 'pre' -and ($sets1.Count + $sets2.Count) -gt 0 -and $m -notmatch 'style="display:\s?none"') { $state = 'post' }
                $isDoubles = $names.Count -ge 4
                $k = if ($isDoubles) { 'Doubles' } else { 'Singles' }
                $type = $k
                if ($tour -eq 'wta') { $type = 'Women ' + $k }
                elseif ($tour -eq 'itf') { $type = $(if ($cat -eq 'w') { 'Women ' } else { 'Men ' }) + $k }
                else { $type = 'Men ' + $k }
                $mList.Add([pscustomobject]@{
                    id = 'tt-' + $mid
                    date = $mDate
                    state = $state
                    period = $null
                    type = $type
                    round = $round
                    tournamentId = $tid
                    tournamentName = $name
                    tour = $tour
                    cat = if ($tour -eq 'itf') { $cat } else { $null }
                    venue = $level
                    notes = ''
                    fortified = $false
                    postponed = $false
                    suspended = $false
                    live = ($state -eq 'in')
                    pts0 = $game1
                    pts1 = $game2
                    serverIdx = if ($serve1) { 1 } elseif ($serve2) { 2 } else { 0 }
                    competitors = @(
                        @{ homeAway = 'home'; winner = $false; order = 1; name = if ($isDoubles) { "$p1 / $p3" } else { $p1 }; flag = $f1; flagAlt = ''; linescores = @($sets1) },
                        @{ homeAway = 'away'; winner = $false; order = 2; name = if ($isDoubles) { "$p2 / $p4" } else { $p2 }; flag = $f2; flagAlt = ''; linescores = @($sets2) }
                    )
                })
            }
            if ($mList.Count -gt 0) {
                $tier = ''
                $lv = $level.ToLowerInvariant()
                if ($lv -match 'grand slam') { $tier = 'GRAND SLAM' }
                elseif ($lv -match 'wta') {
                    if ($lv -match 'wta 1000|wta 900|wta premi') { $tier = 'WTA 1000' }
                    elseif ($lv -match 'wta 500') { $tier = 'WTA 500' }
                    elseif ($lv -match 'wta 250') { $tier = 'WTA 250' }
                    elseif ($lv -match 'wta 125') { $tier = 'WTA 125' }
                    else { $tier = 'WTA' }
                }
                elseif ($lv -match 'atp ch') { $tier = 'CHALLENGER' }
                elseif ($lv -match 'atp') {
                    if ($lv -match 'masters|1000') { $tier = 'MASTERS 1000' }
                    elseif ($lv -match 'atp 500|500') { $tier = 'ATP 500' }
                    elseif ($lv -match 'atp 250|250') { $tier = 'ATP 250' }
                    else { $tier = 'ATP' }
                }
                elseif ($lv -match '^w\s*(\d+)') { $tier = 'ITF W' + $Matches[1] }
                elseif ($lv -match '^m\s*(\d+)') { $tier = 'ITF M' + $Matches[1] }
                $tournaments.Add([pscustomobject]@{ id = $tid; name = $name; level = $level; tour = $tour; cat = if ($tour -eq 'itf') { $cat } else { $null }; tier = $tier; matches = $mList })
            }
        }
        return $tournaments
    } finally {
        Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    }
}

$tours = Get-TennisTempleLive
if (-not $tours -or @($tours).Count -eq 0) {
    Write-Output 'sin datos de tennistemple - no se commitea'
    exit 1
}
$total = 0
foreach ($t in @($tours)) { $total += [int]$t.matches.Count }
if ($total -eq 0) { Write-Output 'sin partidos en tennistemple - no se commitea'; exit 1 }
$json = [ordered]@{
    ok = $true
    time = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    source = 'tennistemple'
    tournaments = @($tours)
}
$updateStamp = if ($tours[0].PSObject.Properties['updated']) { $tours[0].updated } else { (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') }
$json['time'] = $updateStamp
$rootDir = Split-Path $PSScriptRoot -Parent
$outJson = $json | ConvertTo-Json -Depth 12
$enc = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $rootDir 'live_all.json'), $outJson + "`n", $enc)
$wg = Join-Path $rootDir 'web-github'
if (Test-Path $wg) { [System.IO.File]::WriteAllText((Join-Path $wg 'live_all.json'), $outJson + "`n", $enc) }
Write-Output ("live_all.json OK: {0} torneos, {1} partidos" -f @($tours).Count, $total)