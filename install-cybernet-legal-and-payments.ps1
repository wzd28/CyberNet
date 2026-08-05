$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$SourceAssets = Join-Path $ProjectRoot "public"
$PublicIndex = Join-Path $ProjectRoot "public\index.html"
$RootIndex = Join-Path $ProjectRoot "index.html"

Write-Host ""
Write-Host "CyberNet AI - Legal, Terms and Payment Upgrade" -ForegroundColor Cyan
Write-Host "-------------------------------------------------" -ForegroundColor Cyan

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

$CssPattern = '(?i)<link[^>]+href=["'']cybernet-legal\.css["''][^>]*>'
if ($Html -notmatch $CssPattern) {
  if ($Html -notmatch '(?i)</head>') {
    throw "Could not find </head> in $IndexPath. The backup was kept."
  }
  $CssLine = '  <link rel="stylesheet" href="cybernet-legal.css" />'
  $Html = [regex]::Replace($Html, '(?i)</head>', "$CssLine`r`n</head>", 1)
  Write-Host "Added CyberNet legal styling." -ForegroundColor Green
} else {
  Write-Host "CyberNet legal styling is already linked." -ForegroundColor Yellow
}

$Scripts = @(
  "cybernet-final-ui-fix.js",
  "cybernet-legal-upgrade.js"
)

foreach ($ScriptName in $Scripts) {
  $Escaped = [regex]::Escape($ScriptName)
  $ScriptPattern = "(?i)<script[^>]+src=[`"']$Escaped[`"'][^>]*></script>"
  if ($Html -notmatch $ScriptPattern) {
    if ($Html -notmatch '(?i)</body>') {
      throw "Could not find </body> in $IndexPath. The backup was kept."
    }
    $ScriptLine = "  <script src=`"$ScriptName`" defer></script>"
    $Html = [regex]::Replace($Html, '(?i)</body>', "$ScriptLine`r`n</body>", 1)
    Write-Host "Added $ScriptName." -ForegroundColor Green
  } else {
    Write-Host "$ScriptName is already linked." -ForegroundColor Yellow
  }
}

[System.IO.File]::WriteAllText($IndexPath, $Html, $Utf8NoBom)

$SitemapPath = Join-Path $PublishFolder "sitemap.xml"
if (Test-Path $SitemapPath) {
  $SitemapBackup = "$SitemapPath.backup-$Timestamp"
  Copy-Item $SitemapPath $SitemapBackup -Force
  $Sitemap = [System.IO.File]::ReadAllText($SitemapPath)
  $LegalUrls = @(
    "https://cybernetai.app/terms.html",
    "https://cybernetai.app/privacy.html",
    "https://cybernetai.app/refunds.html",
    "https://cybernetai.app/acceptable-use.html"
  )

  foreach ($Url in $LegalUrls) {
    if ($Sitemap -notmatch [regex]::Escape($Url)) {
      $Block = "  <url>`r`n    <loc>$Url</loc>`r`n    <lastmod>2026-08-04</lastmod>`r`n  </url>`r`n"
      if ($Sitemap -match '(?i)</urlset>') {
        $Sitemap = [regex]::Replace($Sitemap, '(?i)</urlset>', "$Block</urlset>", 1)
      }
    }
  }

  [System.IO.File]::WriteAllText($SitemapPath, $Sitemap, $Utf8NoBom)
  Write-Host "Updated sitemap.xml with the legal pages." -ForegroundColor Green
}

Write-Host ""
Write-Host "Installation complete." -ForegroundColor Green
Write-Host "Added:" -ForegroundColor Cyan
Write-Host "- Scrollable Legal Center" -ForegroundColor White
Write-Host "- Required account-creation acceptance" -ForegroundColor White
Write-Host "- Required recurring-payment acceptance" -ForegroundColor White
Write-Host "- Terms, Privacy, Refund and Acceptable Use pages" -ForegroundColor White
Write-Host "- Footer and Account legal links" -ForegroundColor White
Write-Host "- Cybersecurity and AI result disclaimers" -ForegroundColor White
Write-Host ""
Write-Host "Deploy with:" -ForegroundColor Cyan
Write-Host $DeployCommand -ForegroundColor White
Write-Host ""
