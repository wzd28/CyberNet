$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$SourceAssets = Join-Path $ProjectRoot "public"
$PublicIndex = Join-Path $ProjectRoot "public\index.html"
$RootIndex = Join-Path $ProjectRoot "index.html"
$CacheVersion = "20260804-3"

Write-Host ""
Write-Host "CyberNet AI - Remove Analysis Notice" -ForegroundColor Cyan
Write-Host "--------------------------------" -ForegroundColor Cyan

if (Test-Path $PublicIndex) {
  $PublishFolder = Join-Path $ProjectRoot "public"
  $IndexPath = $PublicIndex
  $DeployCommand = "netlify.cmd deploy --prod --dir=public --functions=netlify/functions"
} elseif (Test-Path $RootIndex) {
  $PublishFolder = $ProjectRoot
  $IndexPath = $RootIndex
  $DeployCommand = "netlify.cmd deploy --prod"
} else {
  throw "Could not find public\index.html or index.html. Copy this package into the main CyberNet project folder first."
}

$AssetNames = @(
  "cybernet-final-ui-fix.js",
  "cybernet-legal-upgrade.js",
  "cybernet-legal.css",
  "cybernet-logo.png",
  "cybernet-shield.png",
  "terms.html",
  "privacy.html",
  "refunds.html",
  "acceptable-use.html"
)

foreach ($Name in $AssetNames) {
  $SourcePath = Join-Path $SourceAssets $Name
  if (-not (Test-Path $SourcePath)) {
    throw "Package file is missing: $SourcePath"
  }

  $DestinationPath = Join-Path $PublishFolder $Name
  if ($SourcePath -ne $DestinationPath) {
    Copy-Item $SourcePath $DestinationPath -Force
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

$CssTag = "  <link rel=`"stylesheet`" href=`"cybernet-legal.css?v=$CacheVersion`" />"
if ($Html -match '(?i)<link[^>]+href=["'']cybernet-legal\.css(?:\?[^"'']*)?["''][^>]*>') {
  $Html = [regex]::Replace(
    $Html,
    '(?i)<link[^>]+href=["'']cybernet-legal\.css(?:\?[^"'']*)?["''][^>]*>',
    $CssTag,
    1
  )
} else {
  if ($Html -notmatch '(?i)</head>') { throw "Could not find </head> in $IndexPath." }
  $Html = [regex]::Replace($Html, '(?i)</head>', "$CssTag`r`n</head>", 1)
}

$UiScriptTag = '  <script src="cybernet-final-ui-fix.js" defer></script>'
if ($Html -notmatch '(?i)<script[^>]+src=["'']cybernet-final-ui-fix\.js(?:\?[^"'']*)?["''][^>]*></script>') {
  if ($Html -notmatch '(?i)</body>') { throw "Could not find </body> in $IndexPath." }
  $Html = [regex]::Replace($Html, '(?i)</body>', "$UiScriptTag`r`n</body>", 1)
}

$LegalScriptTag = "  <script src=`"cybernet-legal-upgrade.js?v=$CacheVersion`" defer></script>"
if ($Html -match '(?i)<script[^>]+src=["'']cybernet-legal-upgrade\.js(?:\?[^"'']*)?["''][^>]*></script>') {
  $Html = [regex]::Replace(
    $Html,
    '(?i)<script[^>]+src=["'']cybernet-legal-upgrade\.js(?:\?[^"'']*)?["''][^>]*></script>',
    $LegalScriptTag,
    1
  )
} else {
  if ($Html -notmatch '(?i)</body>') { throw "Could not find </body> in $IndexPath." }
  $Html = [regex]::Replace($Html, '(?i)</body>', "$LegalScriptTag`r`n</body>", 1)
}

[System.IO.File]::WriteAllText($IndexPath, $Html, $Utf8NoBom)

Write-Host ""
Write-Host "Analysis notice removal installed successfully." -ForegroundColor Green
Write-Host "The automated-analysis notice banners have been removed from Protect, CyberNet AI, and GhostScan." -ForegroundColor White
Write-Host "The Terms, Privacy Policy, Refund Policy, Acceptable Use Policy, signup consent, and payment consent remain unchanged." -ForegroundColor White
Write-Host ""
Write-Host "Deploy with:" -ForegroundColor Cyan
Write-Host $DeployCommand -ForegroundColor White
Write-Host ""
