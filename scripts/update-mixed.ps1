# Genera mixed.json (mixtos tennis.com) para Pages. Corre en Actions (cron */10) o manual.
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\update-mixed.ps1
$ErrorActionPreference = 'Stop'

function Get-MixedLiveStandalone {
    $ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
    $tmp = [System.IO.Path]::GetTempFileName()
    try {
        $curlCmd = @('curl.exe', 'curl') | Where-Object { Get-Command $_ -ErrorAction SilentlyContinue } | Select-Object -First 1
        if (-not $curlCmd) { Write-Output 'sin curl disponible'; return $null }
        & $curlCmd -s -L --compressed --connect-timeout 15 --max-time 40 -A $ua -o $tmp 'https://www.tennis.com/' 2>$null
        if (-not (Test-Path $tmp) -or ((Get-Item $tmp).Length -lt 10000)) {
            Write-Output 'tennis.com directo fallo o bloqueado - reintento via r.jina.ai'
            Start-Sleep 2
            & $curlCmd -s -L --connect-timeout 20 --max-time 90 -A $ua -H 'X-Return-Format: html' -o $tmp 'https://r.jina.ai/https://www.tennis.com/' 2>$null
        }
        if (-not (Test-Path $tmp) -or ((Get-Item $tmp).Length -lt 10000)) { Write-Output 'sin html util de tennis.com'; return $null }
        $html = [IO.File]::ReadAllText($tmp)
        $flight = New-Object System.Text.StringBuilder
        foreach ($c in [regex]::Matches($html, '<script[^>]*>([\s\S]*?)</script>')) {
            $body = $c.Groups[1].Value
            if ($body.Length -lt 200) { continue }
            foreach ($m in [regex]::Matches($body, '\[1,\s*"((?:[^"\\]|\\.)*)"\s*\]')) {
                try { $dec = ('"' + $m.Groups[1].Value + '"') | ConvertFrom-Json } catch { continue }
                if ($dec -is [string]) { [void]$flight.Append($dec) }
            }
        }
        $ftext = $flight.ToString()
        if (-not $ftext) { return $null }
        $raw = New-Object System.Collections.Generic.List[object]
        foreach ($line in ($ftext -split "`n")) {
            $t2 = $line.Trim()
            $i2 = $t2.IndexOf(':')
            if ($i2 -lt 1 -or $i2 -gt 10) { continue }
            $payload = $t2.Substring($i2 + 1)
            if (-not ($payload.StartsWith('[') -or $payload.StartsWith('{'))) { continue }
            if ($payload.IndexOf('Mixed Doubles') -lt 0) { continue }
            try { $obj = $payload | ConvertFrom-Json } catch { continue }
            $stack = New-Object System.Collections.Generic.List[object]
            $stack.Add($obj)
            while ($stack.Count -gt 0) {
                $cur = $stack[$stack.Count - 1]; $stack.RemoveAt($stack.Count - 1)
                if ($cur -is [System.Management.Automation.PSCustomObject]) {
                    $im = $cur.PSObject.Properties['initialMatches']
                    if ($im -and $im.Value) { foreach ($mm in @($im.Value)) { if ($mm.eventCategory -eq 'Mixed Doubles') { $raw.Add($mm) } } }
                    foreach ($pr in $cur.PSObject.Properties) { if ($pr.Value -is [System.Management.Automation.PSCustomObject] -or $pr.Value -is [Array]) { $stack.Add($pr.Value) } }
                } elseif ($cur -is [Array]) { foreach ($e in $cur) { if ($e -is [System.Management.Automation.PSCustomObject] -or $e -is [Array]) { $stack.Add($e) } } }
            }
        }
        $out = New-Object System.Collections.Generic.List[object]
        foreach ($mm in $raw) {
            try {
                $st = '' + $mm.status
                $state = 'pre'
                if ($st -eq 'live' -or $st -eq 'in_progress') { $state = 'in' }
                elseif ($st -eq 'completed') { $state = 'post' }
                $hTeam = $mm.homeTeam; $aTeam = $mm.awayTeam
                if (-not $hTeam -or -not $hTeam.name) { continue }
                $aName = ''
                $aCode = ''
                if ($aTeam -and $aTeam.name) { $aName = $aTeam.name; if ($aTeam.player1 -and $aTeam.player1.countryCode) { $aCode = ([string]$aTeam.player1.countryCode).ToLowerInvariant() } }
                $hCode = ''
                if ($hTeam.player1 -and $hTeam.player1.countryCode) { $hCode = ([string]$hTeam.player1.countryCode).ToLowerInvariant() }
                $sets = @()
                $setNo = 0
                if ($mm.score -and $mm.score.sets) {
                    $total = @($mm.score.sets).Count
                    foreach ($s in @($mm.score.sets)) {
                        $setNo++
                        $hg = [int]$s.homeGames; $ag = [int]$s.awayGames
                        $decided = ($state -eq 'post') -or ($setNo -lt $total)
                        $tbH = $null; $tbA = $null
                        if ($s.homeTiebreakPoints) { $tbH = [int]$s.homeTiebreakPoints }
                        if ($s.awayTiebreakPoints) { $tbA = [int]$s.awayTiebreakPoints }
                        $lsH = @{ value = $hg; winner = $false }
                        $lsA = @{ value = $ag; winner = $false }
                        if ($tbH -ne $null -or $tbA -ne $null) {
                            if ($tbA -ne $null -and ($tbH -eq $null -or $tbA -lt $tbH)) { $lsA.tiebreak = $tbA }
                            elseif ($tbH -ne $null) { $lsH.tiebreak = $tbH }
                        }
                        if ($decided) {
                            if ($hg -gt $ag) { $lsH.winner = $true }
                            elseif ($ag -gt $hg) { $lsA.winner = $true }
                        }
                        $sets += ,@( $lsH, $lsA )
                    }
                }
                $wid = '' + $mm.winnerId
                $pts0 = ''; $pts1 = ''; $period = $null
                if ($state -eq 'in' -and $mm.score -and $mm.score.currentGame) {
                    $pts0 = '' + $mm.score.currentGame.homePointDisplay
                    $pts1 = '' + $mm.score.currentGame.awayPointDisplay
                }
                if ($state -eq 'in' -and $mm.score -and $mm.score.currentSetNumber) { $period = [int]$mm.score.currentSetNumber }
                $comps = @(
                    [pscustomobject]@{ name = $hTeam.name; flag = $hCode; flagAlt = $hCode.ToUpperInvariant(); homeAway = 'home'; winner = ($wid -eq '' + $hTeam.id -and $wid); linescores = @($sets | ForEach-Object { $_[0] }) },
                    [pscustomobject]@{ name = $(if ($aName) { $aName } else { 'Por definir' }); flag = $aCode; flagAlt = $aCode.ToUpperInvariant(); homeAway = 'away'; winner = ($wid -eq '' + $aTeam.id -and $wid); linescores = @($sets | ForEach-Object { $_[1] }) }
                )
                $mo = [ordered]@{
                    id = 'tcom-' + ($mm.id -replace '[^a-zA-Z0-9]', '')
                    tournamentId = 'tcom-mixed'
                    tournamentName = 'US Open Mixed Doubles'
                    date = $mm.startTime
                    state = $state
                    type = 'Mixed Doubles'
                    tour = 'mixto'
                    round = $mm.round
                    venue = $(if ($mm.venue -and $mm.venue.name) { $mm.venue.name } else { '' })
                    competitors = $comps
                    pts0 = $pts0
                    pts1 = $pts1
                }
                if ($period -ne $null) { $mo.period = $period }
                $out.Add([pscustomobject]$mo)
            } catch { continue }
        }
        return $out
    } finally {
        Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    }
}

$matches_ = Get-MixedLiveStandalone
if (-not $matches_ -or @($matches_).Count -eq 0) {
    Write-Output 'sin datos de mixtos (flight vacio o sin partidos) - no se commitea'
    exit 1
}
$json = [ordered]@{
    ok = $true
    updated = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    source = 'tennis.com'
    count = @($matches_).Count
    matches = @($matches_)
}
$rootDir = Split-Path $PSScriptRoot -Parent
$outJson = $json | ConvertTo-Json -Depth 12
$enc = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $rootDir 'mixed.json'), $outJson + "`n", $enc)
$wg = Join-Path $rootDir 'web-github'
if (Test-Path $wg) { [System.IO.File]::WriteAllText((Join-Path $wg 'mixed.json'), $outJson + "`n", $enc) }
Write-Output ("mixed.json OK: {0} partidos" -f @($matches_).Count)
