$ErrorActionPreference = 'Continue'

$repoRoot = Split-Path $PSScriptRoot -Parent
$outFile = Join-Path $repoRoot 'itf_live.json'

$curl = if ($IsWindows -or $env:OS -match 'Windows') { 'curl.exe' } else { 'curl' }
$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

function Get-WebFile([string]$url) {
    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
    for ($try = 0; $try -lt 3; $try++) {
        Remove-Item $tmp -Force -ErrorAction SilentlyContinue
        & $curl -s --compressed --max-time 30 -L -A $ua -H 'Accept: text/html,*/*' -H 'Referer: https://www.google.com/' -o $tmp $url 2>$null
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

function Fetch-TournamentPage([string]$slug) {
    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
    try {
        & $curl -s --compressed --max-time 30 -L -A $ua -o $tmp "https://www.tennisexplorer.com$slug" 2>$null
        if (-not (Test-Path $tmp) -or (Get-Item $tmp).Length -eq 0) { return @() }
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
                teId = $teId; p1 = ($parts[0] -replace '\s*\(\d+\)\s*$', '')
                p2 = if ($parts.Count -gt 1) { ($parts[1] -replace '\s*\(\d+\)\s*$', '') } else { '' }
                time = $timeM.Groups[1].Value; round = $roundM.Groups[1].Value; h2h = $h2hM.Groups[1].Value; finished = $false
            }
        }
        $finished = @()
        foreach ($m in [regex]::Matches($text, '<tr[^>]*>(.*?)</tr>', 'Singleline')) {
            $row = $m.Groups[1].Value
            if ($row -match 'class="result"' -and $row -match 'class="score"') { $finished += $row }
        }
        for ($i = 0; $i -lt $finished.Count; $i += 2) {
            if ($i + 1 -ge $finished.Count) { break }
            $r1 = $finished[$i]; $r2 = $finished[$i + 1]
            $idM = [regex]::Match($r1, '/match-detail/\?id=(\d+)')
            if (-not $idM.Success) { $idM = [regex]::Match($r2, '/match-detail/\?id=(\d+)') }
            if (-not $idM.Success) { continue }
            $name1 = [regex]::Match($r1, 'class="t-name">.*?<a[^>]*>(.*?)</a>', 'Singleline')
            $name2 = [regex]::Match($r2, 'class="t-name">.*?<a[^>]*>(.*?)</a>', 'Singleline')
            $dateM = [regex]::Match($r1, 'class="first time"[^>]*>\s*([\d.]+)<br\s*/?>\s*([\d:]+)')
            $roundM = [regex]::Match($r1, 'title="([^"]+)"[^>]*rowspan="2"')
            $res1 = [regex]::Match($r1, 'class="result">([^<]+)<')
            $res2 = [regex]::Match($r2, 'class="result">([^<]+)<')
            $s1 = @(); foreach ($sm in [regex]::Matches($r1, 'class="score">([^<]+)<')) { $v = $sm.Groups[1].Value -replace '&nbsp;', ''; if ($v -ne '') { $s1 += $v } }
            $s2 = @(); foreach ($sm in [regex]::Matches($r2, 'class="score">([^<]+)<')) { $v = $sm.Groups[1].Value -replace '&nbsp;', ''; if ($v -ne '') { $s2 += $v } }
            $out += [pscustomobject]@{
                teId = $idM.Groups[1].Value
                p1 = (($name1.Groups[1].Value -replace '&nbsp;', ' ') -replace '\s+', ' ').Trim()
                p2 = (($name2.Groups[1].Value -replace '&nbsp;', ' ') -replace '\s+', ' ').Trim()
                round = $roundM.Groups[1].Value; date = $dateM.Groups[1].Value; time = $dateM.Groups[2].Value
                res1 = [int]$res1.Groups[1].Value; res2 = [int]$res2.Groups[1].Value; sets1 = $s1; sets2 = $s2; finished = $true
            }
        }
        return $out
    } catch { return @() }
    finally { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
}

$live = Get-WebFile 'https://www.tennisexplorer.com/live/'
if (-not $live) { Write-Host 'tennisexplorer no disponible'; exit 1 }

$candidates = [System.Collections.Generic.List[object]]::new()
foreach ($m in [regex]::Matches($live, '<tr class="one">.*?</tr>', 'Singleline')) {
    $row = $m.Value
    $hrefM = [regex]::Match($row, 'href="(/[^"]+/\d{4}/(atp-men|wta-women)/)"')
    if (-not $hrefM.Success) { continue }
    $slug = $hrefM.Groups[1].Value
    if ($slug -notmatch 'itf') { continue }
    $nameM = [regex]::Match($row, 'class="t-name">.*?>([^<]+)</a>', 'Singleline')
    $cntM = [regex]::Match($row, 'class="nxGame[^"]*"[^>]*>(\d+)</td>')
    $cnt = 0; if ($cntM.Success) { [void][int]::TryParse($cntM.Groups[1].Value, [ref]$cnt) }
    if ($cnt -gt 0) {
        $candidates.Add([pscustomobject]@{
            slug = $slug; cat = $hrefM.Groups[2].Value
            name = if ($nameM.Success) { (($nameM.Groups[1].Value -replace '&nbsp;', ' ') -replace '\s+', ' ').Trim() } else { $slug }
        })
    }
}

$tournaments = [System.Collections.Generic.List[object]]::new()
foreach ($c in ($candidates | Select-Object -First 12)) {
    $ms = Fetch-TournamentPage $c.slug
    if ($ms -and $ms.Count -gt 0) {
        $tournaments.Add([pscustomobject]@{
            id = 'itf-' + (($c.slug -replace '/', '') -replace '-itf', '')
            name = $c.name; cat = if ($c.cat -eq 'atp-men') { 'm' } else { 'w' }; matches = @($ms)
        })
    }
}

$payload = @{ ok = $true; time = (Get-Date).ToUniversalTime().ToString('s') + 'Z'; tournaments = @($tournaments) }
$json = $payload | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText($outFile, $json, [System.Text.UTF8Encoding]::new($false))
Write-Host "itf_live.json: $($tournaments.Count) torneos"
