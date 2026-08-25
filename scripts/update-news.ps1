$ErrorActionPreference = 'Continue'

$repoRoot = Split-Path $PSScriptRoot -Parent
$outFile = Join-Path $repoRoot 'news.json'

$curl = if ($IsWindows -or $env:OS -match 'Windows') { 'curl.exe' } else { 'curl' }

function Get-Feed([string]$url) {
    $tmp = Join-Path $env:TEMP ([guid]::NewGuid().ToString() + '.xml')
    for ($i = 1; $i -le 3; $i++) {
        Remove-Item $tmp -Force -ErrorAction SilentlyContinue
        & $curl -s -L --compressed --connect-timeout 20 --max-time 45 -A 'Mozilla/5.0' -o $tmp $url 2>$null
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

$feeds = @(
    @{ url = 'https://www.espn.com/espn/rss/tennis/news'; source = 'ESPN' },
    @{ url = 'https://www.puntodebreak.com/rss.xml'; source = 'Punto de Break' },
    @{ url = 'https://www.bbc.com/sport/tennis/rss.xml'; source = 'BBC' }
)

$items = [System.Collections.Generic.List[object]]::new()
foreach ($f in $feeds) {
    $xml = Get-Feed $f.url
    if (-not $xml) { continue }
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
        $items.Add([pscustomobject]@{
            id = [guid]::NewGuid().ToString('N')
            title = $title
            link = $link
            published = $pubIso
            source = $f.source
            description = $desc
        })
    }
}

if ($items.Count -eq 0) {
    Write-Host 'Sin noticias. No se escribe news.json.'
    exit 1
}

$sorted = @($items | Sort-Object @{ Expression = { try { [datetime]$_.published } catch { [datetime]::MinValue } }; Descending = $true })
if ($sorted.Count -gt 60) { $sorted = $sorted[0..59] }

$payload = @{
    ok = $true
    updated = (Get-Date).ToUniversalTime().ToString('s') + 'Z'
    items = @($sorted)
}
$json = $payload | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText($outFile, $json, [System.Text.UTF8Encoding]::new($false))
Write-Host "news.json: $($sorted.Count) noticias"
