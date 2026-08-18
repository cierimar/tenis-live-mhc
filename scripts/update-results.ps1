$ErrorActionPreference = 'Continue'

$repoRoot = Split-Path $PSScriptRoot -Parent
$outFile = Join-Path $repoRoot 'results.json'

$curl = if ($IsWindows -or $env:OS -match 'Windows') { 'curl.exe' } else { 'curl' }
$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

function Get-WebFile([string]$url) {
    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
    for ($try = 0; $try -lt 3; $try++) {
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

$html = Get-WebFile 'https://www.tennisexplorer.com/matches/?type=all'
if (-not $html) { Write-Host 'tennisexplorer no disponible'; exit 1 }

$finished = [System.Collections.Generic.List[object]]::new()
$allRows = [regex]::Matches($html, '<tr\b[^>]*>(.*?)</tr>', 'Singleline')
$currentTournament = ''
$currentTour = 'atp'
$prevRow = $null

foreach ($m in $allRows) {
    $rowHtml = $m.Groups[1].Value
    if ($rowHtml -match 'class="head\s+flags"') {
        $tnameM = [regex]::Match($rowHtml, '<a[^>]*>(?:<[^>]+>)*([^<]+)</a>')
        if ($tnameM.Success) {
            $raw = [System.Net.WebUtility]::HtmlDecode($tnameM.Groups[1].Value).Trim()
            $currentTournament = $raw -replace '\s+', ' '
        }
        $hrefM = [regex]::Match($rowHtml, 'href="(/[^"]*?/(atp-men|wta-women)/[^"]*)"')
        if ($hrefM.Success) {
            $currentTour = if ($hrefM.Groups[2].Value -eq 'atp-men') { 'atp' } else { 'wta' }
        }
        $prevRow = $null
        continue
    }
    if ($null -ne $prevRow) {
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
        $res1 = $res1M.Groups[1].Value.Trim()
        $res2 = $res2M.Groups[1].Value.Trim()
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
            id = 'te-' + $idM.Groups[1].Value
            state = 'post'
            tour = $currentTour
            type = $type
            round = if ($roundM.Success) { $roundM.Groups[1].Value.Trim() } else { '' }
            tournamentId = 'te-' + $idM.Groups[1].Value
            tournamentName = $currentTournament
            surface = if ($surfM.Success) { $surfM.Groups[1].Value.Trim() } else { '' }
            competitors = @(
                @{ name = $p1; winner = $w1; homeAway = 'home'; flag = ''; flagAlt = ''; linescores = $ls1 }
                @{ name = $p2; winner = (-not $w1); homeAway = 'away'; flag = ''; flagAlt = ''; linescores = $ls2 }
            )
        })
        $prevRow = $null
    } else {
        $prevRow = $rowHtml
    }
}

$payload = @{ ok = $true; updated = (Get-Date).ToUniversalTime().ToString('s') + 'Z'; count = $finished.Count; matches = @($finished) }
$json = $payload | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText($outFile, $json, [System.Text.UTF8Encoding]::new($false))
Write-Host "results.json: $($finished.Count) partidos finalizados"
