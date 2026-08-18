$ErrorActionPreference = 'Continue'

$repoRoot = Split-Path $PSScriptRoot -Parent
$outFile = Join-Path $repoRoot 'birthdays.json'

$curl = if ($IsWindows -or $env:OS -match 'Windows') { 'curl.exe' } else { 'curl' }
$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
$html = $null
for ($try = 0; $try -lt 3; $try++) {
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    & $curl -s --compressed --max-time 30 -L -A $ua -H 'Accept: text/html,*/*' -H 'Accept-Language: en-US,en;q=0.9' -H 'Cookie: CONSENT=YES+1' -o $tmp 'https://tennisabstract.com/reports/todays_birthdays.html' 2>$null
    if ((Test-Path $tmp) -and ((Get-Item $tmp).Length -gt 200)) {
        $html = [System.IO.File]::ReadAllText($tmp)
        if ($html -match 'reportable') { break }
    }
    Start-Sleep -Seconds 3
}
Remove-Item $tmp -Force -ErrorAction SilentlyContinue

$players = [System.Collections.Generic.List[object]]::new()
if ($html) {
    $rowPattern = [regex]::Matches($html, '<tr><td[^>]*>(M|W)</td><td[^>]*><a[^>]*>([^<]+)</a></td><td[^>]*>([A-Z]{3})</td><td[^>]*>(\d*)</td><td[^>]*>(\d*|)</td><td[^>]*>(\d*|)</td></tr>')
    foreach ($m in $rowPattern) {
        [void]$players.Add([pscustomobject]@{
            gender = $m.Groups[1].Value
            name = $m.Groups[2].Value.Trim()
            country = $m.Groups[3].Value
            age = if ($m.Groups[4].Value) { [int]$m.Groups[4].Value } else { 0 }
            currentRank = if ($m.Groups[5].Value) { [int]$m.Groups[5].Value } else { 0 }
            peakRank = if ($m.Groups[6].Value) { [int]$m.Groups[6].Value } else { 0 }
        })
    }
}
$payload = @{ ok = $true; date = (Get-Date).ToString('yyyy-MM-dd'); players = @($players) }
$json = $payload | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText($outFile, $json, [System.Text.UTF8Encoding]::new($false))
Write-Host "birthdays.json: $($players.Count) cumpleaneros"
