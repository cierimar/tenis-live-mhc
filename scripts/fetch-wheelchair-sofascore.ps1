# fetch-wheelchair-sofascore.ps1 — Fetch wheelchair tennis data from Sofascore API
# Must run LOCALLY (not in GitHub Actions) — Sofascore blocks datacenter IPs (403)
# Produces: wheelchair.json (root) and web-github/wheelchair.json
# Run: powershell -ExecutionPolicy Bypass -File scripts/fetch-wheelchair-sofascore.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$outRoot = Join-Path $root 'wheelchair.json'
$outPages = Join-Path $root 'web-github' 'wheelchair.json'

$UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
$Headers = @{
    'User-Agent' = $UA
    'Accept' = 'application/json'
    'Accept-Language' = 'en-US,en;q=0.9'
    'Referer' = 'https://www.sofascore.com/'
}

function Invoke-SofaScore {
    param([string]$Url, [int]$Retries = 2)
    for ($i = 0; $i -le $Retries; $i++) {
        try {
            $r = Invoke-RestMethod -Uri $Url -Headers $Headers -TimeoutSec 15
            return $r
        } catch {
            $code = $_.Exception.Response.StatusCode.value__
            Write-Warning "Sofascore $code : $Url (attempt $($i+1))"
            if ($i -lt $Retries) { Start-Sleep -Seconds 2 }
        }
    }
    return $null
}

# ─── Discover wheelchair tennis tournament IDs ───
Write-Host "`n=== Discovering wheelchair tennis tournaments ===" -ForegroundColor Cyan
$tournamentsResp = Invoke-SofaScore 'https://api.sofascore.com/api/v1/sport/tennis/unique-tournaments'
if (-not $tournamentsResp) {
    Write-Error "Cannot reach Sofascore (403). Run this script locally, not from a server."
    exit 1
}

$wcTournaments = @()
foreach ($t in $tournamentsResp.uniqueTournament) {
    $name = $t.name
    $catName = $t.category.name
    if ($name -match 'wheelchair|unisylo|uniqlo' -or $catName -match 'wheelchair') {
        $wcTournaments += $t
        Write-Host "  Found: $($t.name) (id=$($t.id), category=$catName)" -ForegroundColor Green
    }
}
Write-Host "  Total wheelchair tournaments found: $($wcTournaments.Count)" -ForegroundColor Yellow

# Also check broader search — some wheelchair events are under normal tennis categories
$allTennisResp = Invoke-SofaScore 'https://api.sofascore.com/api/v1/sport/tennis/unique-tournaments'
if ($allTennisResp) {
    foreach ($t in $allTennisResp.uniqueTournament) {
        if ($t.name -match 'wheelchair|WC|W\.C\.' -and $t.id -notin $wcTournaments.id) {
            $wcTournaments += $t
            Write-Host "  Additional: $($t.name) (id=$($t.id))" -ForegroundColor Green
        }
    }
}

# ─── For each tournament, fetch events (calendar + results) ───
$allEvents = @()
$allCalendar = @()
$allResults = @()

foreach ($t in $wcTournaments) {
    Write-Host "`n  Fetching events for: $($t.name) (id=$($t.id))" -ForegroundColor Cyan
    
    # Get seasons for this tournament
    $seasonsResp = Invoke-SofaScore "https://api.sofascore.com/api/v1/unique-tournaments/$($t.id)/seasons"
    if (-not $seasonsResp -or -not $seasonsResp.seasons) {
        Write-Warning "  No seasons found for $($t.name)"
        continue
    }
    
    # Use the first (current) season
    $currentSeason = $seasonsResp.seasons | Select-Object -First 1
    $seasonId = $currentSeason.id
    Write-Host "    Season: $($currentSeason.name) (id=$seasonId)"
    
    # Fetch events for this season (paginated)
    $page = 0
    $hasMore = $true
    while ($hasMore) {
        $eventsResp = Invoke-SofaScore "https://api.sofascore.com/api/v1/tournaments/$($t.id)/events?editionId=$seasonId&page=$page&course_events=last"
        if (-not $eventsResp -or -not $eventsResp.events) {
            $hasMore = $false
            break
        }
        
        foreach ($ev in $eventsResp.events) {
            $status = $ev.status.code  # 0=not started, 1=live, 2=finished
            $event = @{
                id = $ev.id
                tournament = $t.name
                tournamentId = $t.id
                name = $ev.name
                home = $ev.homeTeam.name
                away = $ev.awayTeam.name
                homeScore = $ev.homeScore.current
                awayScore = $ev.awayScore.current
                status = $status
                statusDesc = $ev.status.description
                startTimestamp = $ev.startTimestamp
                round = if ($ev.roundInfo) { $ev.roundInfo.round } else { $null }
                category = $t.category.name
            }
            $allEvents += $event
            
            # Build calendar entry
            if ($status -ne 2) {
                $dt = [DateTimeOffset]::FromUnixTimeSeconds($ev.startTimestamp).DateTime
                $allCalendar += @{
                    name = $ev.name
                    date = $dt.ToString('dd MMM yyyy')
                    location = if ($ev.venue) { "$($ev.venue.city.name), $($ev.venue.city.country.alpha2)" } else { '' }
                    category = $t.category.name
                    surface = ''
                    status = if ($status -eq 1) { 'Live' } else { '' }
                }
            }
            
            # Build result entry for finished matches
            if ($status -eq 2) {
                $allResults += @{
                    tournament = $t.name
                    date = ([DateTimeOffset]::FromUnixTimeSeconds($ev.startTimestamp).DateTime).ToString('MMM yyyy')
                    surface = ''
                    match = "$($ev.homeTeam.name) d. $($ev.awayTeam.name)"
                    score = "$($ev.homeScore.current)-$($ev.awayScore.current)"
                }
            }
        }
        
        $page++
        if ($eventsResp.events.Count -lt 50) { $hasMore = $false }
    }
}

Write-Host "`n=== Results ===" -ForegroundColor Cyan
Write-Host "  Tournaments: $($wcTournaments.Count)"
Write-Host "  Total events: $($allEvents.Count)"
Write-Host "  Calendar (upcoming/live): $($allCalendar.Count)"
Write-Host "  Results (finished): $($allResults.Count)"

# ─── Merge with existing wheelchair.json (preserve rankings) ───
Write-Host "`n=== Merging with existing data ===" -ForegroundColor Cyan
$existing = $null
if (Test-Path -LiteralPath $outRoot) {
    try {
        $existing = Get-Content -LiteralPath $outRoot -Raw -Encoding UTF8 | ConvertFrom-Json
        Write-Host "  Loaded existing wheelchair.json (updated: $($existing.updated))"
    } catch {
        Write-Warning "  Could not parse existing wheelchair.json"
    }
}

# Build merged calendar: combine Sofascore events with existing static calendar
$mergedCalendar = @()
$existingCalNames = @()

if ($existing -and $existing.calendar) {
    foreach ($c in $existing.calendar) {
        $existingCalNames += $c.name
        $mergedCalendar += $c
    }
}

# Add Sofascore events not already in calendar
foreach ($cal in $allCalendar) {
    if ($cal.name -notin $existingCalNames) {
        $mergedCalendar += $cal
    }
}

# Build merged results: keep existing, add new from Sofascore
$mergedResults = @()
if ($existing -and $existing.recentResults) {
    foreach ($r in $existing.recentResults) {
        $mergedResults += $r
    }
}
# Add new results from Sofascore (that don't already exist)
$existingResultKeys = @()
foreach ($r in $mergedResults) {
    $existingResultKeys += "$($r.tournament)|$($r.date)"
}
foreach ($res in $allResults) {
    $key = "$($res.tournament)|$($res.date)"
    if ($key -notin $existingResultKeys) {
        $mergedResults += $res
    }
}

# ─── Build output JSON ───
$output = @{
    ok = $true
    updated = (Get-Date).ToString('yyyy-MM-dd')
    rankings = if ($existing -and $existing.rankings) { $existing.rankings } else { @{ menSingles=@(); womenSingles=@(); menDoubles=@(); womenDoubles=@(); quad=@() } }
    calendar = $mergedCalendar
    recentResults = $mergedResults
    source = 'Sofascore API + ITF/Wikipedia'
    sofaScoreTournaments = $wcTournaments | ForEach-Object { @{ id = $_.id; name = $_.name } }
}

# Write root
$output | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $outRoot -Encoding UTF8
Write-Host "`n  Written: $outRoot" -ForegroundColor Green

# Write to web-github
$webDir = Join-Path $root 'web-github'
if (-not (Test-Path -LiteralPath $webDir)) {
    New-Item -ItemType Directory -Path $webDir -Force | Out-Null
}
$output | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $outPages -Encoding UTF8
Write-Host "  Written: $outPages" -ForegroundColor Green

Write-Host "`nDone! $($allEvents.Count) events from Sofascore." -ForegroundColor Green
