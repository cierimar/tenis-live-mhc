$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$tmp = [System.IO.Path]::GetTempPath()
$today = (Get-Date).ToString('yyyy-MM-dd')
$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'
$headers = @{
  'Referer' = 'https://www.sofascore.com/'
  'Origin'  = 'https://www.sofascore.com'
}

function Get-Norm([string]$s) {
  if (-not $s) { return '' }
  return ($s.ToLower() -replace '[^a-z0-9 ]', ' ' -replace '\s+', ' ').Trim()
}

function Get-Tier([string]$name, [string]$cat) {
  $n = ($name ?? '').ToLower()
  $isW = $cat -eq 'wta'
  if ($n -match 'australian open|roland garros|french open|wimbledon|us open') { return 'GRAND SLAM' }
  if ($n -match 'atp finals|nitto' -and -not $isW) { return 'ATP FINALS' }
  if ($n -match 'wta finals') { return 'WTA FINALS' }
  if ($n -match 'indian wells|miami|monte.?carlo|madrid|\brome\b|\broma\b|canada|canadian|national bank|cincinnati|shanghai|paris|doha|dubai|beijing|wuhan|guadalajara|toronto|montreal') { if ($isW) { return 'WTA 1000' } else { return 'MASTERS 1000' } }
  if ($n -match 'challeng') { return 'CHALLENGER' }
  if ($n -match '\bitf\b') { return 'ITF' }
  if ($isW) { return 'WTA' }
  return 'ATP'
}

$out = [ordered]@{}
$nEvents = 0

try {
  $resp = Invoke-WebRequest -Uri "https://api.sofascore.com/api/v1/sport/tennis/scheduled-tournaments/$today/page/1" -UserAgent $ua -Headers $headers -TimeoutSec 40 -UseBasicParsing
  $j = $resp.Content | ConvertFrom-Json
  foreach ($t in @($j.tournaments)) {
    $tinfo = $t.tournament
    if (-not $tinfo) { continue }
    $cat = ''
    try { $cat = ($tinfo.category.name ?? '').ToLower() } catch {}
    if ($cat -notmatch 'atp|wta|chall|itf') { continue }
    foreach ($ev in @($t.events)) {
      $nEvents++
      $utId = $null
      $utName = ''
      try { if ($tinfo.uniqueTournament -and $tinfo.uniqueTournament.id) { $utId = $tinfo.uniqueTournament.id; $utName = $tinfo.uniqueTournament.name } } catch {}
      if (-not $utId) { try { if ($ev.uniqueTournament -and $ev.uniqueTournament.id) { $utId = $ev.uniqueTournament.id; $utName = $ev.uniqueTournament.name } } catch {} }
      if (-not $utId) { continue }
      $key = Get-Norm $utName
      if (-not $key) { continue }
      $surface = $null
      try { if ($ev.groundType) { $surface = $ev.groundType } } catch {}
      if (-not $out.Contains($key)) {
        $out[$key] = [ordered]@{
          logo    = "https://api.sofascore.com/api/v1/unique-tournament/$utId/image"
          surface = $surface
          tier    = Get-Tier $utName $cat
          circuit = $cat
        }
      } elseif ($surface -and -not $out[$key].surface) {
        $out[$key].surface = $surface
      }
    }
  }
} catch {
  Write-Host "Sofascore fallo: $($_.Exception.Message)"
}

Write-Host "Eventos procesados: $nEvents | Torneos con meta: $($out.Count)"

if ($out.Count -eq 0) {
  Write-Host 'SIN DATOS - no se sobreescribe sofa-meta.json'
  exit 0
}

$result = [ordered]@{
  ok      = $true
  updated = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  count   = $out.Count
  meta    = $out
}

$json = $result | ConvertTo-Json -Depth 6
$dest = Join-Path $PSScriptRoot '..\sofa-meta.json'
[System.IO.File]::WriteAllText($dest, $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Escrito: $dest ($(($json.Length / 1024).ToString('0.0')) KB)"
