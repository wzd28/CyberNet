$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$IndexPath = Join-Path $Root "public\index.html"

if (-not (Test-Path $IndexPath)) {
  throw "public\index.html was not found. Copy this package into the main CyberNet project folder first."
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = "$IndexPath.backup-$stamp"
Copy-Item $IndexPath $backup -Force
Write-Host "Backup created: $backup" -ForegroundColor Cyan

$html = [System.IO.File]::ReadAllText($IndexPath, [System.Text.Encoding]::UTF8)

# Ensure UTF-8 is declared.
if ($html -notmatch '<meta\s+charset=') {
  $metaLine = "`r`n  <meta charset=`"UTF-8`" />"
  $html = [regex]::Replace($html, '(?is)(<head[^>]*>)', '$1' + $metaLine, 1)
}

function Add-BeforeHead([string]$content, [string]$marker, [string]$line) {
  if ($content -notmatch [regex]::Escape($marker)) {
    return [regex]::Replace($content, '(?is)</head>', "  $line`r`n</head>", 1)
  }
  return $content
}

function Add-BeforeBody([string]$content, [string]$marker, [string]$line) {
  if ($content -notmatch [regex]::Escape($marker)) {
    return [regex]::Replace($content, '(?is)</body>', "  $line`r`n</body>", 1)
  }
  return $content
}

$html = Add-BeforeHead $html 'cybernet-legal.css' '<link rel="stylesheet" href="cybernet-legal.css" />'
$html = Add-BeforeHead $html 'cybernet-final-release.css' '<link rel="stylesheet" href="cybernet-final-release.css" />'

# Script order matters: existing site -> account/UI -> legal -> final release.
$html = Add-BeforeBody $html 'cybernet-final-ui-fix.js' '<script src="cybernet-final-ui-fix.js" defer></script>'
$html = Add-BeforeBody $html 'cybernet-legal-upgrade.js' '<script src="cybernet-legal-upgrade.js" defer></script>'
$html = Add-BeforeBody $html 'cybernet-final-release.js' '<script src="cybernet-final-release.js" defer></script>'

# Replace the pricing heading immediately in static HTML.
$html = [regex]::Replace(
  $html,
  '(?is)<h1>\s*Choose\s+the\s+protection\s+that\s*<span>\s*fits\s+you\s*</span>\s*</h1>',
  '<h1>One platform. <span>Complete protection.</span></h1>',
  1
)

# Remove the old large automated-analysis banner if an earlier version inserted it directly.
$html = [regex]::Replace($html, '(?is)\s*<div[^>]*class="[^"]*cn-analysis-disclaimer[^"]*"[^>]*>.*?</div>\s*', "`r`n")

# Correct privacy/marketing statements that no longer match server-side processing.
$html = $html.Replace('on-device, never stored or sold', 'data minimised and never sold')
$html = $html.Replace("Your data stays on your device. We don't store, share, or sell anything.", 'CyberNet minimises data, protects account information, and does not sell personal data. Submitted evidence may be processed by disclosed service providers to deliver analysis.')
$html = $html.Replace('Your data is encrypted, secure, and never shared.', 'CyberNet uses security controls and shares limited data only with disclosed providers when needed to operate the service.')
$html = $html.Replace('Advanced AI detects and neutralizes threats in real-time.', 'Advanced analysis helps identify suspicious signals and explains defensive next steps.')
$html = $html.Replace('24/7 monitoring protects you from evolving threats.', 'On-demand analysis helps you review suspicious content before taking action.')
$html = $html.Replace('Used by individuals and organizations globally.', 'Designed for individuals, students, and organisations seeking clearer cyber-risk guidance.')

[System.IO.File]::WriteAllText($IndexPath, $html, [System.Text.UTF8Encoding]::new($false))

Write-Host "CyberNet final release installed successfully." -ForegroundColor Green
Write-Host "Next: run supabase\legal_privacy_upgrade.sql once in Supabase SQL Editor." -ForegroundColor Yellow
Write-Host "Then run: npm.cmd install" -ForegroundColor Yellow
Write-Host "Then deploy: netlify.cmd deploy --prod --dir=public --functions=netlify/functions" -ForegroundColor Yellow
