CYBERNET AI — REMOVE AUTOMATED-ANALYSIS NOTICE

This cumulative update removes the large automated-analysis notice banners from:
- CyberNet Protect
- CyberNet AI
- GhostScan

It keeps the Terms of Service, Privacy Policy, Refund & Cancellation Policy, Acceptable Use Policy, required signup consent, and required Stripe subscription consent.

INSTALL
1. Copy everything in this folder into your main CyberNet project folder.
2. Allow Windows to merge the public folder and replace matching files.
3. In PowerShell, from the CyberNet project folder, run:

   powershell -ExecutionPolicy Bypass -File .\install-cybernet-remove-analysis-notice.ps1

4. Deploy:

   netlify.cmd deploy --prod --dir=public --functions=netlify/functions

5. On the live website press Ctrl + Shift + R.

A backup of index.html is created automatically by the installer.
