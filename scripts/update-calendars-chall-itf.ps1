# Genera calendar_itf.json (ITF World Tennis Tour men+women, ano completo) via Chrome CDP
# y calendar_chall.json (ATP Challenger Tour) via fetch directo a atptour.com.
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\update-calendars-chall-itf.ps1
# Abre una ventana de Chrome ~60s (necesaria para pasar el WAF Incapsula de itftennis.com).
param([switch]$KeepWindow)

$ErrorActionPreference = 'Stop'
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
if (-not (Test-Path $chrome)) { $chrome = 'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe' }
if (-not (Test-Path $chrome)) { throw 'Chrome no encontrado' }

$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$port = Get-Random -Minimum 9300 -Maximum 9399
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ('cal_ci_' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$prof = Join-Path $tmp 'profile'

function Norm-Row($date, $endDate, $name, $cat, $surface, $prize, $draw, $circuit, $location) {
    $today = (Get-Date).ToString('yyyy-MM-dd')
    $isNow = $false
    if ($date -and $endDate -and $today -ge $date -and $today -le $endDate) { $isNow = $true }
    return [pscustomobject]@{
        date     = $date
        endDate  = $endDate
        name     = $name
        circuit  = $circuit
        surface  = $surface
        prize    = $prize
        draw     = $draw
        level    = $circuit
        current  = $isNow
        winner   = ''
        cat      = $cat
        location = $location
    }
}

# ---------- 1) ITF via CDP ----------
Write-Output '[1/2] ITF World Tennis Tour (itftennis.com)...'
$proc = Start-Process -FilePath $chrome -ArgumentList @(
    "--remote-debugging-port=$port", "--user-data-dir=$prof", '--no-first-run',
    '--hide-crash-restore-bubble', '--window-size=1100,800', 'https://www.itftennis.com/en/'
) -PassThru

try {
    $target = $null
    for ($i = 0; $i -lt 25 -and -not $target; $i++) {
        Start-Sleep -Milliseconds 700
        try {
            $list = Invoke-RestMethod -Uri ("http://127.0.0.1:" + $port + "/json") -TimeoutSec 5
            $target = $list | Where-Object { $_.type -eq 'page' } | Select-Object -First 1
        } catch {}
    }
    if (-not $target) { throw 'no se pudo conectar al navegador' }
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    function Send-Cmd($obj) {
        $bytes = [Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Compress -Depth 10))
        $ws.SendAsync([ArraySegment[byte]]::new($bytes), 'Text', $true, [System.Threading.CancellationToken]::None).Wait()
    }
    function Recv-Msg() {
        $ms = New-Object System.IO.MemoryStream
        $buf = New-Object byte[] 4194304
        try {
            while ($true) {
                $seg = [ArraySegment[byte]]::new($buf)
                $r = $ws.ReceiveAsync($seg, [System.Threading.CancellationToken]::None).Result
                [void]$ms.Write($buf, 0, $r.Count)
                if ($r.EndOfMessage) { break }
            }
        } catch { return '' }
        [Text.Encoding]::UTF8.GetString($ms.ToArray())
    }
    $ws.ConnectAsync([Uri]$target.webSocketDebuggerUrl, [System.Threading.CancellationToken]::None).Wait()
    $script:id = 0
    function EvalJs($expr, $awaitP) {
        $script:id++
        $p = @{ expression = $expr; returnByValue = $true }
        if ($awaitP) { $p['awaitPromise'] = $true }
        Send-Cmd @{ id = $script:id; method = 'Runtime.evaluate'; params = $p }
        while ($true) {
            $raw = Recv-Msg
            if ($raw -eq '') { return '' }
            try { $m = $raw | ConvertFrom-Json } catch { continue }
            if ($m.id -eq $script:id) {
                if ($m.result -and $m.result.result -and ($null -ne $m.result.result.value)) { return [string]$m.result.result.value }
                return ''
            }
        }
    }

    Write-Output '  esperando clearance Incapsula (~20s)...'
    Start-Sleep -Seconds 20
    $ping = EvalJs '(function(){return "alive:"+location.hostname})()' $false
    if ($ping -notmatch 'itftennis') { throw ('clearance fallo: ' + $ping) }

    $year = (Get-Date).Year
    foreach ($cc in @('MT', 'WT')) {
        $allTxt = New-Object System.Collections.ArrayList
        $skip = 0
        while ($skip -le 1500) {
            $url = "https://www.itftennis.com/tennis/api/TournamentApi/GetCalendar?circuitCode=$cc&searchString=&skip=$skip&take=250&nationCodes=&zoneCodes=&dateFrom=$year-01-01&dateTo=$year-12-31&indoorOutdoor=&categories=&isOrderAscending=true&orderField=&surfaceCodes=&singlesDrawFormat="
            $expr = "(async()=>{try{const r=await fetch('" + $url + "',{headers:{'Accept':'application/json'}});const t=await r.text();return r.status+'|'+t.length}catch(e){return 'ERR '+e.message}})()"
            $head = EvalJs $expr $true
            if ($head -notmatch '^200\|\d+$') { throw ("fallo fetch ITF $cc skip=$skip : " + $head) }
            $exprFull = "(async()=>{const r=await fetch('" + $url + "',{headers:{'Accept':'application/json'}});return await r.text()})()"
            $full = EvalJs $exprFull $true
            [IO.File]::WriteAllText((Join-Path $tmp ("itf_" + $cc + "_" + $skip + ".json")), $full, [Text.UTF8Encoding]::new($false))
            $batch = $null
            try { $batch = ($full | ConvertFrom-Json).items } catch {}
            $n = if ($batch) { @($batch).Count } else { 0 }
            Write-Output ("    $cc skip=$skip => $n items")
            if ($n -lt 250) { break }
            $skip += 250
        }
        Write-Output ("  circuito $cc completo")
    }
} finally {
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
}

$rowsItf = New-Object System.Collections.ArrayList
foreach ($cc in @('MT', 'WT')) {
    $files = Get-ChildItem $tmp -Filter ("itf_" + $cc + "_*.json") | Sort-Object Name
    foreach ($file in $files) {
        $j = $null
        try { $j = [IO.File]::ReadAllText($file.FullName) | ConvertFrom-Json } catch {}
        if (-not $j -or -not $j.items) { continue }
        foreach ($t in $j.items) {
            $start = ''
            $end = ''
            if ($t.startDate) { try { $start = ([datetime]$t.startDate).ToString('yyyy-MM-dd') } catch {} }
            if ($t.endDate) { try { $end = ([datetime]$t.endDate).ToString('yyyy-MM-dd') } catch {} }
            $name = $t.tournamentName
            if ($t.promotionalName -and $t.promotionalName.Trim() -and $t.promotionalName.Trim() -ne $name) { $name = "$name ($($t.promotionalName.Trim()))" }
            $row = Norm-Row $start $end $name $t.category $t.surfaceDesc $t.prizeMoney 0 'itf' (($t.location + ', ' + $t.hostNationCode))
            [void]$rowsItf.Add($row)
        }
    }
}
# dedupe por nombre+fecha (por si el API solapa paginas)
$rowsItf = @($rowsItf | Sort-Object date, name | Group-Object -Property date, name | ForEach-Object { $_.Group[0] })
if ($rowsItf.Count -eq 0) { throw 'ITF sin datos - no sobreescribir calendar_itf.json' }
$rowsItf = @($rowsItf | Sort-Object date)
$itfOut = [pscustomobject]@{
    ok          = $true
    updated     = (Get-Date).ToUniversalTime().ToString('s') + 'Z'
    source      = 'itftennis.com'
    circuit     = 'itf'
    tournaments = $rowsItf
}
$enc = [Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllText((Join-Path $projectRoot 'calendar_itf.json'), ($itfOut | ConvertTo-Json -Depth 5 -Compress), $enc)
[IO.File]::WriteAllText((Join-Path $projectRoot 'web-github\calendar_itf.json'), ($itfOut | ConvertTo-Json -Depth 5 -Compress), $enc)
Write-Output ("  calendar_itf.json escrito: " + $rowsItf.Count + " torneos")

# ---------- 2) Challenger directo ----------
Write-Output '[2/2] ATP Challenger Tour (atptour.com)...'
$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36'
$cFile = Join-Path $tmp 'chall.json'
curl.exe -s -A $ua -H 'Referer: https://www.atptour.com/en/atp-challenger-tour/calendar' -o $cFile --max-time 40 'https://www.atptour.com/en/-/tournaments/calendar/challenger' | Out-Null
$cj = $null
try { $cj = ([IO.File]::ReadAllText($cFile, [Text.Encoding]::UTF8)) | ConvertFrom-Json } catch {}
if (-not $cj -or -not $cj.TournamentDates) { throw 'challenger sin datos - no sobreescribir calendar_chall.json' }

$inv = [Globalization.CultureInfo]::InvariantCulture
function Get-ChallStart([string]$fd, [string]$fbMon) {
    if (-not $fd) { return '' }
    $m = [regex]::Match($fd, '^(\d{1,2})\s*(?:([A-Za-z]+)\s*)?-\s*\d{1,2}\s+([A-Za-z]+),\s*(\d{4})$')
    if (-not $m.Success) { return '' }
    $monName = if ($m.Groups[2].Value) { $m.Groups[2].Value } else { $m.Groups[3].Value }
    try { return ("{0}-{1}-{2}" -f $m.Groups[4].Value, [datetime]::ParseExact($monName, 'MMMM', $inv).Month.ToString('00'), $m.Groups[1].Value.PadLeft(2, '0')) } catch { return '' }
}
function Get-ChallEnd([string]$fd) {
    if (-not $fd) { return '' }
    $m = [regex]::Match($fd, '^\d{1,2}(?:\s+[A-Za-z]+)?\s*-\s*(\d{1,2})\s+([A-Za-z]+),\s*(\d{4})$')
    if (-not $m.Success) { return '' }
    try { return ("{0}-{1}-{2}" -f $m.Groups[3].Value, [datetime]::ParseExact($m.Groups[2].Value, 'MMMM', $inv).Month.ToString('00'), $m.Groups[1].Value.PadLeft(2, '0')) } catch { return '' }
}
$rowsCh = New-Object System.Collections.ArrayList
foreach ($month in $cj.TournamentDates) {
    $fbMon = ''
    if ($month.DisplayDate -match '^([A-Za-z]+)') { $fbMon = $Matches[1] }
    foreach ($t in $month.Tournaments) {
        $start = Get-ChallStart $t.FormattedDate $fbMon
        $end = Get-ChallEnd $t.FormattedDate
        $drawSz = 0
        if ($t.SglDrawSize) { $drawSz = [int]$t.SglDrawSize }
        $row = Norm-Row $start $end $t.Name '' $t.Surface $t.TotalFinancialCommitment $drawSz 'chall' $t.Location
        [void]$rowsCh.Add($row)
    }
}
if ($rowsCh.Count -eq 0) { throw 'challenger parse 0 filas' }
$rowsCh = @($rowsCh | Sort-Object date)
$chOut = [pscustomobject]@{
    ok          = $true
    updated     = (Get-Date).ToUniversalTime().ToString('s') + 'Z'
    source      = 'atptour.com'
    circuit     = 'chall'
    tournaments = $rowsCh
}
[IO.File]::WriteAllText((Join-Path $projectRoot 'calendar_chall.json'), ($chOut | ConvertTo-Json -Depth 5 -Compress), $enc)
[IO.File]::WriteAllText((Join-Path $projectRoot 'web-github\calendar_chall.json'), ($chOut | ConvertTo-Json -Depth 5 -Compress), $enc)
Write-Output ("  calendar_chall.json escrito: " + $rowsCh.Count + " torneos")
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
Write-Output 'LISTO'
