$ErrorActionPreference = 'Stop'
$token = $env:GITHUB_TOKEN
$repo = $env:REPO
$headers = @{ Authorization = "token $token"; Accept = 'application/vnd.github.v3+json'; 'Content-Type' = 'application/json' }

function Get-WebPage([string]$url) {
    $tmp = [System.IO.Path]::GetTempFileName()
    try {
        curl.exe -s --compressed --max-time 45 -L -A 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' -H 'Accept: text/html' -H 'Referer: https://www.google.com/' -o $tmp $url
        $text = [System.IO.File]::ReadAllText($tmp)
        return $text
    } catch { return $null }
    finally { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
}

$html = Get-WebPage 'https://www.tennisabstract.com/'
if (-not $html) { Write-Host "ERROR: No se pudo cargar TA"; exit 1 }
$html = $html -replace '<!--[\s\S]*?-->', ''
$m = [regex]::Match($html, '<table[^>]*id="current-events"[^>]*>[\s\S]*?<tbody>([\s\S]*?)</tbody>')
if (-not $m.Success) { Write-Host "ERROR: current-events no encontrado"; exit 1 }
$body = $m.Groups[1].Value
$cells = [regex]::Matches($body, '<td[^>]*>([\s\S]*?)</td>')
if ($cells.Count -lt 3) { Write-Host "ERROR: Se esperaban 3 columnas, obtuve $($cells.Count)"; exit 1 }

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
            $dhtml = Get-WebPage $detailUrl
            if ($dhtml) {
                $upcoming = ''; $completed = ''; $forecast = ''
                $um = [regex]::Match($dhtml, "var\s+upcomingSingles\s*=\s*'([\s\S]*?)'")
                if ($um.Success) { $upcoming = $um.Groups[1].Value }
                $cm = [regex]::Match($dhtml, "var\s+completedSingles\s*=\s*'([\s\S]*?)'")
                if ($cm.Success) { $completed = $cm.Groups[1].Value }
                $fm = [regex]::Match($dhtml, "var\s+projCurrent\s*=\s*'([\s\S]*?)'")
                if ($fm.Success) { $forecast = $fm.Groups[1].Value }
                $detail = @{ upcoming = $upcoming; completed = $completed; forecast = $forecast }
            }
        } catch {}
        [void]$tournaments.Add([pscustomobject]@{
            name = $name; url = $detailUrl; favorite = $fav; favoritePct = $favPct; detail = $detail
        })
    }
    $tour[$categories[$i]] = @($tournaments)
}

$updated = (Get-Date).ToString('s')
$json = @{ ok = $true; updated = $updated; tour = $tour } | ConvertTo-Json -Depth 10 -Compress

# Check if file exists for sha
$existing = $null
try { $existing = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/contents/web-github/current-tour.json" -Headers $headers } catch {}
$sha = if ($existing) { $existing.sha } else { '' }

$bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
$b64 = [Convert]::ToBase64String($bytes)
$body = @{ message = "update: current-tour.json $updated"; content = $b64; sha = $sha; branch = 'main' } | ConvertTo-Json -Compress
Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/contents/web-github/current-tour.json" -Method Put -Headers $headers -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) | Out-Null

$total = 0
foreach ($k in $tour.Keys) { $total += $tour[$k].Count }
Write-Host "OK: $total torneos, updated $updated"
