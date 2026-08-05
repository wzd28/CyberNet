$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$publicDir = Join-Path $projectRoot "public"
$indexPath = Join-Path $publicDir "index.html"

Write-Host ""
Write-Host "CyberNet final account/API/Google installer" -ForegroundColor Cyan
Write-Host "Project folder: $projectRoot"

if (-not (Test-Path $indexPath)) {
    throw "Could not find public\index.html. Put this installer in the main CyberNet folder, then run it again."
}

$requiredFiles = @(
    "public\cybernet-account-api-upgrade.css",
    "public\cybernet-account-api-upgrade.js",
    "public\robots.txt",
    "public\sitemap.xml",
    "netlify\functions\validate-openai-key.mts",
    "netlify\functions\byok-analyze.mts",
    "netlify\lib\supabase.mjs"
)

$missing = @()
foreach ($relative in $requiredFiles) {
    $full = Join-Path $projectRoot $relative
    if (-not (Test-Path $full)) {
        $missing += $relative
    }
}

if ($missing.Count -gt 0) {
    Write-Host "Missing required files:" -ForegroundColor Red
    $missing | ForEach-Object { Write-Host "  - $_" }
    throw "Copy the ZIP contents into the main CyberNet folder before running the installer."
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = Join-Path $publicDir "index.backup-$timestamp.html"
Copy-Item $indexPath $backupPath -Force
Write-Host "Backup created: $backupPath" -ForegroundColor Green

$html = Get-Content $indexPath -Raw

$stylesheetLine = '<link id="cybernetAccountUpgradeStylesheet" rel="stylesheet" href="cybernet-account-api-upgrade.css" />'
$scriptLine = '<script src="cybernet-account-api-upgrade.js" defer></script>'

$seoBlock = @'
<!-- CYBERNET-SEO-UPGRADE:START -->
<link rel="canonical" href="https://cybernetai.app/" />
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="CyberNet AI" />
<meta property="og:title" content="CyberNet AI | AI-Powered Cybersecurity" />
<meta property="og:description" content="Analyze suspicious messages, links, QR codes, screenshots, and cybersecurity evidence with clear risk explanations and defensive next actions." />
<meta property="og:url" content="https://cybernetai.app/" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="CyberNet AI | AI-Powered Cybersecurity" />
<meta name="twitter:description" content="Analyze suspicious messages, links, QR codes, screenshots, and cybersecurity evidence with clear risk explanations and defensive next actions." />
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": "https://cybernetai.app/#website",
      "url": "https://cybernetai.app/",
      "name": "CyberNet AI",
      "description": "AI-powered cybersecurity analysis for suspicious messages, links, QR codes, screenshots, and incident evidence.",
      "inLanguage": "en"
    },
    {
      "@type": "Organization",
      "@id": "https://cybernetai.app/#organization",
      "name": "CyberNet AI",
      "url": "https://cybernetai.app/",
      "email": "cybernetai.26@gmail.com"
    }
  ]
}
</script>
<!-- CYBERNET-SEO-UPGRADE:END -->
'@

if ($html -notmatch 'id="cybernetAccountUpgradeStylesheet"') {
    if ($html -notmatch '</head>') {
        throw "The current index.html does not contain </head>."
    }
    $html = $html -replace '</head>', "  $stylesheetLine`r`n</head>"
    Write-Host "Added the upgrade stylesheet to index.html." -ForegroundColor Green
} else {
    Write-Host "Upgrade stylesheet already present." -ForegroundColor Yellow
}

if ($html -notmatch 'CYBERNET-SEO-UPGRADE:START') {
    $html = $html -replace '</head>', "`r`n$seoBlock`r`n</head>"
    Write-Host "Added Google/SEO metadata to index.html." -ForegroundColor Green
} else {
    Write-Host "Google/SEO metadata already present." -ForegroundColor Yellow
}

if ($html -notmatch 'src="cybernet-account-api-upgrade\.js"') {
    if ($html -notmatch '</body>') {
        throw "The current index.html does not contain </body>."
    }
    $html = $html -replace '</body>', "  $scriptLine`r`n</body>"
    Write-Host "Added the account/API upgrade script to index.html." -ForegroundColor Green
} else {
    Write-Host "Upgrade script already present." -ForegroundColor Yellow
}

Set-Content -Path $indexPath -Value $html -Encoding UTF8

Write-Host ""
Write-Host "Installation finished successfully." -ForegroundColor Cyan
Write-Host "Your original index is saved at:" -ForegroundColor White
Write-Host "  $backupPath"
Write-Host ""
Write-Host "Next, deploy from this same folder:" -ForegroundColor White
Write-Host "  npm.cmd install"
Write-Host "  netlify.cmd deploy --prod --dir=public --functions=netlify/functions"
Write-Host ""
