CYBERNET AI — FINAL ACCOUNT + BILLING + API KEY + GOOGLE UPGRADE
================================================================

DO NOT DELETE YOUR CURRENT WEBSITE FILES
----------------------------------------
This package is designed to sit on top of the working CyberNet project.
It does not replace the huge existing public/index.html, public/style.css,
public/script.js, Protect, GhostScan, Stripe, or Supabase account code.

That is intentional: replacing those large working files with an invented copy
could remove features that already work. Instead, the included installer edits
your real current index.html automatically and creates a backup first.

WHAT IS INCLUDED
----------------
public/cybernet-account-api-upgrade.css
  Complete new Account/API-key/Most-Popular styles.

public/cybernet-account-api-upgrade.js
  Complete browser code that:
  - Adds Account immediately after Pricing.
  - Shows name, email, Free / Pro Monthly / Pro Yearly, subscription status,
    and daily usage.
  - Moves Manage Billing into Account.
  - Removes Manage Billing from CyberNet AI.
  - Restores the OpenAI API-key box.
  - Uses session-only browser storage after secure validation.
  - Routes quick Text, Link, and Image analysis through BYOK when connected.
  - Keeps Deep Investigation on the existing CyberNet server service.
  - Fixes the Most Popular badge clipping.

netlify/functions/validate-openai-key.mts
  Authenticated server validation for a visitor OpenAI API key.

netlify/functions/byok-analyze.mts
  Authenticated BYOK Text/Link/Image analysis with daily plan limits.

public/robots.txt
public/sitemap.xml
  Google crawling and sitemap files.

install-cybernet-upgrade.ps1
  Automatically edits your current public/index.html and creates a backup.

netlify.toml
package.json
  Complete project configuration files for public + Netlify Functions.

EXACT INSTALLATION ORDER
------------------------
1. Download CyberNet-Final-Account-API-Google.zip.
2. Open Downloads and right-click the ZIP.
3. Choose Extract All.
4. Open the extracted folder.
5. Copy everything inside it.
6. Paste it into:

   C:\Users\zeine\OneDrive\Desktop\CyberNet

7. Windows may ask to merge the public and netlify folders. Choose Yes.
8. Open the main CyberNet folder in VS Code.
9. In VS Code PowerShell, run:

   powershell -ExecutionPolicy Bypass -File .\install-cybernet-upgrade.ps1

10. The installer creates a timestamped backup of public/index.html, then adds
    the complete CSS link, JavaScript link, and Google SEO code.
11. Install/update packages:

    npm.cmd install

12. Deploy:

    netlify.cmd deploy --prod --dir=public --functions=netlify/functions

WHAT TO CHECK AFTER DEPLOYMENT
------------------------------
1. Account appears immediately after Pricing.
2. Signed-out users are sent to Sign In or Create Account.
3. Account shows name, email, current plan, status, and daily usage.
4. Pro Monthly shows "CyberNet AI Pro Monthly".
5. Pro Yearly shows "CyberNet AI Pro Yearly".
6. Manage Billing appears only inside Account for Pro users.
7. Manage Billing is gone from CyberNet AI.
8. Most Popular is fully visible.
9. The OpenAI API-key field appears inside CyberNet AI.
10. Invalid keys are rejected.
11. A valid key shows Connected and is removed by Forget Key or closing the tab.
12. These URLs work:

    https://cybernetai.app/robots.txt
    https://cybernetai.app/sitemap.xml

GOOGLE SEARCH CONSOLE
---------------------
After the website is deployed:
1. Open Google Search Console.
2. Add the Domain property: cybernetai.app
3. Add Google's TXT verification record in your domain DNS.
4. Verify the property.
5. Submit sitemap.xml under Sitemaps.
6. Inspect https://cybernetai.app/ and choose Request indexing.

SECRETS
-------
Never put Stripe secret keys, Stripe webhook secrets, Supabase secret/service
keys, or OpenAI API keys inside public files.
