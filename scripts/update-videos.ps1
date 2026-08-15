$ErrorActionPreference = 'Continue'

$repoRoot = Split-Path $PSScriptRoot -Parent
$outFile = Join-Path $repoRoot 'videos.json'

$curl = if ($IsWindows -or $env:OS -match 'Windows') { 'curl.exe' } else { 'curl' }

function Get-Feed([string]$url) {
    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString() + '.xml')
    for ($i = 1; $i -le 3; $i++) {
        Remove-Item $tmp -Force -ErrorAction SilentlyContinue
        & $curl -s -L --compressed --connect-timeout 20 --max-time 45 `
            -A 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' `
            -H 'Accept-Language: en-US,en;q=0.9' -H 'Cookie: CONSENT=YES+1' -o $tmp $url 2>$null
        if ((Test-Path $tmp) -and ((Get-Item $tmp).Length -gt 100)) {
            $content = Get-Content $tmp -Raw -Encoding UTF8
            Remove-Item $tmp -Force -ErrorAction SilentlyContinue
            return $content
        }
        Start-Sleep -Seconds 5
    }
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    return $null
}

$channels = @(
    @{ name = 'Tennis TV'; id = 'UCbcxFkd6B9xUU54InHv4Tig' },
    @{ name = 'ATP Tour'; id = 'UCY_5h5zaSwN7Or4kIJDYNXA' },
    @{ name = 'WTA'; id = 'UCaBIVVpHjq6j3tSyxwTE-8Q' }
)

$videos = [System.Collections.Generic.List[object]]::new()
foreach ($ch in $channels) {
    $xml = Get-Feed ('https://www.youtube.com/feeds/videos.xml?channel_id=' + $ch.id)
    if (-not $xml) { continue }
    $entries = [regex]::Matches($xml, '<entry>([\s\S]*?)</entry>')
    foreach ($e in $entries) {
        $b = $e.Groups[1].Value
        $idM = [regex]::Match($b, '<yt:videoId>([\w-]+)</yt:videoId>')
        if (-not $idM.Success) { continue }
        $titleM = [regex]::Match($b, '<title>(.*?)</title>')
        $pubM = [regex]::Match($b, '<published>(.*?)</published>')
        $thumbM = [regex]::Match($b, '<media:thumbnail url="([^"]+)"')
        $title = [Net.WebUtility]::HtmlDecode((($titleM.Groups[1].Value -replace '<[^>]+>', '') -replace '\s+', ' ').Trim())
        if (-not $title) { continue }
        $videos.Add([pscustomobject]@{
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

if ($videos.Count -eq 0) {
    Write-Host 'Sin videos. No se escribe videos.json.'
    exit 1
}

$sorted = @($videos | Sort-Object published -Descending)
if ($sorted.Count -gt 30) { $sorted = $sorted[0..29] }

$payload = @{
    ok = $true
    updated = (Get-Date).ToUniversalTime().ToString('s') + 'Z'
    channels = @($channels | ForEach-Object { $_.name })
    videos = @($sorted)
}
$json = $payload | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText($outFile, $json, [System.Text.UTF8Encoding]::new($false))
Write-Host "videos.json: $($sorted.Count) videos"
