CYBERNET AI — FINAL BRANDING, MENU, REPORTS, AND ENCODING FIX
=============================================================

THIS IS AN ADDITIVE UPDATE
--------------------------
This package uses your latest July 29 website plus the July 31 Account/API
upgrade. It does not replace your working Protect, CyberNet AI, GhostScan,
Supabase, Stripe, Netlify Functions, pricing, login, or billing code.

WHAT THIS FIXES
---------------
1. Repairs corrupted symbols such as:
   âœ“   â€”   â†’   ðŸ”’
   The repair also watches content added later by JavaScript.

2. Replaces the phone hamburger-only control with a clear:
   MENU / CLOSE button.

3. Moves saved content into Account:
   - AI Scan History
   - Saved CyberNet Protect investigation reports
   The Saved Reports tab is removed from Protect.

4. Adds your CyberNet AI logo:
   - Navbar, replacing >_
   - Sign-in/account branding where >_ was used
   - Account heading: logo + Account
   - Browser favicon

5. Replaces the Home hero shield with the exact shield-and-lock extracted from
   your logo while keeping the existing rings, movement, glow, status cards,
   layout, and animations.

FILES IN THIS PACKAGE
---------------------
public/cybernet-final-ui-fix.js
public/cybernet-logo.png
public/cybernet-shield.png
install-cybernet-final-ui-fix.ps1
README-FIRST.txt

INSTALLATION — COPY AND RUN ONCE
--------------------------------
1. Extract this ZIP.
2. Copy everything inside the extracted folder.
3. Paste it into your main CyberNet folder:

   C:\Users\zeine\OneDrive\Desktop\CyberNet

4. Allow Windows to merge the public folder.
5. Open the main CyberNet folder in VS Code.
6. Open PowerShell in VS Code and run:

   powershell -ExecutionPolicy Bypass -File .\install-cybernet-final-ui-fix.ps1

The installer:
- checks all required files
- creates a timestamped backup of public/index.html
- keeps/creates UTF-8 metadata
- adds this line immediately before </body>:

  <script src="cybernet-final-ui-fix.js" defer></script>

It will not add the line twice.

DEPLOY
------
Run from the main CyberNet folder:

   netlify.cmd deploy --prod --dir=public --functions=netlify/functions

Then hard-refresh the website:

Windows Chrome / Edge:
   Ctrl + Shift + R

PHONE TEST
----------
1. Open the website on the phone.
2. Confirm MENU is visible in the top-right.
3. Tap MENU and confirm it changes to CLOSE.
4. Open Account.
5. Confirm these two tabs appear:
   - Account Info
   - Saved Reports
6. Confirm Saved Reports is no longer shown inside Protect.
7. Confirm corrupted symbols are readable.
8. Confirm the navbar and Account heading show your logo.
9. Confirm the Home shield uses your logo shield while the moving UI remains.

ROLLBACK
--------
The installer creates:

public\index.html.backup-YYYYMMDD-HHMMSS

To undo the update:
1. Delete the changed public/index.html.
2. Rename the backup to index.html.
3. Delete these three files from public:
   cybernet-final-ui-fix.js
   cybernet-logo.png
   cybernet-shield.png
4. Deploy again.
