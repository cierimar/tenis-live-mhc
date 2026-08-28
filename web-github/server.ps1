param(
    [int]$Port = 8080,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$cache = [System.Collections.Hashtable]::Synchronized(@{})

function Get-Cached([string]$key, [scriptblock]$fn, [int]$ttlSeconds) {
    $now = Get-Date
    $item = $null
    if ($cache.ContainsKey($key)) { $item = $cache[$key] }
    if ($item -and (($now - $item.last).TotalSeconds) -lt $ttlSeconds) {
        return $item.data
    }
    $data = & $fn
    $cache[$key] = @{ last = $now; data = $data }
    return $data
}

function Send-Json([System.Net.HttpListenerResponse]$resp, $obj) {
    $json = $obj | ConvertTo-Json -Depth 12 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $resp.StatusCode = 200
    $resp.ContentType = 'application/json; charset=utf-8'
    $resp.ContentLength64 = $bytes.Length
    $resp.OutputStream.Write($bytes, 0, $bytes.Length)
    $resp.OutputStream.Close()
}

function Send-Error([System.Net.HttpListenerResponse]$resp, [int]$code, [string]$message) {
    $json = @{ error = $message } | ConvertTo-Json -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $resp.StatusCode = $code
    $resp.ContentType = 'application/json; charset=utf-8'
    $resp.ContentLength64 = $bytes.Length
    $resp.OutputStream.Write($bytes, 0, $bytes.Length)
    $resp.OutputStream.Close()
}

function Send-File([System.Net.HttpListenerResponse]$resp, [string]$path) {
    if (-not (Test-Path -LiteralPath $path)) {
        Send-Error $resp 404 'Not found'
        return
    }
    $ext = [System.IO.Path]::GetExtension($path).ToLowerInvariant()
    $mime = switch ($ext) {
        '.html' { 'text/html; charset=utf-8' }
        '.css'  { 'text/css; charset=utf-8' }
        '.js'   { 'application/javascript; charset=utf-8' }
        '.json' { 'application/json; charset=utf-8' }
        '.svg'  { 'image/svg+xml' }
        '.png'  { 'image/png' }
        '.jpg'  { 'image/jpeg' }
        '.ico'  { 'image/x-icon' }
        default { 'application/octet-stream' }
    }
    $bytes = [System.IO.File]::ReadAllBytes($path)
    $resp.StatusCode = 200
    $resp.ContentType = $mime
    $resp.Headers['Cache-Control'] = 'no-cache'
    $resp.ContentLength64 = $bytes.Length
    $resp.OutputStream.Write($bytes, 0, $bytes.Length)
    $resp.OutputStream.Close()
}

function Get-UriQuery([System.Uri]$uri) {
    $q = @{}
    if (-not $uri.Query) { return $q }
    foreach ($part in $uri.Query.TrimStart('?').Split('&')) {
        if (-not $part) { continue }
        $kv = $part.Split('=', 2)
        $k = [System.Uri]::UnescapeDataString($kv[0])
        $v = if ($kv.Count -gt 1) { [System.Uri]::UnescapeDataString($kv[1]) } else { '' }
        $q[$k] = $v
    }
    return $q
}

function Get-WebFile([string]$url, [string]$UserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36') {
    $ua = $UserAgent
    for ($try = 0; $try -lt 3; $try++) {
        $tmp = [System.IO.Path]::GetTempFileName()
        try {
            $args = @('-s', '--compressed', '--max-time', '45', '-L',
                '-A', $ua,
                '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                '-H', 'Accept-Language: en-US,en;q=0.9,es;q=0.8',
                '-H', 'Referer: https://www.google.com/',
                '-H', 'Upgrade-Insecure-Requests: 1',
                '-H', 'Sec-Fetch-Dest: document',
                '-H', 'Sec-Fetch-Mode: navigate',
                '-H', 'Sec-Fetch-Site: cross-site',
                '-w', '%{http_code}',
                '-o', $tmp,
                $url)
            $code = (& curl.exe @args) -join ''
            $code = [int]([regex]::Match($code, '\d{3}').Value)
            if ($code -ne 200) { return $null }
            if ((Get-Item $tmp).Length -eq 0) { return $null }
            $text = [System.IO.File]::ReadAllText($tmp)
            if ($text -match '<title>Just a moment') {
                Start-Sleep -Seconds 3
                continue
            }
            return $text
        } catch {
            try { Add-Content -Path (Join-Path $root 'server_debug.log') -Value "$(Get-Date -Format s) URL=$url ERR=$($_.Exception.Message)" } catch {}
            Start-Sleep -Seconds 3
        } finally {
            Remove-Item $tmp -Force -ErrorAction SilentlyContinue
        }
    }
    return $null
}

function ConvertTo-FoldKey([string]$s) {
    if (-not $s) { return '' }
    $n = $s.ToLowerInvariant().Normalize([System.Text.NormalizationForm]::FormD)
    $sb = New-Object System.Text.StringBuilder
    foreach ($ch in $n.ToCharArray()) {
        $uc = [int][char]$ch
        if ($ch -eq ' ' -or ($uc -ge 97 -and $uc -le 122)) { [void]$sb.Append($ch) }
    }
    return $sb.ToString()
}

function ConvertFrom-PlayerSlug([string]$slug) {
    if (-not $slug) { return '' }
    $parts = @($slug.Split('-') | Where-Object { $_ })
    $out = $parts | ForEach-Object {
        if ($_.Length -gt 1) { $_.Substring(0, 1).ToUpperInvariant() + $_.Substring(1) } else { $_.ToUpperInvariant() }
    }
    return ($out -join ' ')
}

$script:EloFoldMapCache = $null
function Get-EloNameMap {
    if ($script:EloFoldMapCache) { return $script:EloFoldMapCache }
    $map = @{}
    try {
        $a = Get-Cached 'elo_atp' { Get-TennisAbstractElo 'atp' } 21600
        if ($a -and $a.ok) { foreach ($p in $a.atp) { $k = ConvertTo-FoldKey ([string]$p.player); if ($k -and -not $map.ContainsKey($k)) { $map[$k] = [string]$p.player } } }
    } catch {}
    try {
        $w = Get-Cached 'elo_wta' { Get-TennisAbstractElo 'wta' } 21600
        if ($w -and $w.ok) { foreach ($p in $w.wta) { $k = ConvertTo-FoldKey ([string]$p.player); if ($k -and -not $map.ContainsKey($k)) { $map[$k] = [string]$p.player } } }
    } catch {}
    $script:EloFoldMapCache = $map
    return $map
}

function Restore-Accents([string]$joinedName) {
    if (-not $joinedName) { return $joinedName }
    try {
        $emap = Get-EloNameMap
        if ($emap.Count -eq 0) { return $joinedName }
        $out = @($joinedName.Split('/') | ForEach-Object {
            $one = $_.Trim()
            if (-not $one) { return $one }
            $k = ConvertTo-FoldKey $one
            if ($k -and $emap.ContainsKey($k)) { $emap[$k] }
            else {
                $hit = $null
                foreach ($key in $emap.Keys) { if ($key.EndsWith(' ' + $k)) { $hit = $emap[$key]; break } }
                if ($hit) { $hit } else { $one }
            }
        })
        return ($out -join ' / ')
    } catch { return $joinedName }
}

function Parse-AtpRanking([string]$html) {
    $result = [System.Collections.Generic.List[object]]::new()
    $seen = New-Object 'System.Collections.Generic.HashSet[string]'
    $rows = [regex]::Matches($html, '<tr[^>]*>.*?</tr>', 'Singleline')
    foreach ($m in $rows) {
        $row = $m.Value
        $rankM = [regex]::Match($row, 'class="rank[^"]*"[^>]*>([^<]+)<')
        if (-not $rankM.Success) { continue }
        $rankRaw = $rankM.Groups[1].Value.Trim()
        $rankNum = [regex]::Match($rankRaw, '\d+').Value
        if (-not $rankNum) { continue }
        $pointsM = [regex]::Match($row, 'class="points[^"]*"[^>]*>.*?([\d,]+)\s*</a>', 'Singleline')
        $points = 0
        if ($pointsM.Success) { [void][int]::TryParse(($pointsM.Groups[1].Value -replace ',', ''), [ref]$points) }
        $slugs = [regex]::Matches($row, 'href="/en/players/([a-z0-9\-]+)/[a-z0-9]+/')
        $name = ''
        if ($slugs.Count -gt 0) {
            $fulls = @($slugs | ForEach-Object { ConvertFrom-PlayerSlug $_.Groups[1].Value } | Where-Object { $_ } | Select-Object -Unique)
            $name = ($fulls -join ' / ').Trim()
        }
        if (-not $name) {
            $names = [regex]::Matches($row, 'class="lastName">([^<]+)<')
            if ($names.Count -gt 0) {
                $name = (($names | ForEach-Object { $_.Groups[1].Value.Trim() }) -join ' / ').Trim()
            }
        }
        if (-not $name) { continue }
        $name = Restore-Accents $name
        $key = $name.ToLowerInvariant()
        if (-not $seen.Add($key)) { continue }
        $flags = [regex]::Matches($row, '#flag-([a-z0-9]+)')
        $flag = ''
        if ($flags.Count -gt 0) { $flag = $flags[0].Groups[1].Value.ToLowerInvariant() }
        $up = [regex]::Match($row, 'rank-up">(\d+)<')
        $down = [regex]::Match($row, 'rank-down">(\d+)<')
        $movement = 0
        if ($up.Success) { [void][int]::TryParse($up.Groups[1].Value, [ref]$movement) }
        elseif ($down.Success) { $d = 0; [void][int]::TryParse($down.Groups[1].Value, [ref]$d); $movement = -$d }
        $result.Add([pscustomobject]@{
            rank = [int]$rankNum
            rankRaw = $rankRaw
            name = $name
            flag = $flag
            points = $points
            movement = $movement
            source = 'atptour.com'
        })
    }
    return $result
}

function Get-AtpRankings([string]$type) {
    $url = "https://www.atptour.com/en/rankings/$type"
    $html = Get-WebFile $url
    if (-not $html) { return @{ ok = $false; error = 'No se pudo descargar atptour.com' } }
    if ($html -match '<title>Just a moment' -or $html -notmatch 'rankings-breakdown') {
        return @{ ok = $false; error = 'atptour.com bloqueo la peticion (Cloudflare). Reintente en unos minutos.' }
    }
    $list = Parse-AtpRanking $html
    return @{ ok = $true; type = $type; count = $list.Count; players = $list }
}

function Get-WtaRankings([string]$type) {
    $apiType = if ($type -eq 'doubles') { 'rankDoubles' } else { 'rankSingles' }
    $metric = if ($type -eq 'doubles') { 'doubles' } else { 'singles' }
    $url = "https://api.wtatennis.com/tennis/players/ranked?type=$apiType&metric=$metric&pageSize=100"
    $raw = Get-WebFile $url
    if (-not $raw) { return @{ ok = $false; error = 'No se pudo descargar la API de la WTA' } }
    $arr = $raw | ConvertFrom-Json
    $list = [System.Collections.Generic.List[object]]::new()
    foreach ($p in $arr) {
        $list.Add([pscustomobject]@{
            rank = [int]$p.ranking
            rankRaw = [string]$p.ranking
            name = $p.player.fullName
            flag = ('' + $p.player.countryCode).ToLowerInvariant()
            points = [int]$p.points
            movement = [int]$p.movement
            source = 'api.wtatennis.com'
        })
    }
    return @{ ok = $true; type = $type; count = $list.Count; players = $list }
}

function Get-MixedLive {
    $ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
    $tmp = [System.IO.Path]::GetTempFileName()
    try {
        & curl.exe -s -L --compressed --connect-timeout 15 --max-time 40 -A $ua -o $tmp 'https://www.tennis.com/' 2>$null
        if (-not (Test-Path $tmp) -or ((Get-Item $tmp).Length -lt 10000)) { return @{ ok = $false; error = 'sin datos de tennis.com' } }
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
        if (-not $ftext) { return @{ ok = $false; error = 'flight vacio' } }
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
                $comps = @(
                    [pscustomobject]@{ name = $hTeam.name; flag = $hCode; flagAlt = $hCode.ToUpperInvariant(); homeAway = 'home'; winner = ($wid -eq '' + $hTeam.id -and $wid); linescores = @($sets | ForEach-Object { $_[0] }) },
                    [pscustomobject]@{ name = $(if ($aName) { $aName } else { 'Por definir' }); flag = $aCode; flagAlt = $aCode.ToUpperInvariant(); homeAway = 'away'; winner = ($wid -eq '' + $aTeam.id -and $wid); linescores = @($sets | ForEach-Object { $_[1] }) }
                )
                $match = [pscustomobject]@{
                    id = 'tcom-' + ($mm.id -replace '[^a-zA-Z0-9]', '')
                    tournamentId = 'tcom-mixed'
                    tournamentName = 'US Open Mixed Doubles'
                    date = $mm.startTime
                    state = $state
                    type = "Mixed Doubles"
                    tour = 'mixto'
                    round = $mm.round
                    venue = $(if ($mm.venue -and $mm.venue.name) { $mm.venue.name } else { '' })
                    competitors = $comps
                    pts0 = ''
                    pts1 = ''
                }
                if ($state -eq 'in' -and $mm.score -and $mm.score.currentGame) {
                    $match.pts0 = '' + $mm.score.currentGame.homePointDisplay
                    $match.pts1 = '' + $mm.score.currentGame.awayPointDisplay
                }
                if ($state -eq 'in' -and $mm.score -and $mm.score.currentSetNumber) { $match | Add-Member -NotePropertyName period -NotePropertyValue ([int]$mm.score.currentSetNumber) }
                $out.Add($match)
            } catch { continue }
        }
        return @{ ok = $true; updated = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'); source = 'tennis.com'; count = $out.Count; matches = $out }
    } finally {
        Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    }
}

function Get-AtpLive([string]$level = 'tour') {
    $ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    $url = "https://app.atptour.com/api/v2/gateway/livematches/website?scoringTournamentLevel=$level"
    for ($try = 0; $try -lt 3; $try++) {
        $tmp = [System.IO.Path]::GetTempFileName()
        try {
            $args = @('-s', '--compressed', '--max-time', '40', '-L',
                '-A', $ua,
                '-H', 'Accept: application/json,text/plain,*/*',
                '-H', 'Accept-Language: en-US,en;q=0.9',
                '-H', 'Referer: https://www.atptour.com/en/scores/current',
                '-w', '%{http_code}',
                '-o', $tmp, $url)
            $code = [int]([regex]::Match(((& curl.exe @args) -join ''), '\d{3}').Value)
            if ($code -ne 200) { Start-Sleep -Seconds 2; continue }
            $text = [System.IO.File]::ReadAllText($tmp)
            if (-not $text.StartsWith('{')) { Start-Sleep -Seconds 2; continue }
            $j = $text | ConvertFrom-Json
            $list = [System.Collections.Generic.List[object]]::new()
            foreach ($t in $j.Data.LiveMatchesTournamentsOrdered) {
                foreach ($m in $t.LiveMatches) {
                    $isDoubles = $m.IsDoubles -eq $true -or $m.Type -eq 'doubles'
                    $list.Add([pscustomobject]@{
                        status = $m.MatchStatus
                        type = if ($isDoubles) { "doubles" } else { "singles" }
                        p1 = ('' + $m.PlayerTeam.Player.PlayerFirstName).Trim() + ' ' + ('' + $m.PlayerTeam.Player.PlayerLastName).Trim()
                        p2 = ('' + $m.OpponentTeam.Player.PlayerFirstName).Trim() + ' ' + ('' + $m.OpponentTeam.Player.PlayerLastName).Trim()
                        g1 = $m.PlayerTeam.GameScore
                        g2 = $m.OpponentTeam.GameScore
                        server = $m.ServerTeam
                        sets1 = @($m.PlayerTeam.SetScores | ForEach-Object { $_.SetScore })
                        sets2 = @($m.OpponentTeam.SetScores | ForEach-Object { $_.SetScore })
                    })
                }
            }
            return @{ ok = $true; time = (Get-Date).ToString('s'); matches = $list }
        } catch {
            Start-Sleep -Seconds 2
        } finally {
            Remove-Item $tmp -Force -ErrorAction SilentlyContinue
        }
    }
    return @{ ok = $false; error = 'gateway no disponible'; matches = @() }
}

function Get-ChallengerLive {
    $ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    $url = 'https://app.atptour.com/api/v2/gateway/livematches/website?scoringTournamentLevel=challenger'
    for ($try = 0; $try -lt 3; $try++) {
        $tmp = [System.IO.Path]::GetTempFileName()
        try {
            $args = @('-s', '--compressed', '--max-time', '40', '-L',
                '-A', $ua,
                '-H', 'Accept: application/json,text/plain,*/*',
                '-H', 'Accept-Language: en-US,en;q=0.9',
                '-H', 'Referer: https://www.atptour.com/en/scores/current',
                '-w', '%{http_code}',
                '-o', $tmp, $url)
            $code = [int]([regex]::Match(((& curl.exe @args) -join ''), '\d{3}').Value)
            if ($code -ne 200) { Start-Sleep -Seconds 2; continue }
            $text = [System.IO.File]::ReadAllText($tmp)
            if (-not $text.StartsWith('{')) { Start-Sleep -Seconds 2; continue }
            $j = $text | ConvertFrom-Json
            $tournaments = [System.Collections.Generic.List[object]]::new()
            $matches = [System.Collections.Generic.List[object]]::new()
            foreach ($t in $j.Data.LiveMatchesTournamentsOrdered) {
                if (-not $t.EventTitle) { continue }
                $tid = 'chall-' + $t.EventId
                $tournaments.Add([pscustomobject]@{
                    id = $tid
                    name = [string]$t.EventTitle
                    city = [string]$t.EventCity
                    country = [string]$t.EventCountryCode
                    date = $t.EventStartDate
                })
                foreach ($m in $t.LiveMatches) {
                    $p1 = ((('' + $m.PlayerTeam.Player.PlayerFirstName).Trim() + ' ' + ('' + $m.PlayerTeam.Player.PlayerLastName).Trim())).Trim()
                    $p2 = ((('' + $m.OpponentTeam.Player.PlayerFirstName).Trim() + ' ' + ('' + $m.OpponentTeam.Player.PlayerLastName).Trim())).Trim()
        $finished.Add([pscustomobject]@{
                        id = $tid + '-' + $m.MatchId
                        tournamentId = $tid
                        round = [string]$m.RoundName
                        type = if ($m.IsDoubles) { "Men's Doubles" } else { "Men's Singles" }
                        state = if ($m.MatchStatus -eq 'P' -or $m.MatchStatus -eq 'W') { 'in' } elseif ($m.MatchStatus -eq 'F') { 'post' } else { 'pre' }
                        notes = [string]$m.ExtendedMessage
                        status = [string]$m.MatchStatus
                        g1 = $m.PlayerTeam.GameScore
                        g2 = $m.OpponentTeam.GameScore
                        server = $m.ServerTeam
                        p1 = $p1
                        p2 = $p2
                        p1flag = [string]$m.PlayerTeam.Player.PlayerCountry
                        p2flag = [string]$m.OpponentTeam.Player.PlayerCountry
                        sets1 = @($m.PlayerTeam.SetScores | ForEach-Object { $_.SetScore })
                        sets2 = @($m.OpponentTeam.SetScores | ForEach-Object { $_.SetScore })
                    })
                }
            }
            return @{ ok = $true; time = (Get-Date).ToString('s'); tournaments = $tournaments; matches = $matches }
        } catch {
            Start-Sleep -Seconds 2
        } finally {
            Remove-Item $tmp -Force -ErrorAction SilentlyContinue
        }
    }
    return @{ ok = $false; error = 'gateway no disponible'; tournaments = @(); matches = @() }
}

function Get-TennisComServing {
    $ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    $tmp = [System.IO.Path]::GetTempFileName()
    try {
        $args = @('-s', '--compressed', '--max-time', '20', '-L', '-A', $ua,
            '-H', 'Accept: text/html,*/*',
            '-o', $tmp, 'https://www.tennis.com/')
        & curl.exe @args | Out-Null
        $html = [System.IO.File]::ReadAllText($tmp)
        $serving = @{}
        $matchPattern = [regex]'"homeCompetitor":\{[^}]*"name":"([^"]*)"[^}]*\}[^}]*"awayCompetitor":\{[^}]*"name":"([^"]*)"[^}]*\}[^}]*?"score":\{[^}]*?"currentGame":\{"homePointDisplay":"[^"]*","awayPointDisplay":"[^"]*","servingSide":"(home|away|null)"'
        foreach ($m in $matchPattern.Matches($html)) {
            $hName = $m.Groups[1].Value
            $aName = $m.Groups[2].Value
            $side = $m.Groups[3].Value
            if ($side -eq 'home') {
                $serving[$hName] = $true
            } elseif ($side -eq 'away') {
                $serving[$aName] = $true
            }
        }
        return @{ ok = $true; serving = $serving }
    } catch {
        return @{ ok = $false; error = $_.Exception.Message; serving = @{} }
    } finally {
        Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    }
}

$ItfFetchSb = {
    param($slug)
    $ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    $tmp = [System.IO.Path]::GetTempFileName()
    try {
        $args = @('-s', '--compressed', '--max-time', '30', '-L', '-A', $ua, '-o', $tmp,
            "https://www.tennisexplorer.com$slug")
        & curl.exe @args | Out-Null
        $text = [System.IO.File]::ReadAllText($tmp)
        $out = @()
        foreach ($m in [regex]::Matches($text, '<tr class="(?:one|two)">(.*?)</tr>', 'Singleline')) {
            $row = $m.Groups[1].Value
            $link = [regex]::Match($row, 'class="t-name"><a href="/match-detail/\?id=(\d+)"[^>]*>(.*?)</a>', 'Singleline')
            if (-not $link.Success) { continue }
            $teId = $link.Groups[1].Value
            $playersTxt = (($link.Groups[2].Value -replace '&nbsp;', ' ') -replace '\s+', ' ').Trim()
            $timeM = [regex]::Match($row, 'class="first time">.*?>?\s*([\d]{1,2}:[\d]{2})\s*</td>', 'Singleline')
            $roundM = [regex]::Match($row, 'class="round">([^<]+)<')
            $h2hM = [regex]::Match($row, 'class="h2h">([^<]+)<')
            $parts = $playersTxt -split '\s+-\s+', 2
            $out += [pscustomobject]@{
                teId = $teId
                p1 = ($parts[0] -replace '\s*\(\d+\)\s*$', '')
                p2 = if ($parts.Count -gt 1) { ($parts[1] -replace '\s*\(\d+\)\s*$', '') } else { '' }
                time = $timeM.Groups[1].Value
                round = $roundM.Groups[1].Value
                h2h = $h2hM.Groups[1].Value
                finished = $false
            }
        }
        $finished = @()
        foreach ($m in [regex]::Matches($text, '<tr[^>]*>(.*?)</tr>', 'Singleline')) {
            $row = $m.Groups[1].Value
            if ($row -match 'class="result"' -and $row -match 'class="score"') { $finished += $row }
        }
        for ($i = 0; $i -lt $finished.Count; $i += 2) {
            if ($i + 1 -ge $finished.Count) { break }
            $r1 = $finished[$i]
            $r2 = $finished[$i + 1]
            $idM = [regex]::Match($r1, '/match-detail/\?id=(\d+)')
            if (-not $idM.Success) { $idM = [regex]::Match($r2, '/match-detail/\?id=(\d+)') }
            if (-not $idM.Success) { continue }
            $name1 = [regex]::Match($r1, 'class="t-name">.*?<a[^>]*>(.*?)</a>', 'Singleline')
            $name2 = [regex]::Match($r2, 'class="t-name">.*?<a[^>]*>(.*?)</a>', 'Singleline')
            $dateM = [regex]::Match($r1, 'class="first time"[^>]*>\s*([\d.]+)<br\s*/?>\s*([\d:]+)')
            $roundM = [regex]::Match($r1, 'title="([^"]+)"[^>]*rowspan="2"')
            $res1 = [regex]::Match($r1, 'class="result">([^<]+)<')
            $res2 = [regex]::Match($r2, 'class="result">([^<]+)<')
            $s1 = @()
            foreach ($sm in [regex]::Matches($r1, 'class="score">([^<]+)<')) {
                $v = $sm.Groups[1].Value -replace '&nbsp;', ''
                if ($v -ne '') { $s1 += $v }
            }
            $s2 = @()
            foreach ($sm in [regex]::Matches($r2, 'class="score">([^<]+)<')) {
                $v = $sm.Groups[1].Value -replace '&nbsp;', ''
                if ($v -ne '') { $s2 += $v }
            }
            $out += [pscustomobject]@{
                teId = $idM.Groups[1].Value
                p1 = (($name1.Groups[1].Value -replace '&nbsp;', ' ') -replace '\s+', ' ').Trim()
                p2 = (($name2.Groups[1].Value -replace '&nbsp;', ' ') -replace '\s+', ' ').Trim()
                round = $roundM.Groups[1].Value
                date = $dateM.Groups[1].Value
                time = $dateM.Groups[2].Value
                res1 = [int]$res1.Groups[1].Value
                res2 = [int]$res2.Groups[1].Value
                sets1 = $s1
                sets2 = $s2
                finished = $true
            }
        }
        return $out
    } catch {
        return @()
    } finally {
        Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    }
}

function Get-ItfLive {
    $live = Get-WebFile 'https://www.tennisexplorer.com/live/'
    if (-not $live) { return @{ ok = $false; error = 'tennisexplorer no disponible'; tournaments = @() } }
    $candidates = [System.Collections.Generic.List[object]]::new()
    foreach ($m in [regex]::Matches($live, '<tr class="one">.*?</tr>', 'Singleline')) {
        $row = $m.Value
        $hrefM = [regex]::Match($row, 'href="(/[^"]+/2026/(atp-men|wta-women)/)"')
        if (-not $hrefM.Success) { continue }
        $slug = $hrefM.Groups[1].Value
        if ($slug -notmatch 'itf') { continue }
        $nameM = [regex]::Match($row, 'class="t-name">.*?>([^<]+)</a>', 'Singleline')
        $cntM = [regex]::Match($row, 'class="nxGame[^"]*"[^>]*>(\d+)</td>')
        $cnt = 0
        if ($cntM.Success) { [void][int]::TryParse($cntM.Groups[1].Value, [ref]$cnt) }
        if ($cnt -gt 0) {
            $candidates.Add([pscustomobject]@{
                slug = $slug
                cat = $hrefM.Groups[2].Value
                name = if ($nameM.Success) { (($nameM.Groups[1].Value -replace '&nbsp;', ' ') -replace '\s+', ' ').Trim() } else { $slug }
            })
        }
    }
    $tournaments = [System.Collections.Generic.List[object]]::new()
    $pool = [runspacefactory]::CreateRunspacePool(1, 6)
    $pool.Open()
    $jobs = @()
    foreach ($c in ($candidates | Select-Object -First 12)) {
        $ps = [powershell]::Create()
        $ps.RunspacePool = $pool
        [void]$ps.AddScript($ItfFetchSb)
        [void]$ps.AddArgument($c.slug)
        $jobs += , @{ handle = $ps.BeginInvoke(); ps = $ps; cat = $c.cat; name = $c.name; slug = $c.slug }
    }
    foreach ($job in $jobs) {
        try {
            $ms = $job.ps.EndInvoke($job.handle)
        } catch {
            $ms = @()
        }
        $job.ps.Dispose()
        if ($ms -and $ms.Count -gt 0) {
            $tournaments.Add([pscustomobject]@{
                id = 'itf-' + (($job.slug -replace '/', '') -replace '-itf', '')
                name = $job.name
                cat = if ($job.cat -eq 'atp-men') { 'm' } else { 'w' }
                matches = @($ms)
            })
        }
    }
    $pool.Dispose()
    return @{ ok = $true; time = (Get-Date).ToString('s'); tournaments = $tournaments }
}

function Get-LiveAll {
    # Fuente universal de EN VIVO: TennisTemple (todos los circuitos, singles + dobles)
    $ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    $tmp = [System.IO.Path]::GetTempFileName()
    $html = $null
    try {
        & curl.exe -s -L --compressed --connect-timeout 15 --max-time 40 -A $ua -o $tmp 'https://es.tennistemple.com/matches/' 2>$null
        if (Test-Path $tmp) {
            $len = (Get-Item $tmp).Length
            if ($len -gt 2000) { $html = [System.IO.File]::ReadAllText($tmp) }
        }
    } catch { $html = $null }
    finally { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
    if (-not $html -or $html.Length -lt 2000) { return @{ ok = $false; error = 'tennistemple no disponible'; tournaments = @() } }
    $tournaments = [System.Collections.Generic.List[object]]::new()
    $matchSeq = 0
    foreach ($site in [regex]::Matches($html, '<section class="site">[\s\S]*?</section>', 'Singleline')) {
        $sec = $site.Value
        $nameM = [regex]::Match($sec, '<h2[^>]*>([\s\S]{0,60})</h2>', 'Singleline')
        $name = if ($nameM.Success) { (($nameM.Groups[1].Value -replace '<[^>]+>', '') -replace '\s+', ' ').Trim() } else { '' }
        if (-not $name) { continue }
        $levelM = [regex]::Match($sec, '</h2>\s*<span>([\s\S]{0,30})</span>', 'Singleline')
        $level = if ($levelM.Success) { (($levelM.Groups[1].Value -replace '<[^>]+>', '') -replace '\s+', ' ').Trim() } else { '' }
        # circuito por nivel
        $tour = 'atp'
        if ($level -match '^WTA') { $tour = 'wta' }
        elseif ($level -match 'ATP CH') { $tour = 'chall' }
        elseif ($level -match '^W\s') { $tour = 'itf'; $cat = 'w' }
        elseif ($level -match '^M\s') { $tour = 'itf'; $cat = 'm' }
        elseif ($level -match 'MIXTO|Mixed') { $tour = 'mixto' }
        $tid = 'tt-' + $matchSeq
        $mList = [System.Collections.Generic.List[object]]::new()
        foreach ($mm in [regex]::Matches($sec, '<a class="tt-match[^"]*" data-match-id="(\d+)"[\s\S]*?</a>', 'Singleline')) {
            $matchSeq++
            $m = $mm.Value
            $mid = $mm.Groups[1].Value
            $names = [regex]::Matches($m, '<span class="name">([\s\S]{0,40})</span>', 'Singleline')
            $p1 = if ($names.Count -gt 0) { (($names[0].Groups[1].Value -replace '<[^>]+>', '') -replace '\s+', ' ').Trim() } else { '' }
            $p2 = if ($names.Count -gt 1) { (($names[1].Groups[1].Value -replace '<[^>]+>', '') -replace '\s+', ' ').Trim() } else { '' }
            $p3 = if ($names.Count -gt 2) { (($names[2].Groups[1].Value -replace '<[^>]+>', '') -replace '\s+', ' ').Trim() } else { '' }
            $p4 = if ($names.Count -gt 3) { (($names[3].Groups[1].Value -replace '<[^>]+>', '') -replace '\s+', ' ').Trim() } else { '' }
            $flags = [regex]::Matches($m, 'tt-flag ([a-z]{2})')
            $f1 = if ($flags.Count -gt 0) { $flags[0].Groups[1].Value } else { '' }
            $f2 = if ($flags.Count -gt 1) { $flags[1].Groups[1].Value } else { '' }
            $f3 = if ($flags.Count -gt 2) { $flags[2].Groups[1].Value } else { '' }
            $f4 = if ($flags.Count -gt 3) { $flags[3].Groups[1].Value } else { '' }
            $isPlaying = $m -match 'class="tt-match match playing'
            $isPostponed = $m -match 'postponed'
            $isSuspended = $m -match 'suspended'
            $state = 'pre'
            if ($isPlaying) { $state = 'in' }
            $roundM = [regex]::Match($m, 'class="round-label-short[^"]*">([^<]+)<')
            $round = if ($roundM.Success) { $roundM.Groups[1].Value.Trim() } else { '' }
            # marcador: game (punto) y sets
            $games = [regex]::Matches($m, '<div class="game">\s*([^<]+)\s*</div>')
            $game1 = if ($games.Count -gt 0) { $games[0].Groups[1].Value.Trim() } else { '' }
            $game2 = if ($games.Count -gt 1) { $games[1].Groups[1].Value.Trim() } else { '' }
            $serve1 = $m -match 'class="serve p1"'
            $serve2 = $m -match 'class="serve p2"'
            # sets por jugador
            $sets1 = @()
            foreach ($sm in [regex]::Matches($m, '<div class="player player1">[\s\S]*?</div>\s*</div>', 'Singleline')) {
                foreach ($sv in [regex]::Matches($sm.Value, 'class="set set\d+[^"]*">\s*([^<]+)\s*</div>')) { if ($sv.Groups[1].Value.Trim() -ne '') { $sets1 += $sv.Groups[1].Value.Trim() } }
            }
            $sets2 = @()
            foreach ($sm in [regex]::Matches($m, '<div class="player player2">[\s\S]*?</div>\s*</div>', 'Singleline')) {
                foreach ($sv in [regex]::Matches($sm.Value, 'class="set set\d+[^"]*">\s*([^<]+)\s*</div>')) { if ($sv.Groups[1].Value.Trim() -ne '') { $sets2 += $sv.Groups[1].Value.Trim() } }
            }
            # dobles?
            $isDoubles = $names.Count -ge 4
            $k = if ($isDoubles) { 'Doubles' } else { 'Singles' }
            $type = $k
            if ($tour -eq 'wta') { $type = 'Women ' + $k }
            elseif ($tour -eq 'itf') { $type = $(if ($cat -eq 'w') { 'Women ' } else { 'Men ' }) + $k }
            else { $type = 'Men ' + $k }
            $mList.Add([pscustomobject]@{
                id = 'tt-' + $mid
                date = $null
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
                postponed = $isPostponed
                suspended = $isSuspended
                live = $state -eq 'in'
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
            $tournaments.Add([pscustomobject]@{ id = $tid; name = $name; level = $level; tour = $tour; cat = if ($tour -eq 'itf') { $cat } else { $null }; matches = $mList })
        }
    }
    return @{ ok = $true; time = (Get-Date).ToString('s'); source = 'tennistemple'; tournaments = $tournaments }
}

function Get-TennisNews {
    $feeds = @(
        @{ url = 'https://www.espn.com/espn/rss/tennis/news'; source = 'ESPN'; tz = 'GMT' },
        @{ url = 'https://www.puntodebreak.com/rss.xml'; source = 'Punto de Break'; tz = 'GMT' },
        @{ url = 'https://www.bbc.com/sport/tennis/rss.xml'; source = 'BBC'; tz = 'GMT' }
    )
    $out = [System.Collections.Generic.List[object]]::new()
    foreach ($f in $feeds) {
        try {
            $xml = Get-WebFile $f.url 'Mozilla/5.0'
            if (-not $xml -or $xml.Length -lt 100) { continue }
            [xml]$doc = $null
            try { $doc = [xml]$xml } catch { continue }
            if (-not $doc.rss -or -not $doc.rss.channel) { continue }
            foreach ($item in $doc.rss.channel.item) {
                $title = ''
                $titleNode = $item.SelectSingleNode('title')
                if ($titleNode) { $title = $titleNode.InnerText.Trim() }
                if (-not $title) { continue }
                $link = ''
                $linkNode = $item.SelectSingleNode('link')
                if ($linkNode) { $link = $linkNode.InnerText.Trim() }
                if (-not $link) { continue }
                if ($f.source -eq 'Punto de Break' -and $link -match 'puntodebreak\.com/(en|it|fr)/') { continue }
                $pubRaw = ''
                $pubNode = $item.SelectSingleNode('pubDate')
                if ($pubNode) { $pubRaw = $pubNode.InnerText.Trim() }
                if (-not $pubRaw) {
                    $dcNode = $item.SelectSingleNode('dc:date')
                    if ($dcNode) { $pubRaw = $dcNode.InnerText.Trim() }
                }
                $pubIso = $pubRaw
                if ($pubRaw) {
                    $dt = [datetime]::MinValue
                    if ([datetime]::TryParse($pubRaw, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AssumeUniversal, [ref]$dt)) {
                        $pubIso = $dt.ToUniversalTime().ToString('s') + 'Z'
                    }
                }
                $desc = ''
                $descNode = $item.SelectSingleNode('description')
                if ($descNode -and $descNode.InnerText) {
                    $desc = ([Net.WebUtility]::HtmlDecode($descNode.InnerText) -replace '&nbsp;', ' ' -replace '\s+', ' ').Trim()
                    if ($desc.Length -gt 300) { $desc = $desc.Substring(0, 300) + '...' }
                }
                $img = ''
                try {
                    $encNode = $item.SelectSingleNode('enclosure')
                    if ($encNode) {
                        $et = [string]$encNode.GetAttribute('type')
                        if ($et -like 'image*') { $img = [string]$encNode.GetAttribute('url') }
                    }
                } catch {}
                if (-not $img) {
                    try {
                        $rawItem = $item.OuterXml
                        if ($rawItem -match '<media:(content|thumbnail)[^>]*url="([^"]+)"') { $img = [Net.WebUtility]::HtmlDecode($Matches[2]) }
                    } catch {}
                }
                if (-not $img) {
                    $dm = [regex]::Match($desc, '<img[^>]*src="([^"]+)"')
                    if ($dm.Success) { $img = [Net.WebUtility]::HtmlDecode($dm.Groups[1].Value) }
                }
                if ($img -and $img -notmatch '^https?://') { $img = '' }
                $desc = (($desc -replace '<[^>]+>', ' ') -replace '\s+', ' ').Trim()
                [void]$out.Add([pscustomobject]@{
                    id = [guid]::NewGuid().ToString('N')
                    title = $title
                    link = $link
                    published = $pubIso
                    source = $f.source
                    description = $desc
                    image = $img
                })
            }
        } catch {
            try { Add-Content -Path (Join-Path $root 'server_debug.log') -Value "$(Get-Date -Format s) NEWS feed=$($f.url) ERR=$($_.Exception.Message)" } catch {}
        }
    }
    try {
        $needImg = @($out | Where-Object { $_.source -eq 'Punto de Break' -and -not $_.image })
        if ($needImg.Count -gt 0) {
            $homeHtml = Get-WebFile 'https://www.puntodebreak.com/' 'Mozilla/5.0'
            if ($homeHtml -and $homeHtml.Length -gt 5000) {
                $imgMap = @{}
                foreach ($mm in [regex]::Matches($homeHtml, '(?:data-src|src)="(/sites/puntodebreak/files/[^"]+)"')) {
                    $u2 = (($mm.Groups[1].Value) -split '\?')[0]
                    $fname = ($u2 -split '/')[-1]
                    $core = ($fname -replace '\.avif$', '' -replace '\.webp$', '' -replace '\.(jpg|jpeg|png|gif)$', '').ToLower()
                    if ($core -and $imgMap.ContainsKey($core) -eq $false -and $core.Length -gt 8) { $imgMap[$core] = 'https://www.puntodebreak.com' + $u2 }
                }
                foreach ($it2 in $out) {
                    if ($it2.source -eq 'Punto de Break' -and -not $it2.image) {
                        $seg = (($it2.link -split '\?')[0]).TrimEnd('/').Split('/')[-1].ToLower()
                        if ($seg -and $imgMap.ContainsKey($seg)) {
                            $it2 | Add-Member -NotePropertyName image -NotePropertyValue $imgMap[$seg] -Force
                        }
                    }
                }
            }
        }
    } catch {}
    $sorted = @($out | Sort-Object @{ Expression = { try { [datetime]$_.published } catch { [datetime]::MinValue } }; Descending = $true })
    if ($sorted.Count -gt 60) { $sorted = $sorted[0..59] }
    return @{ ok = ($sorted.Count -gt 0); updated = (Get-Date).ToUniversalTime().ToString('s') + 'Z'; items = @($sorted) }
}

function Get-TournamentCalendar {
    param([ValidateSet('atp', 'wta')][string]$Circuit)
    $slug = if ($Circuit -eq 'atp') { 'atp-men' } else { 'wta-women' }
    $url = "https://www.tennisexplorer.com/calendar/$slug/"
    $tmp = [System.IO.Path]::GetTempFileName()
    try {
        Invoke-WebRequest -Uri $url -Headers @{ 'User-Agent' = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36' } -UseBasicParsing -TimeoutSec 20 -OutFile $tmp
        $html = [System.IO.File]::ReadAllText($tmp, [System.Text.Encoding]::UTF8)
    } finally {
        Remove-Item -LiteralPath $tmp -ErrorAction SilentlyContinue
    }
    $rx = [regex]'<tr[^>]*class="one([^"]*)" data-type="(main|lower)"[^>]*>([\s\S]*?)</tr>'
    $out = New-Object System.Collections.ArrayList
    foreach ($m in $rx.Matches($html)) {
        $row = $m.Groups[3].Value
        $dateM = [regex]::Match($row, 'class="first shortdate[^"]*"[^>]*>\s*(\d{2})\.(\d{2})\.\s*<br>\s*(\d{4})')
        if (-not $dateM.Success) { continue }
        $date = $dateM.Groups[3].Value + '-' + $dateM.Groups[2].Value + '-' + $dateM.Groups[1].Value
        $nameM = [regex]::Match($row, '<th class="t-name"[^>]*>[\s\S]*?<a href="[^"]+"[^>]*>\s*<strong>\s*(?:<span title="([^"]+)">)?([^<]+)')
        if (-not $nameM.Success) { continue }
        $name = if ($nameM.Groups[1].Value) { $nameM.Groups[1].Value } else { $nameM.Groups[2].Value }
        $name = (($name -replace '&nbsp;', ' ') -replace '\s+', ' ').Trim()
        $surfM = [regex]::Match($row, '<td class="s-color"[^>]*>[\s\S]*?<span title="([^"]+)"')
        $prizeM = [regex]::Match($row, '<td class="tr"[^>]*>([^<]*)')
        $drawM = [regex]::Match($row, '<td class="draw"[^>]*>(\d+)')
        $winnerM = [regex]::Match($row, '<td class="winner"[^>]*>\s*(.*?)\s*</td>')
        $winner = ''
        if ($winnerM.Success) {
            $winner = (($winnerM.Groups[1].Value -replace '<[^>]+>', '') -replace '&nbsp;', ' ').Trim()
        }
        [void]$out.Add([pscustomobject]@{
            date    = $date
            name    = $name
            circuit = $Circuit
            surface = if ($surfM.Success) { $surfM.Groups[1].Value } else { '' }
            prize   = if ($prizeM.Success) { (($prizeM.Groups[1].Value -replace '&nbsp;', ' ').Trim()) } else { '' }
            draw    = if ($drawM.Success) { [int]$drawM.Groups[1].Value } else { 0 }
            level   = $m.Groups[2].Value
            current = ($m.Groups[1].Value -match 'actual')
            winner  = $winner
        })
    }
    return @{ ok = $true; circuit = $Circuit; tournaments = $out }
}

function Get-ChallengerCalendar {
    $url = 'https://www.atptour.com/en/-/tournaments/calendar/challenger'
    $tmp = [System.IO.Path]::GetTempFileName()
    try {
        curl.exe -s -A 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36' -H 'Referer: https://www.atptour.com/en/atp-challenger-tour/calendar' -o $tmp --max-time 30 $url | Out-Null
        $json = [System.IO.File]::ReadAllText($tmp, [System.Text.Encoding]::UTF8)
    } finally {
        Remove-Item -LiteralPath $tmp -ErrorAction SilentlyContinue
    }
    if (-not $json -or $json.Length -lt 50) { return @{ ok = $false; circuit = 'chall'; tournaments = @() } }
    $parsed = $null
    try { $parsed = $json | ConvertFrom-Json } catch {}
    if (-not $parsed -or -not $parsed.TournamentDates) { return @{ ok = $false; circuit = 'chall'; tournaments = @() } }
    $inv = [Globalization.CultureInfo]::InvariantCulture
    function Parse-ChallDate([string]$fd, [string]$fallbackMonth) {
        if (-not $fd) { return '' }
        $m = [regex]::Match($fd, '^(\d{1,2})\s*(?:([A-Za-z]+)\s*)?-\s*\d{1,2}\s+([A-Za-z]+),\s*(\d{4})$')
        if (-not $m.Success) { return '' }
        $day = $m.Groups[1].Value
        $monName = if ($m.Groups[2].Value) { $m.Groups[2].Value } else { $m.Groups[3].Value }
        $year = $m.Groups[4].Value
        try {
            $mon = [datetime]::ParseExact($monName, 'MMMM', $inv).Month.ToString('00')
            return "$year-$mon-$($day.PadLeft(2, '0'))"
        } catch {
            try {
                $mon = [datetime]::ParseExact($fallbackMonth, 'MMMM', $inv).Month.ToString('00')
                return "$year-$mon-$($day.PadLeft(2, '0'))"
            } catch { return '' }
        }
    }
    function Parse-ChallEndDate([string]$fd) {
        if (-not $fd) { return '' }
        $m = [regex]::Match($fd, '^\d{1,2}(?:\s+[A-Za-z]+)?\s*-\s*(\d{1,2})\s+([A-Za-z]+),\s*(\d{4})$')
        if (-not $m.Success) { return '' }
        try {
            $mon = [datetime]::ParseExact($m.Groups[2].Value, 'MMMM', $inv).Month.ToString('00')
            return "$($m.Groups[3].Value)-$mon-$($m.Groups[1].Value.PadLeft(2, '0'))"
        } catch { return '' }
    }
    $today = (Get-Date).ToString('yyyy-MM-dd')
    $out = New-Object System.Collections.ArrayList
    foreach ($month in $parsed.TournamentDates) {
        $fbMon = ''
        if ($month.DisplayDate -match '^([A-Za-z]+)') { $fbMon = $Matches[1] }
        foreach ($t in $month.Tournaments) {
            $start = Parse-ChallDate $t.FormattedDate $fbMon
            $end = Parse-ChallEndDate $t.FormattedDate
            $isNow = $false
            if ($t.IsLive) { $isNow = $true }
            elseif ($start -and $end -and $today -ge $start -and $today -le $end) { $isNow = $true }
            elseif (-not $end -and $start -and $today.Substring(0,7) -eq $start.Substring(0,7)) { $isNow = $today -ne '' }
            [void]$out.Add([pscustomobject]@{
                date     = $start
                endDate  = $end
                name     = (($t.Name -replace '&nbsp;', ' ') -replace '\s+', ' ').Trim()
                circuit  = 'chall'
                surface  = $t.Surface
                prize    = $t.TotalFinancialCommitment
                draw     = if ($t.SglDrawSize) { [int]$t.SglDrawSize } else { 0 }
                level    = 'chall'
                current  = $isNow
                winner   = ''
                location = $t.Location
            })
        }
    }
    return @{ ok = ($out.Count -gt 0); circuit = 'chall'; source = 'atptour.com'; updated = (Get-Date).ToUniversalTime().ToString('s') + 'Z'; tournaments = $out }
}

function Get-MatchH2H([string]$matchId) {
    if ($matchId -notmatch '^\d+$') { return @{ ok = $false; error = 'matchId invalido'; matchId = $matchId } }
    $html = Get-WebFile "https://www.tennisexplorer.com/match-detail/?id=$matchId"
    if (-not $html) { return @{ ok = $false; error = 'match-detail no disponible'; matchId = $matchId } }
    $h2hM = [regex]::Match($html, 'Head-to-head:\s*(\d+)\s*-\s*(\d+)')
    $p1 = ''
    $p2 = ''
    $titleM = [regex]::Match($html, '<h1[^>]*>\s*(.*?)\s*</h1>', 'Singleline')
    if ($titleM.Success) {
        $t = ($titleM.Groups[1].Value -replace '<[^>]+>', ' ' -replace '&nbsp;', ' ')
        $t = ($t -replace '\s+', ' ').Trim()
        $parts = $t -split '\s+-\s+', 2
        if ($parts.Count -gt 1) { $p1 = $parts[0]; $p2 = $parts[1] }
    }
    $meetings = New-Object System.Collections.ArrayList
    $blockM = [regex]::Match($html, 'Head-to-head:[\s\S]*?<tbody>([\s\S]*?)</tbody>')
    if ($blockM.Success) {
        $pairs = [regex]::Matches($blockM.Groups[1].Value, '<tr class="[^"]+">(.*?)</tr>\s*<tr class="[^"]+">(.*?)</tr>', 'Singleline')
        foreach ($pr in $pairs) {
            $r1 = $pr.Groups[1].Value
            $r2 = $pr.Groups[2].Value
            $yearM = [regex]::Match($r1, 'class="first annual[^"]*"[^>]*>([^<]+)')
            $tourM = [regex]::Match($r1, 'class="tl[^"]*"[^>]*>(.*?)</td>', 'Singleline')
            $winM = [regex]::Match($r1, 'class="t-name">([^<]+)')
            $loseM = [regex]::Match($r2, 'class="t-name">([^<]+)')
            $winSetsM = [regex]::Match($r1, 'class="result">([^<]+)')
            $loseSetsM = [regex]::Match($r2, 'class="result">([^<]+)')
            $surfM = [regex]::Match($r1, 'class="sColorLong[^"]*"[^>]*>\s*<span title="([^"]+)"', 'Singleline')
            $roundM = [regex]::Match($r1, 'class="round[^"]*"[^>]*>([^<]+)')
            $set1 = @([regex]::Matches($r1, 'class="score">([^<]*)<') | ForEach-Object { $_.Groups[1].Value.Trim() } | Where-Object { $_ -match '^\d+$' })
            $set2 = @([regex]::Matches($r2, 'class="score">([^<]*)<') | ForEach-Object { $_.Groups[1].Value.Trim() } | Where-Object { $_ -match '^\d+$' })
            [void]$meetings.Add([pscustomobject]@{
                year = if ($yearM.Success) { $yearM.Groups[1].Value.Trim() } else { '' }
                tournament = if ($tourM.Success) { (($tourM.Groups[1].Value -replace '<[^>]+>', ' ') -replace '\s+', ' ').Trim() } else { '' }
                winner = if ($winM.Success) { ($winM.Groups[1].Value -replace '&nbsp;', ' ').Trim() } else { '' }
                loser = if ($loseM.Success) { ($loseM.Groups[1].Value -replace '&nbsp;', ' ').Trim() } else { '' }
                winSets = if ($winSetsM.Success) { $winSetsM.Groups[1].Value.Trim() } else { '' }
                loseSets = if ($loseSetsM.Success) { $loseSetsM.Groups[1].Value.Trim() } else { '' }
                surface = if ($surfM.Success) { $surfM.Groups[1].Value } else { '' }
                round = if ($roundM.Success) { ($roundM.Groups[1].Value -replace '\s+', ' ').Trim() } else { '' }
                sets1 = $set1
                sets2 = $set2
            })
        }
    }
    return @{
        ok = $true
        matchId = $matchId
        p1 = $p1
        p2 = $p2
        h1 = if ($h2hM.Success) { [int]$h2hM.Groups[1].Value } else { 0 }
        h2 = if ($h2hM.Success) { [int]$h2hM.Groups[2].Value } else { 0 }
        h2h = if ($h2hM.Success) { $h2hM.Groups[1].Value + '-' + $h2hM.Groups[2].Value } else { '0-0' }
        meetings = $meetings
    }
}

function Normalize-Name([string]$n) {
    ($n -replace '[^a-zA-Z\u00C0-\u024F\s]', '' -replace '\s+', ' ').Trim().ToLower()
}

function Search-TePlayer([string]$name) {
    $q = [uri]::EscapeDataString($name)
    $json = Get-WebFile "https://www.tennisexplorer.com/res/ajax/search.php?s=$q&t=p"
    if (-not $json) { return $null }
    try {
        $obj = $json | ConvertFrom-Json
        if ($obj.links -and $obj.links.Count -gt 0) {
            $first = $obj.links | Where-Object { $_.type -eq 'p' } | Select-Object -First 1
            return $first
        }
    } catch {}
    return $null
}

function Find-TeIdByName([string]$p1, [string]$p2) {
    $html = Get-WebFile "https://www.tennisexplorer.com/matches/?type=all"
    if (-not $html) { return $null }
    $np1 = Normalize-Name $p1
    $np2 = Normalize-Name $p2
    $rows = [regex]::Matches($html, '<tr[^>]*>(.*?)</tr>\s*<tr[^>]*>(.*?)</tr>', 'Singleline')
    foreach ($pr in $rows) {
        $r1 = $pr.Groups[1].Value
        $r2 = $pr.Groups[2].Value
        $name1M = [regex]::Match($r1, 'class="t-name"[^>]*><a[^>]*>([^<]+)</a>')
        $name2M = [regex]::Match($r2, 'class="t-name"[^>]*><a[^>]*>([^<]+)</a>')
        $idM = [regex]::Match($r1, 'href="/match-detail/\?id=(\d+)"')
        if (-not $name1M.Success -or -not $name2M.Success -or -not $idM.Success) { continue }
        $tn1 = Normalize-Name $name1M.Groups[1].Value
        $tn2 = Normalize-Name $name2M.Groups[1].Value
        if (($tn1 -like "*$np1*" -and $tn2 -like "*$np2*") -or ($tn1 -like "*$np2*" -and $tn2 -like "*$np1*")) {
            return $idM.Groups[1].Value
        }
    }
    return $null
}

function Get-H2HByName([string]$p1, [string]$p2) {
    $s1 = Search-TePlayer $p1
    $s2 = Search-TePlayer $p2
    if (-not $s1 -or -not $s2) {
        return @{ ok = $false; error = 'Jugador no encontrado en TennisExplorer'; p1 = $p1; p2 = $p2 }
    }
    $url1 = $s1.url; $url2 = $s2.url
    $html = Get-WebFile "https://www.tennisexplorer.com/mutual/$url1/$url2/"
    if (-not $html) { return @{ ok = $false; error = 'No se pudo obtener H2H'; p1 = $p1; p2 = $p2 } }
    $name1 = ($s1.name -replace '\s*\([A-Z]+\)\s*$', '').Trim()
    $name2 = ($s2.name -replace '\s*\([A-Z]+\)\s*$', '').Trim()
    $scoreM = [regex]::Match($html, 'class="gScore"[^>]*>\s*(\d+)\s*-\s*(\d+)\s*</td>')
    $score = if ($scoreM.Success) { $scoreM.Groups[1].Value + '-' + $scoreM.Groups[2].Value } else { '0-0' }
    $meetings = @()
    $tables = [regex]::Matches($html, '<table[^>]*class="result"[^>]*>([\s\S]*?)</table>')
    $tableContent = ''
    foreach ($t in $tables) {
        if ($t.Groups[1].Value -match '<th[^>]*>Year</th>') { $tableContent = $t.Groups[1].Value; break }
    }
    if ($tableContent) {
        $tbodyM = [regex]::Match($tableContent, '<tbody>([\s\S]*?)</tbody>')
        if ($tbodyM.Success) {
            $allTrs = [regex]::Matches($tbodyM.Groups[1].Value, '<tr[^>]*>([\s\S]*?)</tr>')
            $i = 0
            while ($i -lt $allTrs.Count) {
                $tr1 = $allTrs[$i].Groups[1].Value
                $i++
                if ($i -ge $allTrs.Count) { break }
                $tr2 = $allTrs[$i].Groups[1].Value
                $i++
                $n1M = [regex]::Match($tr1, 'class="t-name"[^>]*>.*?<strong>([^<]+)</strong>', 'Singleline')
                $n2M = [regex]::Match($tr2, 'class="t-name"[^>]*>([^<]+)</td>')
                $winner = if ($n1M.Success) { $n1M.Groups[1].Value.Trim() } else { '' }
                $loser = if ($n2M.Success) { $n2M.Groups[1].Value.Trim() } else { '' }
                $tournM = [regex]::Match($tr1, 'class="t-name"[^>]*>.*?<a[^>]*>([^<]+)</a>', 'Singleline')
                if (-not $tournM.Success) {
                    $tournM = [regex]::Match($tr1, '<a[^>]*href="/[^"]*">([^<]+)</a>')
                }
                $surfM = [regex]::Match($tr1, 'class="sColorLong"[^>]*>.*?title="([^"]*)"', 'Singleline')
                if (-not $surfM.Success) { $surfM = [regex]::Match($tr1, 'class="s-color"[^>]*>.*?title="([^"]*)"', 'Singleline') }
                $sets1 = @(); $sets2 = @()
                $s1All = [regex]::Matches($tr1, 'class="score"[^>]*>([\s\S]*?)</td>')
                $s2All = [regex]::Matches($tr2, 'class="score"[^>]*>([\s\S]*?)</td>')
                foreach ($sm in $s1All) { $v = ($sm.Groups[1].Value -replace '<[^>]+>', '').Trim(); if ($v -and $v -ne '&nbsp;') { $sets1 += $v } }
                foreach ($sm in $s2All) { $v = ($sm.Groups[1].Value -replace '<[^>]+>', '').Trim(); if ($v -and $v -ne '&nbsp;') { $sets2 += $v } }
                $roundM = [regex]::Match($tr1, 'class="round"[^>]*>([\s\S]*?)</td>')
                $yearM = [regex]::Match($tr1, 'class="first"[^>]*>\s*(\d{4})\s*</td>')
                $tourn = if ($tournM.Success) { ($tournM.Groups[1].Value -replace '<[^>]+>', '').Trim() } else { '' }
                $surface = if ($surfM.Success) { $surfM.Groups[1].Value } else { '' }
                $round = if ($roundM.Success) { ($roundM.Groups[1].Value -replace '<[^>]+>', '').Trim() } else { '' }
                $year = if ($yearM.Success) { $yearM.Groups[1].Value } else { '' }
                if ($winner -or $loser) {
                    $meetings += @{
                        year = $year; tournament = $tourn; surface = $surface; round = $round
                        winner = $winner; loser = $loser; sets1 = $sets1; sets2 = $sets2
                    }
                }
            }
        }
    }
    return @{ ok = $true; p1 = $name1; p2 = $name2; h2h = $score; meetings = $meetings }
}

function Get-YoutubeVideos {
    $channels = @(
        @{ name = 'Tennis TV'; id = 'UCbcxFkd6B9xUU54InHv4Tig' },
        @{ name = 'ATP Tour'; id = 'UCY_5h5zaSwN7Or4kIJDYNXA' },
        @{ name = 'WTA'; id = 'UCaBIVVpHjq6j3tSyxwTE-8Q' }
    )
    $videos = [System.Collections.Generic.List[object]]::new()
    foreach ($ch in $channels) {
        $xml = Get-WebFile ("https://www.youtube.com/feeds/videos.xml?channel_id=" + $ch.id)
        if (-not $xml) { continue }
        $entries = [regex]::Matches($xml, '<entry>([\s\S]*?)</entry>')
        foreach ($e in $entries) {
            $b = $e.Groups[1].Value
            $idM = [regex]::Match($b, '<yt:videoId>([\w-]+)</yt:videoId>')
            if (-not $idM.Success) { continue }
            $titleM = [regex]::Match($b, '<title>(.*?)</title>')
            $pubM = [regex]::Match($b, '<published>(.*?)</published>')
            $thumbM = [regex]::Match($b, '<media:thumbnail url="([^"]+)"')
            $title = [System.Net.WebUtility]::HtmlDecode((($titleM.Groups[1].Value -replace '<[^>]+>', '') -replace '\s+', ' ').Trim())
            if (-not $title) { continue }
            [void]$videos.Add([pscustomobject]@{
                id = $idM.Groups[1].Value
                channel = $ch.name
                channelId = $ch.id
                title = $title
                published = if ($pubM.Success) { $pubM.Groups[1].Value } else { '' }
                url = 'https://www.youtube.com/watch?v=' + $idM.Groups[1].Value
                thumb = if ($thumbM.Success) { $thumbM.Groups[1].Value } else { '' }
            })
        }
    }
    $sorted = @($videos | Sort-Object published -Descending)
    return @{ ok = $true; updated = (Get-Date).ToString('s'); channels = @($channels | ForEach-Object { $_.name }); videos = $sorted }
}

function Get-TennisExplorerResults {
    $html = Get-WebFile 'https://www.tennisexplorer.com/matches/?type=all'
    if (-not $html) { return @{ ok = $false; error = 'tennisexplorer no disponible' } }
    $finished = [System.Collections.Generic.List[object]]::new()

    $allRows = [regex]::Matches($html, '<tr\b([^>]*)>(.*?)</tr>', 'Singleline')
    $currentTournament = ''
    $currentTour = 'atp'
    $prevRow = $null
    $prevRowAttrs = $null

    foreach ($m in $allRows) {
        $rowAttrs = $m.Groups[1].Value
        $rowHtml = $m.Groups[2].Value
        if ($rowAttrs -match 'class="head\s+flags"') {
            $tnameM = [regex]::Match($rowHtml, '<a[^>]*href="/[^"]*">([^<]*(?:<[^>]*>[^<]*)*)</a>', 'Singleline')
            if ($tnameM.Success) {
                $raw = ($tnameM.Groups[1].Value -replace '<[^>]*>', '') -replace '&nbsp;', ''
                $raw = [System.Net.WebUtility]::HtmlDecode($raw).Trim()
                $currentTournament = $raw -replace '\s+', ' '
            }
            $hrefM = [regex]::Match($rowHtml, 'href="(/[^"]*?/(atp-men|wta-women)/[^"]*)"')
            if ($hrefM.Success) {
                $currentTour = if ($hrefM.Groups[2].Value -eq 'atp-men') { 'atp' } else { 'wta' }
            }
            $prevRow = $null
            $prevRowAttrs = $null
            continue
        }
        if ($null -ne $prevRow -and ($rowAttrs -match 'class="(one|two)')) {
            $r1 = $prevRow
            $r2 = $rowHtml
            $idM = [regex]::Match($r1, 'href="/match-detail/\?id=(\d+)"')
            if (-not $idM.Success) { $prevRow = $null; continue }
            $name1M = [regex]::Match($r1, 'class="t-name"[^>]*><a[^>]*>([^<]+)</a>')
            $name2M = [regex]::Match($r2, 'class="t-name"[^>]*><a[^>]*>([^<]+)</a>')
            if (-not $name1M.Success -or -not $name2M.Success) { $prevRow = $null; continue }
            $p1 = (($name1M.Groups[1].Value -replace '&nbsp;', ' ') -replace '\s+', ' ').Trim()
            $p2 = (($name2M.Groups[1].Value -replace '&nbsp;', ' ') -replace '\s+', ' ').Trim()
            $res1M = [regex]::Match($r1, 'class="result">([^<]+)<')
            $res2M = [regex]::Match($r2, 'class="result">([^<]+)<')
            if (-not $res1M.Success -or -not $res2M.Success) { $prevRow = $null; continue }
            $res1 = $res1M.Groups[1].Value.Trim(); $res2 = $res2M.Groups[1].Value.Trim()
            if ($res1 -eq '' -or $res2 -eq '' -or $res1 -eq '&nbsp;' -or $res2 -eq '&nbsp;') { $prevRow = $null; continue }
            if ($res1 -notmatch '\d' -or $res2 -notmatch '\d') { $prevRow = $null; continue }
            $s1 = @(); foreach ($sm in [regex]::Matches($r1, 'class="score">([^<]*)<')) { $v = $sm.Groups[1].Value -replace '&nbsp;', ''; if ($v -ne '') { $s1 += $v } }
            $s2 = @(); foreach ($sm in [regex]::Matches($r2, 'class="score">([^<]*)<')) { $v = $sm.Groups[1].Value -replace '&nbsp;', ''; if ($v -ne '') { $s2 += $v } }
            $roundM = [regex]::Match($r1, 'class="round"[^>]*>([^<]+)<')
            $surfM = [regex]::Match($r1, 'class="s-color"[^>]*>\s*<span[^>]*>([^<]+)</span>')
            $r1Num = 0; $r2Num = 0; [void][int]::TryParse(($res1 -replace '[^0-9]', ''), [ref]$r1Num); [void][int]::TryParse(($res2 -replace '[^0-9]', ''), [ref]$r2Num)
            $w1 = $r1Num -gt $r2Num
            $ls1 = @(); foreach ($v in $s1) { $val = 0; $ok = [int]::TryParse($v, [ref]$val); $ls1 += @{ value = if ($ok) { $val } else { $null }; tiebreak = $null; winner = $false } }
            $ls2 = @(); foreach ($v in $s2) { $val = 0; $ok = [int]::TryParse($v, [ref]$val); $ls2 += @{ value = if ($ok) { $val } else { $null }; tiebreak = $null; winner = $false } }
            for ($i = 0; $i -lt [Math]::Max($ls1.Count, $ls2.Count); $i++) {
                $v1 = if ($i -lt $ls1.Count) { $ls1[$i].value } else { $null }
                $v2 = if ($i -lt $ls2.Count) { $ls2[$i].value } else { $null }
                if ($null -ne $v1 -and $null -ne $v2) { if ($v1 -gt $v2) { $ls1[$i].winner = $true } else { $ls2[$i].winner = $true } }
            }
            $isDoubles = $currentTournament -match 'doubles' -or $p1 -match ' / '
            $type = if ($currentTour -eq 'atp') {
                if ($isDoubles) { "Men's Doubles" } else { "Men's Singles" }
            } else {
                if ($isDoubles) { "Women's Doubles" } else { "Women's Singles" }
            }
            $finished.Add([pscustomobject]@{
                id = 'te-' + $idM.Groups[1].Value; state = 'post'
                tour = $currentTour
                type = $type
                round = if ($roundM.Success) { $roundM.Groups[1].Value.Trim() } else { '' }
                tournamentId = 'te-' + $idM.Groups[1].Value
                tournamentName = $currentTournament
                surface = if ($surfM.Success) { $surfM.Groups[1].Value.Trim() } else { '' }
                competitors = @(
                    @{ name = $p1; winner = $w1; homeAway = 'home'; flag = ''; flagAlt = ''; linescores = @($ls1) }
                    @{ name = $p2; winner = (-not $w1); homeAway = 'away'; flag = ''; flagAlt = ''; linescores = @($ls2) }
                )
            })
            $prevRow = $null
            $prevRowAttrs = $null
        } else {
            $prevRow = $rowHtml
            $prevRowAttrs = $rowAttrs
        }
    }
    return @{ ok = $true; updated = (Get-Date).ToString('s'); count = $finished.Count; matches = @($finished) }
}

function Get-TournamentSeedsFromPage([string]$url) {
    try {
        $html = Get-WebFile $url
        if (-not $html) { return @{} }
        $seedM = [regex]::Matches($html, '<a href="/(player|doubles-team)/([^"]*)">([^<]+)</a>\s*\[(\d+)\]')
        $entries = [System.Collections.Generic.List[object]]::new()
        foreach ($m in $seedM) {
            $kind = $m.Groups[1].Value
            $slug = $m.Groups[2].Value.Trim()
            $name = $m.Groups[3].Value.Trim()
            $seed = [int]$m.Groups[4].Value
            if ($name) { [void]$entries.Add([pscustomobject]@{ kind = $kind; slug = $slug; name = $name; seed = $seed }) }
        }

        $groups = @{}
        foreach ($e in $entries) {
            if (-not $groups.ContainsKey($e.name)) { $groups[$e.name] = [System.Collections.Generic.List[object]]::new() }
            [void]$groups[$e.name].Add($e)
        }

        $result = @{}
        foreach ($g in $groups.GetEnumerator()) {
            $list = $g.Value
            $distinctSeeds = @($list | ForEach-Object { $_.seed } | Sort-Object -Unique)
            if ($distinctSeeds.Count -eq 1) {
                $result[$g.Key] = $distinctSeeds[0]
                continue
            }
            # Colision real: mismo apellido con sembrados distintos (ej. dos Jones).
            # Resolver nombre completo desde la pagina del jugador; si falla, descartar el grupo entero.
            if ($list.Count -gt 8) { continue }
            $resolved = @{}
            $okAll = $true
            foreach ($e in $list) {
                $full = $null
                if ($e.kind -eq 'player' -and $e.slug) {
                    try {
                        $ph = Get-WebFile ("https://www.tennisexplorer.com/player/" + ($e.slug -replace '^player/', ''))
                        if ($ph) {
                            $tm = [regex]::Match($ph, '<title>\s*(.+?)\s+[-\u2013]\s+Tennis Explorer\s*</title>')
                            if ($tm.Success) { $full = $tm.Groups[1].Value.Trim() }
                        }
                    } catch { $full = $null }
                }
                if (-not $full) { $okAll = $false; break }
                if ($resolved.ContainsKey($full) -and $resolved[$full] -ne $e.seed) { $okAll = $false; break }
                $resolved[$full] = $e.seed
            }
            if ($okAll) {
                foreach ($kv in $resolved.GetEnumerator()) { $result[$kv.Key] = $kv.Value }
            }
            # si no se resolvio, el grupo se descarta: mejor sin badge que un sembrado falso
        }
        return $result
    } catch {
        return @{}
    }
}

function Get-WeeklySeeds {
    try {
        $html = Get-WebFile "https://www.tennisexplorer.com/"
        if (-not $html) { return @{ ok = $false; error = "No se pudo cargar TennisExplorer" } }

        $linkM = [regex]::Matches($html, 'href="(/[^/]+/\d{4}/(atp-men|wta-women)/[^"]*)"')
        $seen = @{}
        foreach ($m in $linkM) {
            $url = $m.Groups[1].Value -replace '\?.*$', ''
            $circuit = $m.Groups[2].Value
            $key = "${url}"
            if (-not $seen.ContainsKey($key)) { $seen[$key] = $circuit }
        }

        $tournaments = [System.Collections.Generic.List[object]]::new()
        foreach ($entry in $seen.GetEnumerator()) {
            $baseUrl = $entry.Key
            $circuit = $entry.Value
            $rawName = ($baseUrl -replace '/\d{4}/.*$', '' -replace '^/' -replace '/',' ' -replace '-',' ')
            $name = (Get-Culture).TextInfo.ToTitleCase($rawName)

            $singles = Get-TournamentSeedsFromPage ("https://www.tennisexplorer.com" + $baseUrl)
            $doubles = Get-TournamentSeedsFromPage ("https://www.tennisexplorer.com" + $baseUrl + "?type=double")

            [void]$tournaments.Add([pscustomobject]@{
                name = $name
                url = $baseUrl
                circuit = if ($circuit -eq 'atp-men') { 'ATP' } else { 'WTA' }
                singles = $singles
                doubles = $doubles
            })
        }

        $allSingles = @{}
        $allDoubles = @{}
        foreach ($t in $tournaments) {
            $prefix = if ($t.circuit -eq 'ATP') { 'ATP' } else { 'WTA' }
            foreach ($kv in $t.singles.GetEnumerator()) {
                $pk = "${prefix}::$($kv.Key)"
                $allSingles[$pk] = $kv.Value
            }
            foreach ($kv in $t.doubles.GetEnumerator()) {
                $pk = "${prefix}::$($kv.Key)"
                $allDoubles[$pk] = $kv.Value
            }
        }

        return @{
            ok = $true
            updated = (Get-Date).ToString('s')
            tournaments = @($tournaments)
            singles = $allSingles
            doubles = $allDoubles
        }
    } catch {
        return @{ ok = $false; error = $_.Exception.Message }
    }
}

function Get-TennisAbstractElo([string]$gender) {
    $url = if ($gender -eq 'atp') {
        'https://www.tennisabstract.com/reports/atp_elo_ratings.html'
    } else {
        'https://www.tennisabstract.com/reports/wta_elo_ratings.html'
    }
    try {
        $html = Get-WebFile $url
        if (-not $html) { return @{ ok = $false; error = "No se pudo cargar $url" } }
        $tableM = [regex]::Match($html, '<table[^>]*id="reportable"[^>]*>([\s\S]*?)</table>')
        if (-not $tableM.Success) { return @{ ok = $false; error = 'Tabla Elo no encontrada' } }
        $tableHtml = $tableM.Groups[1].Value
        $rows = [regex]::Matches($tableHtml, '<tr>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>.*?</td>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>.*?</td>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>.*?</td>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*</tr>')
        $result = [System.Collections.Generic.List[object]]::new()
        foreach ($r in $rows) {
            $cells = @($r.Groups[1..16] | ForEach-Object { ($_ -replace '<[^>]+>', '' -replace '&nbsp;', ' ' -replace '&#\d+;', '').Trim() })
            $name = ($cells[1] -replace '\s+', ' ').Trim()
            if (-not $name) { continue }
            [void]$result.Add([pscustomobject]@{
                rank = $cells[0]
                player = $name
                age = $cells[2]
                elo = $cells[3]
                hElo = $cells[5]
                cElo = $cells[7]
                gElo = $cells[9]
                peakElo = $cells[12]
                peakMonth = $cells[13]
                officialRank = $cells[15]
            })
        }
        return @{ ok = $true; updated = (Get-Date).ToString('s'); players = @($result) }
    } catch {
        return @{ ok = $false; error = $_.Exception.Message }
    }
}

function Search-TAPlayer([string]$name) {
    $slug = $name -replace '\s+', '' -replace '[^a-zA-Z0-9]', ''
    $url = "https://www.tennisabstract.com/cgi-bin/player-classic.cgi?p=$slug"
    try {
        $html = Get-WebFile $url
        if (-not $html) { return $null }
        if ($html -match 'var matchmx = \[') { return @{ html = $html; slug = $slug } }
        return $null
    } catch { return $null }
}

function Get-MatchStats([string]$p1Name, [string]$p2Name) {
    $p1 = Search-TAPlayer $p1Name
    if (-not $p1) { return @{ ok = $false; error = "Jugador no encontrado en TennisAbstract: $p1Name" } }
    $html = $p1.html
    $idx = $html.IndexOf('var matchmx = ')
    if ($idx -lt 0) { return @{ ok = $false; error = 'Datos de partidos no encontrados' } }
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
        $m = $matchmx[$i]
        $opp = [string]$m[11]
        if ($opp.ToLower().Contains($p2Lower) -or $p2Lower.Contains($opp.ToLower())) {
            $found = $m
            break
        }
    }
    if (-not $found) {
        $recent = @()
        $n = [Math]::Min(5, $matchmx.Count)
        for ($i = 0; $i -lt $n; $i++) { $recent += [string]$matchmx[$i][11] }
        return @{ ok = $false; error = "No se encontro partido contra $p2Name. Recientes: $($recent -join ', ')" }
    }
    $m = $found
    $stats = @{
        date = [string]$m[0]
        tournament = [string]$m[1]
        surface = [string]$m[2]
        round = [string]$m[8]
        score = [string]$m[9]
        result = [string]$m[4]
        opponent = [string]$m[11]
        ranking = [string]$m[5]
        oppRanking = [string]$m[12]
        seed = [string]$m[6]
        oppSeed = [string]$m[13]
        aces = [string]$m[21]
        dfs = [string]$m[22]
        pts = [string]$m[23]
        firsts = [string]$m[24]
        fwon = [string]$m[25]
        swon = [string]$m[26]
        games = [string]$m[27]
        saved = [string]$m[28]
        chances = [string]$m[29]
        oaces = [string]$m[30]
        odfs = [string]$m[31]
        opts = [string]$m[32]
        ofirsts = [string]$m[33]
        ofwon = [string]$m[34]
        oswon = [string]$m[35]
        ogames = [string]$m[36]
        osaved = [string]$m[37]
        ochances = [string]$m[38]
    }
    return @{ ok = $true; player = $p1Name; stats = $stats }
}

function Extract-TAMatchmx([string]$text, [string]$marker) {
    $idx = $text.IndexOf($marker)
    if ($idx -lt 0) { return $null }
    $start = $idx + $marker.Length
    $depth = 0; $end = $start
    for ($i = $start; $i -lt $text.Length; $i++) {
        $c = $text[$i]
        if ($c -eq '[') { $depth++ }
        elseif ($c -eq ']') { $depth--; if ($depth -eq 0) { $end = $i + 1; break } }
    }
    if ($end -le $start) { return $null }
    $json = $text.Substring($start, $end - $start)
    try { $arr = $json | ConvertFrom-Json } catch { return $null }
    if (-not $arr -or $arr.Count -eq 0) { return $null }
    return $arr
}

function Resolve-TAName([string]$name) {
    if (($name -split '\s+').Count -ge 2) { return $name }
    $n = Normalize-Name $name
    if (-not $n) { return $null }
    foreach ($g in @('atp', 'wta')) {
        $elo = Get-Cached "elo_$g" { Get-TennisAbstractElo $g } 21600
        if ($elo -and $elo.ok -and $elo.players) {
            $hits = @($elo.players | Where-Object { $pn = Normalize-Name $_.player; $pn -eq $n -or $pn.EndsWith(" $n") })
            if ($hits.Count -ge 1) { return [string]$hits[0].player }
        }
    }
    return $null
}

function Convert-FragDate([string]$d) {
    $map = @{ Jan = '01'; Feb = '02'; Mar = '03'; Apr = '04'; May = '05'; Jun = '06'; Jul = '07'; Aug = '08'; Sep = '09'; Oct = '10'; Nov = '11'; Dec = '12' }
    if ($d -match '^(\d{1,2})-([A-Za-z]{3})-(\d{4})$') {
        $mm = $map[$Matches[2]]
        if ($mm) { return $Matches[3] + $mm + $Matches[1].PadLeft(2, '0') }
    }
    return $d
}

function Parse-TAFrag([string]$text) {
    $rows = [regex]::Matches($text, '<tr><td[^>]*>\d{1,2}-[A-Za-z]{3}-\d{4}</td>[\s\S]*?</tr>')
    $out = @()
    foreach ($r in $rows) {
        $rowHtml = $r.Value
        $tds = @()
        foreach ($tm in [regex]::Matches($rowHtml, '<td[^>]*>([\s\S]*?)</td>')) { $tds += $tm.Groups[1].Value }
        if ($tds.Count -lt 6) { continue }
        $dateRaw = ($tds[0] -replace '<[^>]+>', '').Trim()
        $tourn = ($tds[1] -replace '<[^>]+>', '').Trim()
        $surf = ($tds[2] -replace '<[^>]+>', '').Trim()
        $round = ($tds[3] -replace '<[^>]+>', '').Trim()
        $mi = -1
        for ($i = 4; $i -lt $tds.Count; $i++) {
            if ($tds[$i] -match '<b>' -or $tds[$i] -match '<a\s') { $mi = $i; break }
        }
        if ($mi -lt 0 -or ($mi + 1) -ge $tds.Count) { continue }
        $matchCell = $tds[$mi]
        $score = (($tds[$mi + 1]) -replace '<[^>]+>', '' -replace '&nbsp;', ' ').Trim()
        if (-not $score -or $matchCell -match '>\s*vs\s*<') { continue }
        $boldM = [regex]::Match($matchCell, '<b>([^<]+)</b>')
        $linkM = [regex]::Match($matchCell, '<a[^>]*>([^<]+)</a>')
        if (-not $boldM.Success -or -not $linkM.Success) { continue }
        $out += @{
            date = Convert-FragDate $dateRaw
            tournament = $tourn
            surface = $surf
            round = $round
            score = $score
            winner = $boldM.Groups[1].Value.Trim()
            loser = $linkM.Groups[1].Value.Trim()
            selfLink = ([regex]::Match($matchCell, 'href="[^"]*p=([A-Za-z0-9]+)"')).Groups[1].Value
        }
    }
    return $out
}

function Get-TAH2H([string]$p1Name, [string]$p2Name) {
    $rp1 = Resolve-TAName $p1Name
    $rp2 = Resolve-TAName $p2Name
    if (-not $rp1) { return @{ ok = $false; error = "Jugador no encontrado: $p1Name. Proba con el nombre completo (ej. Rafael Nadal)." } }
    if (-not $rp2) { return @{ ok = $false; error = "Jugador no encontrado: $p2Name. Proba con el nombre completo (ej. Rafael Nadal)." } }
    $slug = ($rp1 -replace '\s+', '' -replace '[^a-zA-Z0-9]', '')
    if (-not $slug) { return @{ ok = $false; error = 'Falta el nombre del jugador' } }
    $q1 = Normalize-Name $rp2
    $nr1 = Normalize-Name $rp1
    $sur1 = ($nr1 -split '\s+')[-1]
    $realName = ''
    $meetings = @()

    $html = Get-WebFile "https://www.tennisabstract.com/cgi-bin/player-classic.cgi?p=$slug"
    if ($html -and $html -match 'var matchmx = \[') {
        $fnM = [regex]::Match($html, 'Tennis Abstract:\s*(.+?)\s+Match Results')
        if ($fnM.Success) { $realName = $fnM.Groups[1].Value.Trim() }
        $arr = Extract-TAMatchmx $html 'var matchmx = '
        if ($arr) {
            foreach ($m in $arr) {
                $opp = [string]$m[11]
                $no = Normalize-Name $opp
                if (-not $no -or -not ($no.Contains($q1) -or $q1.Contains($no))) { continue }
                $isWin = ([string]$m[4]) -eq 'W'
                $meetings += @{
                    date = [string]$m[0]; tournament = [string]$m[1]; surface = [string]$m[2]
                    round = [string]$m[8]; score = [string]$m[9]
                    winner = if ($isWin) { $realName } else { $opp }
                    loser = if ($isWin) { $opp } else { $realName }
                }
            }
        }
    }

    if (-not $meetings -or $meetings.Count -eq 0) {
        $frag = Get-WebFile "https://www.tennisabstract.com/jsfrags/$slug.js"
        if ($frag) {
            $fMeetings = Parse-TAFrag $frag
            foreach ($fm in $fMeetings) {
                $nw = Normalize-Name $fm.winner
                $nl = Normalize-Name $fm.loser
                if (-not (($nw -eq $nr1 -or $nw -eq $sur1) -or ($nl -eq $nr1))) { continue }
                if (-not (($nw.Contains($q1) -or $q1.Contains($nw)) -or ($nl.Contains($q1) -or $q1.Contains($nl)))) { continue }
                $winFull = if ($nw -eq $sur1 -or $nw -eq $nr1) { $rp1 } else { $fm.winner }
                $loseFull = if ($nl -eq $nr1) { $rp1 } else { $fm.loser }
                $meetings += @{
                    date = $fm.date; tournament = $fm.tournament; surface = $fm.surface
                    round = $fm.round; score = $fm.score; winner = $winFull; loser = $loseFull
                }
            }
            if ($meetings.Count -gt 0 -and -not $realName) { $realName = $rp1 }
        }
    }

    if (-not $meetings -or $meetings.Count -eq 0) {
        $js = Get-WebFile "https://www.tennisabstract.com/jsmatches/$slug.js"
        if ($js) {
            $fnM2 = [regex]::Match($js, "var\s+fullname\s*=\s*'([^']+)'")
            if ($fnM2.Success) { $realName = $fnM2.Groups[1].Value.Trim() }
            $arr2 = Extract-TAMatchmx $js 'matchmx = '
            if ($arr2) {
                foreach ($m in $arr2) {
                    $opp = [string]$m[11]
                    $no = Normalize-Name $opp
                    if (-not $no -or -not ($no.Contains($q1) -or $q1.Contains($no))) { continue }
                    $isWin = ([string]$m[4]) -eq 'W'
                    $meetings += @{
                        date = [string]$m[0]; tournament = [string]$m[1]; surface = [string]$m[2]
                        round = [string]$m[8]; score = [string]$m[9]
                        winner = if ($isWin) { $realName } else { $opp }
                        loser = if ($isWin) { $opp } else { $realName }
                    }
                }
            }
        }
    }

    if (-not $meetings -or $meetings.Count -eq 0) {
        return @{ ok = $false; error = "No se encontraron partidos entre $rp1 y $rp2." }
    }
    $wins = 0; $losses = 0
    foreach ($mt in $meetings) {
        $nw = Normalize-Name $mt.winner
        if ($nw -eq $nr1 -or $nw -eq $sur1) { $wins++ } else { $losses++ }
    }
    return @{ ok = $true; p1 = $(if ($realName) { $realName } else { $rp1 }); p2 = $rp2; h2h = "$wins-$losses"; source = 'tennisabstract'; meetings = $meetings }
}

function Get-TennisAbstractCurrentTour {
    try {
        $html = Get-WebFile 'https://www.tennisabstract.com/'
        if (-not $html) { return @{ ok = $false; error = 'No se pudo cargar TennisAbstract' } }
        $html = $html -replace '<!--[\s\S]*?-->', ''
        $m = [regex]::Match($html, '<table[^>]*id="current-events"[^>]*>[\s\S]*?<tbody>([\s\S]*?)</tbody>')
        if (-not $m.Success) { return @{ ok = $false; error = 'Seccion current-events no encontrada' } }
        $body = $m.Groups[1].Value
        $cells = [regex]::Matches($body, '<td[^>]*>([\s\S]*?)</td>')
        if ($cells.Count -lt 3) { return @{ ok = $false; error = 'Se esperaban 3 columnas' } }
        $categories = @('women', 'men', 'challenger')
        $tour = @{}
        for ($i = 0; $i -lt 3; $i++) {
            $cellHtml = $cells[$i].Groups[1].Value
            $tournaments = [System.Collections.Generic.List[object]]::new()
            $blocks = [regex]::Matches($cellHtml, '<b>(.*?)</b>[\s\S]*?<a href="([^"]*)"[^>]*>Results and Forecasts</a>[\s\S]*?Favorite: <a[^>]*>(.*?)</a>,\s*([\d.]+)%')
            foreach ($b in $blocks) {
                $name = ($b.Groups[1].Value -replace '<[^>]+>', '').Trim()
                $href = $b.Groups[2].Value.Trim()
                $fav = ($b.Groups[3].Value -replace '<[^>]+>', '').Trim()
                $favPct = $b.Groups[4].Value.Trim()
                $detailUrl = if ($href -match '^https?://') { $href } else { "https://www.tennisabstract.com$href" }
                $detail = $null
                try {
                    $dhtml = Get-WebFile $detailUrl
                    if ($dhtml) {
                        $upcoming = ''
                        $completed = ''
                        $forecast = ''
                        try {
                            $um = [regex]::Match($dhtml, "var\s+upcomingSingles\s*=\s*'([\s\S]*?)'")
                            if ($um.Success) { $upcoming = $um.Groups[1].Value }
                            $cm = [regex]::Match($dhtml, "var\s+completedSingles\s*=\s*'([\s\S]*?)'")
                            if ($cm.Success) { $completed = $cm.Groups[1].Value }
                            $fm = [regex]::Match($dhtml, "var\s+projCurrent\s*=\s*'([\s\S]*?)'")
                            if ($fm.Success) { $forecast = $fm.Groups[1].Value }
                        } catch {}
                        $detail = @{ upcoming = $upcoming; completed = $completed; forecast = $forecast }
                    }
                } catch { }
                [void]$tournaments.Add([pscustomobject]@{
                    name = $name
                    url = $detailUrl
                    favorite = $fav
                    favoritePct = $favPct
                    detail = $detail
                })
            }
            $tour[$categories[$i]] = @($tournaments)
        }
        return @{ ok = $true; updated = (Get-Date).ToString('s'); tour = $tour }
    } catch {
        return @{ ok = $false; error = $_.Exception.Message }
    }
}

function Get-LiveRanking([string]$tour, [bool]$isRace, [bool]$isOfficial) {
    $slug = if ($isOfficial) { "official-$tour-ranking" } elseif ($isRace) { "$tour-race" } else { "$tour-live-ranking" }
    $url = "https://live-tennis.eu/en/$slug"
    try {
        $tmp = [System.IO.Path]::GetTempFileName()
        $ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'
        $code = & curl.exe -s -o $tmp -w '%{http_code}' -A $ua --max-time 30 --compressed $url
        if ($code -ne '200') { Remove-Item $tmp -Force -ErrorAction SilentlyContinue; return @{ ok = $false; error = "http $code"; rows = @() } }
        $html = [System.IO.File]::ReadAllText($tmp)
        Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    } catch {
        return @{ ok = $false; error = $_.Exception.Message; rows = @() }
    }
    $rows = @()
    $trMatches = [regex]::Matches($html, '<tr[^>]*>.*?</tr>', [System.Text.RegularExpressions.RegexOptions]::Singleline)
    foreach ($tr in $trMatches) {
        $t = $tr.Value
        if ($t -notmatch 'class="?pn"?') { continue }
        $rankM = [regex]::Match($t, 'class="?rk"?>\s*(\d+)')
        if (-not $rankM.Success) { continue }
        $nameM = [regex]::Match($t, 'class="?pn"?>\s*(.*?)</td>', [System.Text.RegularExpressions.RegexOptions]::Singleline)
        $name = $nameM.Groups[1].Value -replace '<[^>]+>', ''
        $name = [System.Net.WebUtility]::HtmlDecode($name)
        $name = (($name -replace '\s+', ' ').Trim()) -replace '^[^\w]+', ''
        $country = ''
        $cM = [regex]::Match($t, 'class="?sm"?\s+p="?[\d.]+"?>\s*([A-Z]{3})\s*<')
        if ($cM.Success) { $country = $cM.Groups[1].Value }
        $afterIdx = if ($cM.Success) { $cM.Index + $cM.Length } else { $nameM.Index + $nameM.Length }
        $pts = ''
        $pM = [regex]::Match($t.Substring($afterIdx), '<td>\s*(\d[\d.]*)\s*</td>')
        if ($pM.Success) { $pts = $pM.Groups[1].Value }
        $move = 0
        $mM = [regex]::Match($t, 'class="?rdf"?>\s*([+-]?\d+)\s*<')
        if ($mM.Success) { $move = [int]$mM.Groups[1].Value }
        $rows += @{ rank = [int]$rankM.Groups[1].Value; name = $name; country = $country; points = $pts; move = $move }
    }
    return @{ ok = ($rows.Count -gt 0); source = 'live-tennis.eu'; updated = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'); race = $isRace; official = $isOfficial; tour = $tour; rows = $rows }
}

function Handle-Request([System.Net.HttpListenerContext]$ctx) {
    $req = $ctx.Request
    $resp = $ctx.Response
    try {
        $path = $req.Url.AbsolutePath
        $q = Get-UriQuery $req.Url

        if ($path -eq '/api/rankings/atp') {
            $type = if ($q['type'] -eq 'doubles') { 'doubles' } else { 'singles' }
            $data = Get-Cached "atp_$type" { Get-AtpRankings $type } 600
            Send-Json $resp $data
            return
        }
        if ($path -eq '/api/rankings/wta') {
            $type = if ($q['type'] -eq 'doubles') { 'doubles' } else { 'singles' }
            $data = Get-Cached "wta_$type" { Get-WtaRankings $type } 600
            Send-Json $resp $data
            return
        }
        if ($path -eq '/api/rankings/live') {
            $tour = if ($q['tour'] -eq 'wta') { 'wta' } else { 'atp' }
            $isRace = ($q['race'] -eq '1')
            $isOfficial = ($q['official'] -eq '1')
            $tltl = if ($isOfficial) { 300 } else { 60 }
$data = Get-Cached "lt_${tour}_$isRace_$isOfficial" { Get-LiveRanking $tour $isRace $isOfficial } $tltl
            Send-Json $resp $data
            return
        }
        if ($path -eq '/api/live/atp') {
            $level = if ($q['level'] -eq 'challenger') { 'challenger' } else { 'tour' }
            $data = Get-Cached "atp_live_$level" { Get-AtpLive $level } 5
            Send-Json $resp $data
            return
        }
        if ($path -eq '/api/live/chall') {
            $data = Get-Cached 'chall_live' { Get-ChallengerLive } 5
            Send-Json $resp $data
            return
        }
        if ($path -eq '/api/mixed/live') {
            $data = Get-Cached 'mixed_live' { Get-MixedLive } 10
            Send-Json $resp $data
            return
        }
        if ($path -eq '/api/serving') {
            $data = Get-Cached 'tenniscom_serving' { Get-TennisComServing } 30
            Send-Json $resp $data
            return
        }
        if ($path -eq '/api/itf/live') {
            $data = Get-Cached 'itf_live' { Get-ItfLive } 60
            Send-Json $resp $data
            return
        }
        if ($path -eq '/api/live/all') {
            $data = Get-Cached 'live_all' { Get-LiveAll } 20
            Send-Json $resp $data
            return
        }
        if ($path -eq '/api/calendar/atp') {
            $data = Get-Cached 'calendar_atp' { Get-TournamentCalendar 'atp' } 21600
            Send-Json $resp $data
            return
        }
        if ($path -eq '/api/calendar/wta') {
            $data = Get-Cached 'calendar_wta' { Get-TournamentCalendar 'wta' } 21600
            Send-Json $resp $data
            return
        }
        if ($path -eq '/api/calendar/chall') {
            $data = Get-Cached 'calendar_chall' { Get-ChallengerCalendar } 21600
            Send-Json $resp $data
            return
        }
        if ($path -eq '/api/calendar/itf') {
            $itfFile = Join-Path $root 'calendar_itf.json'
            if (Test-Path -LiteralPath $itfFile -PathType Leaf) {
                $raw = [System.IO.File]::ReadAllText($itfFile, [System.Text.Encoding]::UTF8)
                $resp.ContentType = 'application/json; charset=utf-8'
                $buf = [System.Text.Encoding]::UTF8.GetBytes($raw)
                $resp.ContentLength64 = $buf.Length
                $resp.OutputStream.Write($buf, 0, $buf.Length)
            } else {
                Send-Json $resp @{ ok = $false; error = 'calendar_itf.json not found (correr scripts/update-calendars-chall-itf.ps1)' }
            }
            return
        }
        if ($path -eq '/api/news') {
            $data = Get-Cached 'news' { Get-TennisNews } 600
            Send-Json $resp $data
            return
        }
        if ($path -eq '/api/videos') {
            $data = Get-Cached 'youtube_videos' { Get-YoutubeVideos } 300
            Send-Json $resp $data
            return
        }
        if ($path -eq '/api/h2h') {
            if (-not $q['matchId'] -or $q['matchId'] -notmatch '^\d+$') {
                Send-Error $resp 400 'matchId invalido'
                return
            }
            $data = Get-Cached ("h2h_" + $q['matchId']) { Get-MatchH2H $q['matchId'] } 21600
            Send-Json $resp $data
            return
        }
        if ($path -eq '/api/h2h/byname') {
            $n1 = if ($q['p1']) { $q['p1'].Trim() } else { '' }
            $n2 = if ($q['p2']) { $q['p2'].Trim() } else { '' }
            if (-not $n1 -or -not $n2) {
                Send-Error $resp 400 'Faltan parametros p1 y p2'
                return
            }
            $key = ("h2h_name_{0}_vs_{1}" -f ($n1 -replace '\s+','_'), ($n2 -replace '\s+','_')).ToLower()
            $data = Get-Cached $key { Get-H2HByName $n1 $n2 } 3600
            Send-Json $resp $data
            return
        }
        if ($path -eq '/api/h2h/ta') {
            $n1 = if ($q['p1']) { $q['p1'].Trim() } else { '' }
            $n2 = if ($q['p2']) { $q['p2'].Trim() } else { '' }
            if (-not $n1 -or -not $n2) {
                Send-Error $resp 400 'Faltan parametros p1 y p2'
                return
            }
            $key = ("ta_h2h_{0}_vs_{1}" -f ($n1 -replace '\s+','_'), ($n2 -replace '\s+','_')).ToLower()
            $data = Get-Cached $key { Get-TAH2H $n1 $n2 } 3600
            Send-Json $resp $data
            return
        }
        if ($path -eq '/api/seeds') {
            $data = Get-Cached 'weekly_seeds' { Get-WeeklySeeds } 1800
            Send-Json $resp $data
            return
        }
        if ($path -eq '/api/elo') {
            $atp = Get-Cached 'elo_atp' { Get-TennisAbstractElo 'atp' } 21600
            $wta = Get-Cached 'elo_wta' { Get-TennisAbstractElo 'wta' } 21600
            Send-Json $resp @{ ok = $true; atp = $atp.players; wta = $wta.players; updated = (Get-Date).ToString('s') }
            return
        }
        if ($path -eq '/api/stats') {
            $n1 = if ($q['p1']) { $q['p1'].Trim() } else { '' }
            $n2 = if ($q['p2']) { $q['p2'].Trim() } else { '' }
            if (-not $n1 -or -not $n2) {
                Send-Error $resp 400 'Faltan parametros p1 y p2'
                return
            }
            $key = ("stats_{0}_vs_{1}" -f ($n1 -replace '\s+','_'), ($n2 -replace '\s+','_')).ToLower()
            $data = Get-Cached $key { Get-MatchStats $n1 $n2 } 3600
            Send-Json $resp $data
            return
        }
        if ($path -eq '/api/results') {
            $data = Get-Cached 'te_results' { Get-TennisExplorerResults } 300
            Send-Json $resp $data
            return
        }
        if ($path -eq '/api/current-tour') {
            $data = Get-Cached 'current_tour' { Get-TennisAbstractCurrentTour } 300
            Send-Json $resp $data
            return
        }
        if ($path -eq '/api/wheelchair') {
            $wcFile = Join-Path $root 'wheelchair.json'
            if (Test-Path -LiteralPath $wcFile -PathType Leaf) {
                $raw = [System.IO.File]::ReadAllText($wcFile, [System.Text.Encoding]::UTF8)
                $resp.ContentType = 'application/json; charset=utf-8'
                $buf = [System.Text.Encoding]::UTF8.GetBytes($raw)
                $resp.ContentLength64 = $buf.Length
                $resp.OutputStream.Write($buf, 0, $buf.Length)
            } else {
                Send-Json $resp @{ ok = $false; error = 'wheelchair.json not found' }
            }
            return
        }
        if ($path -eq '/api/health') {
            Send-Json $resp @{ ok = $true; time = (Get-Date).ToString('s') }
            return
        }

        if ($path -eq '/' -or $path -eq '/index.html') {
            Send-File $resp (Join-Path $root 'index.html')
            return
        }

        $safe = [System.IO.Path]::GetFileName($path.TrimStart('/'))
        if ($safe) {
            $file = Join-Path $root $safe
            if (Test-Path -LiteralPath $file -PathType Leaf) {
                Send-File $resp $file
                return
            }
        }
        Send-Error $resp 404 'Not found'
    } catch {
        try { Send-Error $resp 500 $_.Exception.Message } catch {}
    } finally {
        try { $resp.Close() } catch {}
    }
}

### === WORKER DISPATCHER (atencion multihilo - los workers ejecutan solo lo anterior a esta linea) ===

function Test-Admin {
    ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent())
        .IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

$listener = New-Object System.Net.HttpListener
$bindAll = $false
try {
    $listener.Prefixes.Add("http://+:$Port/")
    $listener.Start()
    $bindAll = $true
} catch {
    try {
        & netsh http add urlacl "url=http://+:$Port/" "user=Users" 2>$null | Out-Null
        $listener = New-Object System.Net.HttpListener
        $listener.Prefixes.Add("http://+:$Port/")
        $listener.Start()
        $bindAll = $true
    } catch {
        $listener = New-Object System.Net.HttpListener
        $listener.Prefixes.Add("http://localhost:$Port/")
        $listener.Start()
    }
}

if ($bindAll) {
    try {
        if (Test-Admin) {
            New-NetFirewallRule -DisplayName "TENIS LIVE MHC (TCP $Port)" -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -ErrorAction SilentlyContinue | Out-Null
        }
    } catch {}
}

$lanIps = @()
try {
    $lanIps = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' } |
        Select-Object -ExpandProperty IPAddress)
} catch {}

Write-Host ""
Write-Host "  TENIS LIVE MHC"
Write-Host "  ============================================="
Write-Host "  Servidor iniciado en: http://localhost:$Port"
foreach ($ip in $lanIps) { Write-Host "  Desde el celular (mismo WiFi): http://$ip`:$Port" }
if (-not $bindAll) {
    Write-Host "  ATENCION: solo visible en este PC."
    Write-Host "  Para abrirlo desde el celular, ejecuta como Administrador:"
    Write-Host "    netsh http add urlacl url=http://+:$Port/ user=Users"
    Write-Host "    netsh advfirewall firewall add rule name=\"TENIS LIVE MHC\" dir=in action=allow protocol=TCP localport=$Port"
    Write-Host "  y reinicia el servidor."
}
Write-Host "  Presiona Ctrl+C para detenerlo."
Write-Host ""

if (-not $NoBrowser) {
    Start-Process "http://localhost:$Port" -ErrorAction SilentlyContinue
}

$preambleText = ''
try { $preambleText = [System.IO.File]::ReadAllText($PSCommandPath, [System.Text.Encoding]::UTF8) } catch {}
if (-not $preambleText) { try { $preambleText = [System.IO.File]::ReadAllText($PSCommandPath) } catch {} }
$mIdx = $preambleText.IndexOf('### === WORKER DISPATCHER')
if ($mIdx -gt 0) { $preambleText = $preambleText.Substring(0, $mIdx) }

$workerCodeText = @'
param($ctx, $pre, $rootAbs, $cache)
try {
    $ErrorActionPreference = 'Stop'
    . ([scriptblock]::Create($pre))
    $root = $rootAbs
    Handle-Request $ctx
} catch {
    try {
        $r2 = $ctx.Response
        if ($r2) {
            try { $r2.StatusCode = 500 } catch {}
            $b2 = [System.Text.Encoding]::UTF8.GetBytes('{"ok":false,"error":"error interno"}')
            try { $r2.ContentType = 'application/json' } catch {}
            try { $r2.ContentLength64 = $b2.Length } catch {}
            try { $r2.OutputStream.Write($b2, 0, $b2.Length) } catch {}
            $r2.Close()
        }
    } catch {}
}
'@
$workerSb = [scriptblock]::Create($workerCodeText)

$workerJobs = New-Object System.Collections.ArrayList
$workerSem = New-Object System.Threading.Semaphore(8, 8)

while ($listener.IsListening) {
    for ($wi = $workerJobs.Count - 1; $wi -ge 0; $wi--) {
        $wj = $workerJobs[$wi]
        $st = $null
        try { $st = $wj.ps.InvocationStateInfo.State } catch { $st = 'Failed' }
        if ($st -eq 'Completed' -or $st -eq 'Failed' -or $st -eq 'Stopped') {
            try { $wj.ps.Dispose() } catch {}
            try { $wj.rs.Dispose() } catch {}
            $workerJobs.RemoveAt($wi)
            try { [void]$workerSem.Release() } catch {}
        }
    }

    $ctx = $null
    try { $ctx = $listener.GetContext() } catch { break }

    $gotSlot = $false
    try { $gotSlot = $workerSem.WaitOne(2500) } catch { $gotSlot = $true }
    if (-not $gotSlot) {
        try {
            $r2 = $ctx.Response
            $r2.StatusCode = 503
            $b2 = [System.Text.Encoding]::UTF8.GetBytes('{"ok":false,"error":"server ocupado"}')
            $r2.ContentType = 'application/json'
            $r2.ContentLength64 = $b2.Length
            $r2.OutputStream.Write($b2, 0, $b2.Length)
            $r2.Close()
        } catch {}
        continue
    }

    try {
        $rs = [runspacefactory]::CreateRunspace()
        $rs.Open()
        $ps = [powershell]::Create()
        $ps.Runspace = $rs
        [void]$ps.AddScript($workerSb).AddArgument($ctx).AddArgument($preambleText).AddArgument($root).AddArgument($cache)
        [void]$ps.BeginInvoke()
        [void]$workerJobs.Add(@{ ps = $ps; rs = $rs })
    } catch {
        try { [void]$workerSem.Release() } catch {}
        Write-Host "Error lanzando worker: $($_.Exception.Message)" -ForegroundColor Red
        try {
            $r2 = $ctx.Response
            $r2.StatusCode = 500
            $b2 = [System.Text.Encoding]::UTF8.GetBytes('{"ok":false,"error":"error interno"}')
            $r2.ContentType = 'application/json'
            $r2.ContentLength64 = $b2.Length
            $r2.OutputStream.Write($b2, 0, $b2.Length)
            $r2.Close()
        } catch {}
    }
}
