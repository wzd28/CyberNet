# CyberNet AI 1.1.1: release notes

The "What's New" text for App Store Connect is the block below (plain text, under 4,000 characters, no prices or website links).
The notes under it are for the team and are not pasted anywhere.

## What's New in Version 1.1.1

```
New: CyberNet AI Pro is now available in the app. Subscribe from Account for more AI checks and Recovery cases every day. Manage or cancel any time in Settings.

This update also fixes a few things you told us about.

- Your name, not your email: if you signed in with Apple, your Account tab now shows your name instead of the first part of your email address (or a random code when you hide your email).
- Add your name: if CyberNet AI has no name for you, Account now has an "Add your name" row. Type your first and last name and it is saved to your account.
- Sign in with Apple is steadier: tapping the button twice no longer starts two sign-ins or shows an error.
- Rate CyberNet AI: you can now rate or review the app from Account, under Help. After you have used a few checks, iPhone may also ask once whether you would like to rate the app. It never asks right after a scam warning or while you are using Recovery.

Thank you for using CyberNet AI. If something does not look right, tap Contact support in Account.
```

## Team notes (not for the App Store)

- Ratings prompt: iOS's own prompt (AppStore.requestReview), asked for after the third finished check (Quick Scan text, link or
  image verdict; QR or shared-item verdict; Analysis AI answer). Only at a calm moment: closing a LOW RISK result, or arriving on
  Home, Learn or Account. Never on Recovery or within 10 minutes of leaving it, never over a sheet or the sign-in card, at most
  once every 60 days. iOS itself shows it at most three times a year and never in TestFlight builds, so it can only be seen in a
  development build or after release.
- The account name repair needs the server change (netlify/lib/supabase.mjs betterProfileName) to be live for the saved name to
  change; the app already shows the right name from the account without it.
- 1.1.1 is the first build WITH in-app purchases: CN_NO_IAP was removed from codemagic.yaml (f9df141). Pro Monthly and Pro Yearly
  must be attached to the 1.1.1 version in App Store Connect and submitted with it.
