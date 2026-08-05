CYBERNET AI — FINAL COMBINED RELEASE
====================================
Version: 2026-08-06

THIS IS A CUMULATIVE UPDATE
---------------------------
It keeps the earlier CyberNet branding, mobile Menu button, Account and Saved
Reports work, Legal Center, signup/payment acceptance, inline Terms viewer,
and removal of the large analysis notice.

NEW IN THIS RELEASE
-------------------
1. Pricing heading changed to:
   One platform. Complete protection.

2. GhostScan concept preview added at the very top of GhostScan, before the
   sign-in/paywall area. The image is responsive and clearly labelled Coming
   Soon / Concept Preview so it attracts users without promising a finished
   feature or release date.

3. Complete Terms of Service updated for:
   - CyberNet Protect and CyberNet AI
   - false positives, false negatives, and no security guarantee
   - scams, hacking, malware, account and financial loss
   - submitted evidence and lawful use
   - BYOK OpenAI keys and direct provider charges
   - Free/Pro plans, recurring payments, cancellation, refunds, disputes
   - saved reports, account deletion, third-party providers, liability
   - GhostScan concept preview and future service

4. Complete Privacy Policy updated for:
   - account/profile/authentication data
   - messages, links, screenshots, QR codes, headers, reports, and support data
   - Supabase, Netlify, Stripe, OpenAI, and future GhostScan providers
   - BYOK key handling and provider processing
   - legal-acceptance records
   - precise retention schedule
   - export, clear-history, and account-deletion rights
   - international processing and security controls
   The legal operator remains a clearly marked placeholder, as requested.

5. Server-side legal acceptance records:
   - signup acceptance is queued until an authenticated session exists
   - checkout acceptance is synced before Stripe Checkout continues when possible
   - records include document versions, server time, user, page, and billing cycle

6. Account -> Privacy & Data tab:
   - Export my data
   - Clear saved history
   - Delete account
   Active subscriptions must be cancelled in Manage Billing before deletion.

7. BYOK disclosure clarified:
   - key stays in current-tab sessionStorage
   - temporarily travels through Netlify over HTTPS
   - requests are sent to OpenAI
   - OpenAI bills the user's own project
   - CyberNet does not intentionally save the key to Supabase/account history

FILES ADDED
-----------
public/ghostscan-preview.png
public/cybernet-final-release.css
public/cybernet-final-release.js
netlify/functions/legal-acceptance.mts
netlify/functions/privacy-data.mts
supabase/legal_privacy_upgrade.sql
install-cybernet-final-release.ps1

INSTALLATION
------------
1. Extract the ZIP.
2. Copy everything inside CyberNet-Final-Release into your main CyberNet folder.
3. Allow Windows to merge public, netlify, and supabase folders.
4. In VS Code Terminal run:

   powershell -ExecutionPolicy Bypass -File .\install-cybernet-final-release.ps1

5. In Supabase Dashboard -> SQL Editor, paste and run once:

   supabase/legal_privacy_upgrade.sql

6. Back in VS Code run:

   npm.cmd install

7. Deploy the public site AND Netlify Functions:

   netlify.cmd deploy --prod --dir=public --functions=netlify/functions

8. Hard refresh the live site with Ctrl + Shift + R.

GIT COMMANDS
------------
git status
git add .
git commit -m "Add final CyberNet legal privacy and GhostScan preview update"
git push

IMPORTANT
---------
- The Privacy & Data buttons and server-side legal records require the SQL
  migration and Netlify Functions to be deployed.
- Keep SUPABASE_SERVICE_ROLE_KEY only in Netlify environment variables.
- This package intentionally does not add the operator's personal or company
  details. Add them after the legal entity is finalised.
- Terms and policies reduce risk and improve transparency but cannot guarantee
  that a business will never face a claim. Obtain a qualified legal review
  before accepting real customers in multiple jurisdictions.
