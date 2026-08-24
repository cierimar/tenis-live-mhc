$ErrorActionPreference = 'Continue'

$repoRoot = Split-Path $PSScriptRoot -Parent
$outFile = Join-Path $repoRoot 'seeds.json'

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
            # si no se resolvio, el grupo se descarta: mejor sin sembrado que un sembrado falso
        }
        return $result
    } catch { return @{} }
}

$html = Get-WebFile "https://www.tennisexplorer.com/"
if (-not $html) { Write-Host 'tennisexplorer no disponible'; exit 1 }

$linkM = [regex]::Matches($html, 'href="(/[^/]+/\d{4}/(atp-men|wta-women)/[^"]*)"')
$seen = @{}
foreach ($m in $linkM) {
    $url = $m.Groups[1].Value -replace '\?.*$', ''
    $circuit = $m.Groups[2].Value
    if (-not $seen.ContainsKey($url)) { $seen[$url] = $circuit }
}

$tournaments = [System.Collections.Generic.List[object]]::new()
foreach ($entry in $seen.GetEnumerator()) {
    $baseUrl = $entry.Key; $circuit = $entry.Value
    $rawName = ($baseUrl -replace '/\d{4}/.*$', '' -replace '^/' -replace '/',' ' -replace '-',' ')
    $name = (Get-Culture).TextInfo.ToTitleCase($rawName)
    $singles = Get-TournamentSeedsFromPage ("https://www.tennisexplorer.com" + $baseUrl)
    $doubles = Get-TournamentSeedsFromPage ("https://www.tennisexplorer.com" + $baseUrl + "?type=double")
    [void]$tournaments.Add([pscustomobject]@{
        name = $name; url = $baseUrl
        circuit = if ($circuit -eq 'atp-men') { 'ATP' } else { 'WTA' }
        singles = $singles; doubles = $doubles
    })
}

if ($tournaments.Count -lt 5) { Write-Host "pocos torneos ($($tournaments.Count)), no sobreescribir"; exit 1 }

$allSingles = @{}; $allDoubles = @{}
foreach ($t in $tournaments) {
    $prefix = if ($t.circuit -eq 'ATP') { 'ATP' } else { 'WTA' }
    foreach ($kv in $t.singles.GetEnumerator()) { $allSingles["${prefix}::$($kv.Key)"] = $kv.Value }
    foreach ($kv in $t.doubles.GetEnumerator()) { $allDoubles["${prefix}::$($kv.Key)"] = $kv.Value }
}

$payload = @{
    ok = $true; updated = (Get-Date).ToUniversalTime().ToString('s') + 'Z'
    tournaments = @($tournaments); singles = $allSingles; doubles = $allDoubles
}
$json = $payload | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText($outFile, $json, [System.Text.UTF8Encoding]::new($false))
Write-Host "seeds.json: $($tournaments.Count) torneos"
