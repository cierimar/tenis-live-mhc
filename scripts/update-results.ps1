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

$matches = [System.Collections.Generic.List[object]]::new()
$pairs = [regex]::Matches($html, '<tr[^>]*>.*?</tr>\s*<tr[^>]*>.*?</tr>', 'Singleline')

foreach ($pr in $pairs) {
    $r1 = $pr.Groups[1].Value
    $r2 = $pr.Groups[2].Value

    $idM = [regex]::Match($r1, 'href="/match-detail/\?id=(\d+)"')
    if (-not $idM.Success) { continue }

    $name1M = [regex]::Match($r1, 'class="t-name"[^>]*><a[^>]*>([^<]+)</a>')
    $name2M = [regex]::Match($r2, 'class="t-name"[^>]*><a[^>]*>([^<]+)</a>')
    if (-not $name1M.Success -or -not $name2M.Success) { continue }

    $p1 = (($name1M.Groups[1].Value -replace '&nbsp;', ' ') -replace '\s+', ' ').Trim()
    $p2 = (($name2M.Groups[1].Value -replace '&nbsp;', ' ') -replace '\s+', ' ').Trim()

    $res1M = [regex]::Match($r1, 'class="result">([^<]+)<')
    $res2M = [regex]::Match($r2, 'class="result">([^<]+)<')
    if (-not $res1M.Success -or -not $res2M.Success) { continue }

    $res1 = $res1M.Groups[1].Value.Trim()
    $res2 = $res2M.Groups[1].Value.Trim()
    if ($res1 -eq '' -or $res2 -eq '') { continue }

    $s1 = @(); foreach ($sm in [regex]::Matches($r1, 'class="score">([^<]*)<')) { $v = $sm.Groups[1].Value -replace '&nbsp;', ''; if ($v -ne '') { $s1 += $v } }
    $s2 = @(); foreach ($sm in [regex]::Matches($r2, 'class="score">([^<]*)<')) { $v = $sm.Groups[1].Value -replace '&nbsp;', ''; if ($v -ne '') { $s2 += $v } }

    $roundM = [regex]::Match($r1, 'class="round"[^>]*>([^<]+)<')
    $surfM = [regex]::Match($r1, 'class="s-color"[^>]*>\s*<span[^>]*>([^<]+)</span>')
    $tournM = [regex]::Match($r1, 'class="t-name"[^>]*>.*?<a[^>]*href="(/[^"]*)"[^>]*>([^<]+)</a>', 'Singleline')
    if (-not $tournM.Success) { $tournM = [regex]::Match($r1, '<a[^>]*href="/[^"]*">([^<]+)</a>') }

    $linescores1 = @(); $linescores2 = @()
    foreach ($v in $s1) { $val = $v -as [int]; $linescores1 += @{ value = if ($null -ne $val) { $val } else { $null }; tiebreak = $null; winner = $false } }
    foreach ($v in $s2) { $val = $v -as [int]; $linescores2 += @{ value = if ($null -ne $val) { $val } else { $null }; tiebreak = $null; winner = $false } }
    for ($i = 0; $i -lt [Math]::Max($linescores1.Count, $linescores2.Count); $i++) {
        $v1 = if ($i -lt $linescores1.Count) { $linescores1[$i].value } else { $null }
        $v2 = if ($i -lt $linescores2.Count) { $linescores2[$i].value } else { $null }
        if ($null -ne $v1 -and $null -ne $v2) {
            if ($v1 -gt $v2) { $linescores1[$i].winner = $true } else { $linescores2[$i].winner = $true }
        }
    }

    $r1Num = [int]($res1 -replace '[^0-9]', '')
    $r2Num = [int]($res2 -replace '[^0-9]', '')
    $w1 = $r1Num -gt $r2Num

    $matches.Add([pscustomobject]@{
        id = 'te-' + $idM.Groups[1].Value
        state = 'post'
        round = if ($roundM.Success) { $roundM.Groups[1].Value.Trim() } else { '' }
        surface = if ($surfM.Success) { $surfM.Groups[1].Value.Trim() } else { '' }
        tournamentName = if ($tournM.Success) { (($tournM.Groups[2].Value -replace '<[^>]+>', '') -replace '\s+', ' ').Trim() } else { '' }
        competitors = @(
            @{ name = $p1; winner = $w1; homeAway = 'home'; flag = ''; flagAlt = ''; linescores = $linescores1 }
            @{ name = $p2; winner = (-not $w1); homeAway = 'away'; flag = ''; flagAlt = ''; linescores = $linescores2 }
        )
    })
}

$payload = @{ ok = $true; updated = (Get-Date).ToUniversalTime().ToString('s') + 'Z'; count = $matches.Count; matches = @($matches) }
$json = $payload | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText($outFile, $json, [System.Text.UTF8Encoding]::new($false))
Write-Host "results.json: $($matches.Count) partidos finalizados"
