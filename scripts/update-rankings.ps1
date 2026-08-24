$ErrorActionPreference = 'Continue'

$repoRoot = Split-Path $PSScriptRoot -Parent
$outDir = Join-Path $repoRoot 'rankings'
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

$curl = if ($IsWindows -or $env:OS -match 'Windows') { 'curl.exe' } else { 'curl' }

function Get-AtpPage([string]$url) {
    $tmp = Join-Path $env:TEMP ([guid]::NewGuid().ToString() + '.html')
    for ($i = 1; $i -le 3; $i++) {
        Remove-Item $tmp -Force -ErrorAction SilentlyContinue
        $args = @(
            '-s', '-L', '--compressed', '--connect-timeout', '20', '--max-time', '60',
            '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
            '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            '-H', 'Accept-Language: en-US,en;q=0.9',
            '-H', 'Referer: https://www.google.com/',
            '-o', $tmp, $url
        )
        & $curl @args 2>$null
        if ((Test-Path $tmp) -and ((Get-Item $tmp).Length -gt 5000)) {
            $content = Get-Content $tmp -Raw -Encoding UTF8
            Remove-Item $tmp -Force -ErrorAction SilentlyContinue
            return $content
        }
        Start-Sleep -Seconds 8
    }
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    return $null
}

function ConvertFrom-AtpRanking([string]$html) {
    $result = [System.Collections.Generic.List[object]]::new()
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
            $fulls = @($slugs | ForEach-Object {
                $slug = $_.Groups[1].Value
                if ($slug) {
                    (@($slug.Split('-') | Where-Object { $_ } | ForEach-Object {
                        if ($_.Length -gt 1) { $_.Substring(0, 1).ToUpperInvariant() + $_.Substring(1) } else { $_.ToUpperInvariant() }
                    }) -join ' ')
                }
            } | Where-Object { $_ } | Select-Object -Unique)
            $name = ($fulls -join ' / ').Trim()
        }
        if (-not $name) {
            $names = [regex]::Matches($row, 'class="lastName">([^<]+)<')
            if ($names.Count -gt 0) {
                $name = (($names | ForEach-Object { $_.Groups[1].Value.Trim() }) -join ' / ').Trim()
            }
        }
        if (-not $name) { continue }
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

function Get-WtaRankings([string]$type) {
    $url = "https://api.wtatennis.com/tennis/players/ranked?type=$type&metric=doubles&pageSize=100"
    $tmp = Join-Path $env:TEMP ([guid]::NewGuid().ToString() + '.json')
    & $curl -s -L --connect-timeout 20 --max-time 60 -A 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' -o $tmp $url 2>$null
    if (-not (Test-Path $tmp)) { Remove-Item $tmp -Force -ErrorAction SilentlyContinue; return $null }
    $raw = Get-Content $tmp -Raw -Encoding UTF8
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    if (-not $raw) { return $null }
    $trimmed = $raw.TrimStart()
    if (-not ($trimmed.StartsWith('[') -or $trimmed.StartsWith('{'))) { return $null }
    try {
        $data = $raw | ConvertFrom-Json
    } catch {
        return $null
    }
    if (-not $data) { return $null }
    $players = [System.Collections.Generic.List[object]]::new()
    foreach ($p in $data) {
        $movement = 0
        if ($null -ne $p.movement) { try { $movement = [int]$p.movement } catch {} }
        $players.Add([pscustomobject]@{
            rank = if ($null -eq $p.ranking) { 0 } else { [int]$p.ranking }
            rankRaw = [string]$p.ranking
            name = $p.player.fullName
            flag = ('' + $p.player.countryCode).ToLowerInvariant()
            points = if ($null -eq $p.points) { 0 } else { [int]$p.points }
            movement = $movement
            source = 'api.wtatennis.com'
        })
    }
    return $players
}

function Save-Json([string]$path, $obj) {
    $json = $obj | ConvertTo-Json -Depth 8
    [System.IO.File]::WriteAllText($path, $json, [System.Text.UTF8Encoding]::new($false))
}

$updated = (Get-Date).ToUniversalTime().ToString('s') + 'Z'

$uaLt = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'

function Parse-LtRows([string]$html) {
    $list = [System.Collections.Generic.List[object]]::new()
    $trMatches = [regex]::Matches($html, '<tr[^>]*>.*?</tr>', 'Singleline')
    foreach ($tr in $trMatches) {
        $t = $tr.Value
        if ($t -notmatch 'class="?pn"?') { continue }
        $rankM = [regex]::Match($t, 'class="?rk"?>\s*(\d+)')
        if (-not $rankM.Success) { continue }
        $nameM = [regex]::Match($t, 'class="?pn"?>\s*(.*?)</td>', 'Singleline')
        $name = $nameM.Groups[1].Value -replace '<[^>]+>', ''
        $name = [System.Net.WebUtility]::HtmlDecode($name)
        $name = (($name -replace '\s+', ' ').Trim()) -replace '^[^\w]+', ''
        if (-not $name) { continue }
        $country = ''
        $cM = [regex]::Match($t, 'class="?sm"?\s+p="?[\d.]+"?>\s*([A-Z]{3})\s*<')
        if ($cM.Success) { $country = $cM.Groups[1].Value }
        $afterIdx = if ($cM.Success) { $cM.Index + $cM.Length } else { $nameM.Index + $nameM.Length }
        $pts = ''
        $pM = [regex]::Match($t.Substring($afterIdx), '<td>\s*(\d[\d.]*)\s*</td>')
        if ($pM.Success) { $pts = $pM.Groups[1].Value }
        $move = 0
        $mM = [regex]::Match($t, 'class="?(?:rdf|srd|sgr)"?>\s*([+-]?\d+)\s*<')
        if ($mM.Success) { [void][int]::TryParse($mM.Groups[1].Value, [ref]$move) }
        $list.Add([pscustomobject]@{
            rank = [int]$rankM.Groups[1].Value
            move = $move
            name = $name
            points = $pts
            country = $country
        })
    }
    return $list
}

function Get-LtOfficialRows([string]$tour) {
    $slug = "official-$tour-ranking"
    $targets = @(
        @{ u = "https://live-tennis.eu/en/$slug"; j = $false },
        @{ u = "https://r.jina.ai/https://live-tennis.eu/en/$slug"; j = $true }
    )
    foreach ($src in $targets) {
        for ($try = 1; $try -le 2; $try++) {
            $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString() + '.html')
            $cargs = @('-s','-L','--compressed','--connect-timeout','20','--max-time','90','-A',$uaLt,'-o',$tmp,$src.u)
            if ($src.j) { $cargs += @('-H','X-Return-Format: html') }
            & $curl @cargs 2>$null
            $ok = (Test-Path $tmp) -and ((Get-Item $tmp).Length -gt 20000)
            if ($ok) {
                $html = [System.IO.File]::ReadAllText($tmp)
                Remove-Item $tmp -Force -ErrorAction SilentlyContinue
                $rows = Parse-LtRows $html
                if ($rows.Count -ge 500) { return $rows }
            } else {
                Remove-Item $tmp -Force -ErrorAction SilentlyContinue
            }
            Start-Sleep -Seconds 6
        }
    }
    return $null
}

foreach ($tour in @('atp', 'wta')) {
    try {
        $outFile = Join-Path $outDir "${tour}_singles.json"
        $rows = Get-LtOfficialRows $tour
        if ($rows) {
            Save-Json $outFile @{ ok = $true; updated = $updated; players = $rows }
            Write-Host "$tour singles: $($rows.Count) filas (live-tennis.eu)"
        } else {
            Write-Host "$tour singles: sin datos nuevos; se conserva el archivo anterior si existe"
        }
    } catch {
        Write-Host "$tour singles: error inesperado: $($_.Exception.Message)"
    }
}

try {
    $atpHtml = Get-AtpPage 'https://www.atptour.com/en/rankings/doubles'
    if ($atpHtml -and $atpHtml -match 'rankings-breakdown') {
        $players = ConvertFrom-AtpRanking $atpHtml
        if ($players.Count -gt 0) {
            Save-Json (Join-Path $outDir 'atp_doubles.json') @{ ok = $true; updated = $updated; players = $players }
            Write-Host "ATP dobles: $($players.Count) jugadores"
        } else {
            Write-Host 'ATP dobles: sin datos'
        }
    } else {
        Write-Host 'ATP dobles: no se pudo descargar (Cloudflare o red)'
    }
} catch {
    Write-Host "ATP dobles: error inesperado: $($_.Exception.Message)"
}

try {
    $wta = Get-WtaRankings 'rankDoubles'
    if ($wta -and $wta.Count -gt 0) {
        Save-Json (Join-Path $outDir 'wta_doubles.json') @{ ok = $true; updated = $updated; players = $wta }
        Write-Host "WTA dobles: $($wta.Count) jugadores"
    } else {
        Write-Host 'WTA dobles: sin datos'
    }
} catch {
    Write-Host "WTA dobles: error inesperado: $($_.Exception.Message)"
}

exit 0
