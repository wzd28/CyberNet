$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PublicFolder = Join-Path $ProjectRoot "public"
$IndexPath = Join-Path $PublicFolder "index.html"
$ScriptName = "cybernet-final-ui-fix.js"
$ScriptPath = Join-Path $PublicFolder $ScriptName
$LogoPath = Join-Path $PublicFolder "cybernet-logo.png"
$ShieldPath = Join-Path $PublicFolder "cybernet-shield.png"

Write-Host ""
Write-Host "CyberNet AI - Final UI Fix Installer" -ForegroundColor Cyan
Write-Host "-------------------------------------" -ForegroundColor Cyan

foreach ($RequiredPath in @($IndexPath, $ScriptPath, $LogoPath, $ShieldPath)) {
  if (-not (Test-Path $RequiredPath)) {
    throw "Required file is missing: $RequiredPath"
  }
}

$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$BackupPath = "$IndexPath.backup-$Timestamp"
Copy-Item $IndexPath $BackupPath -Force
Write-Host "Backup created: $BackupPath" -ForegroundColor Green

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$Html = [System.IO.File]::ReadAllText($IndexPath)

if ($Html -match '(?i)<meta\s+charset\s*=') {
  $Html = [regex]::Replace(
    $Html,
    '(?i)<meta\s+charset\s*=\s*(["''])?[^"''\s>]+\1?\s*/?>',
    '<meta charset="UTF-8" />',
    1
  )
} else {
  $Html = [regex]::Replace(
    $Html,
    '(?i)<head([^>]*)>',
    '<head$1>' + "`r`n  <meta charset=`"UTF-8`" />",
    1
  )
}

$ScriptPattern = '(?i)<script[^>]+src=["'']cybernet-final-ui-fix\.js["''][^>]*></script>'
if ($Html -notmatch $ScriptPattern) {
  $ScriptLine = '  <script src="cybernet-final-ui-fix.js" defer></script>'
  if ($Html -notmatch '(?i)</body>') {
    throw "Could not find </body> in public/index.html. The backup was kept and no file was changed."
  }
  $Html = [regex]::Replace($Html, '(?i)</body>', "$ScriptLine`r`n</body>", 1)
  Write-Host "Added the final UI fix script to public/index.html." -ForegroundColor Green
} else {
  Write-Host "The final UI fix script is already linked. No duplicate was added." -ForegroundColor Yellow
}

[System.IO.File]::WriteAllText($IndexPath, $Html, $Utf8NoBom)

Write-Host ""
Write-Host "Installation complete." -ForegroundColor Green
Write-Host "Deploy with:" -ForegroundColor Cyan
Write-Host "netlify.cmd deploy --prod --dir=public --functions=netlify/functions" -ForegroundColor White
Write-Host ""
