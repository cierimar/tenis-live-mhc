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
        $seedM = [regex]::Matches($html, '<a href="/(?:player|doubles-team)/[^"]*">([^<]+)</a>\s*\[(\d+)\]')
        $result = @{}
        foreach ($m in $seedM) {
            $name = $m.Groups[1].Value.Trim()
            $seed = [int]$m.Groups[2].Value
            if ($name -and -not $result.ContainsKey($name)) { $result[$name] = $seed }
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
