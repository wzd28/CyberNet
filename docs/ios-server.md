# iPhone app: server side (Netlify functions)

Written 29 Oct 2026 for the CyberNet AI iPhone app 1.0; rewritten 30 Oct 2026 for the owner's
decision that the app has the website's **Free / Pro / Business** plans, sold with **Apple
In-App Purchase** (StoreKit 2). That replaces the 29 Oct rule "every feature unlocked with
Free-sized limits, no purchases in 1.0". Names only: no keys, codes or passwords belong in this
repository (it is public).

## Plans: one account, one plan, on the website and in the app

An account has the highest plan from any source: a Business team it belongs to (whoever pays), then
Pro (Stripe, or an Apple subscription that is paid up), then Free. The plan is **derived when read**
and never copied into `profiles.plan`.

| | Free | Pro | Business (team) | Enforced by |
|---|---|---|---|---|
| Analysis AI a day | 3 | 15 | pool 50 / 90 / 160 (5 / 10 / 20 seats) | `consume_analysis`, `consume_analysis_business` (resets 00:00 UTC) |
| Quick Scans a day | 5 | unlimited | unlimited | `consume_quickscan` (the app counts guests on the device) |
| Recovery cases a day | 1 | 3 | pool 20 / 36 / 64 | `consume_recovery_case(_business)` (resets 12:00 Gulf time) |
| Recovery updates | 1 a day, 6 h wait | no cap, 2 h wait | no cap, 1 h wait | `consume_recovery_update(_business)` |
| Saved history, reports, Recovery timeline | no | yes | yes | `analyze` (history); the pages (reports, timeline lock) |

`netlify/lib/plans.mjs` holds these numbers **for display only** (account-status `usage` and
`recoveryUsage`); the SQL functions enforce them and `tests/run-ios-migration.mjs` checks the two agree.

Where a plan comes from (`netlify/lib/entitlements.mjs`, `describeBilling()`):

| Source | Stored in |
|---|---|
| Stripe Pro | `profiles.plan = 'pro'`, status active / trialing (unchanged) |
| Stripe Business | `business_accounts` with `billing_source = 'stripe'` (unchanged) |
| Apple Pro | `apple_subscriptions` (new), `plan = 'pro'` |
| Apple Business | `apple_subscriptions` **and** a `business_accounts` row with `billing_source = 'apple'` (same seat pools and owner membership as Stripe) |

The disclosed exception: `REVIEW_ACCOUNT_EMAILS` and `ADMIN_EMAILS` (confirmed email) get raised daily
counts in the app (50 AI analyses, 10 Recovery cases, 10 updates, no wait) through the `consume_*_app`
functions. They stay a Free plan, so a reviewer can still buy with a sandbox Apple ID. An admin gets no
admin bypass in the app.

Never double-charging: the app does not offer a plan the account already has;
`create-checkout-session` answers 409 when the person already has that plan or a higher one from any
source (Stripe, Apple, or a team); `customer-portal` answers 409 `BILLED_BY_APPLE` for a plan Apple
bills; `account-status` sets `profile.billing.alsoBilledElsewhere` when two subscriptions pay at once.

## Environment variables the owner sets in Netlify

| Name | Needed for | Value |
|---|---|---|
| `REVIEW_ACCOUNT_EMAILS` | The App Review demo account's raised counts (disclosed in the review notes) | Comma-separated emails. The account's email must be confirmed |
| `APPLE_APP_APPLE_ID` | Optional hardening of `apple-notifications`: a Production notification must carry this app id | The app's numeric Apple ID (App Store Connect > App Information). **Public, not a secret** |
| `APPLE_SWEEP` | Optional kill switch for the hourly `apple-sweep` | `off` to stop it |
| `APPLE_TEAM_ID`, `APPLE_SIWA_KEY_ID`, `APPLE_SIWA_PRIVATE_KEY`, `APPLE_SIWA_CLIENT_ID` | Sign in with Apple token revocation on account deletion (unchanged) | see below |
| `STRIPE_SECRET_KEY` | Already set. Deletion cancels open Stripe subscriptions with it | unchanged |
| `ADMIN_EMAILS` | Already set. In the app, admins get the review accounts' raised counts and no bypass | unchanged |

**No Apple API key, issuer id or shared secret is needed or read** for purchases. The server verifies
Apple's signed data (JWS) itself, with `node:crypto`, against Apple's public root certificate.

Without the Sign in with Apple variables, deletion still works; the Apple tokens are just not revoked
(logged as `Apple token revocation failed (not_configured)`).

## Owner steps, in order

1. **Embed Apple Root CA - G3** in `netlify/lib/apple-root-ca-g3.mjs` (a public certificate; the file
   says how: download `AppleRootCA-G3.cer` from apple.com/certificateauthority, check its SHA-256
   against Apple's PKI page, paste the base64). Until then every purchase check answers 503 and
   `node tests/run-apple-iap.mjs` fails on purpose.
2. **Run the migration** `supabase/migrations/20261030120000_apple_iap.sql` in the Supabase SQL Editor
   (and `20261029120000_ios_app_1_0.sql` if it has not been run). Verify queries at the bottom of each
   file. Do this **before** the web/server deploy: the new code reads the new tables and columns (it
   falls back quietly where it can, but plans bought in the app cannot be recorded without them).
3. Deploy the website and functions once.
4. **App Store Connect > the app > App Store Server Notifications**: Version 2, Production URL and
   Sandbox URL both `https://cybernetai.app/api/apple-notifications`.
5. Subscription group "CyberNet AI Plans" with the five products below; billing grace period ON.

Products (ids exactly; prices are set in App Store Connect, never in code): `app.cybernetai.pro.monthly`,
`app.cybernetai.pro.yearly`, `app.cybernetai.business5.monthly` (5 seats, pools 50 / 20),
`app.cybernetai.business10.monthly` (10 seats, 90 / 36), `app.cybernetai.business20.monthly` (20 seats,
160 / 64). Yearly Business exists on the website only. `netlify/lib/apple-products.mjs` and
`apply_apple_subscription` (SQL) carry the same table; a test compares them.

## Database

`supabase/migrations/20261030120000_apple_iap.sql` (mirrored at the end of `supabase/schema.sql`):

- `apple_subscriptions` (one row per original transaction) and `apple_notifications` (idempotency and
  audit, no payload; rows older than 90 days are deleted by `rate-limit-cleanup`). RLS on, no
  policies, `service_role` only.
- `business_accounts.billing_source` (`stripe` | `apple`) and `apple_original_transaction_id`.
- `plan_of(user)`: the one place that decides a person's own plan. `consume_analysis`,
  `consume_recovery_case`, `consume_recovery_update` and `consume_quickscan` now read the plan through
  it and are otherwise unchanged: with no Apple row they answer exactly as before.
- `apply_apple_subscription(...)`: records a verified transaction (ordering by purchase date and signing
  time, `wrong_account`, team create / reuse / `conflict_web_plan` / `in_other_team`) in one transaction.
- `expire_apple_subscriptions()`: run hourly by `netlify/functions/apple-sweep.mjs`.

## How the server recognises the app

`netlify/lib/cors.mjs`: a request is from the app when it carries `X-CyberNet-Platform: ios` or
comes from the origin `capacitor://localhost`. Only that origin gets CORS headers. Website
requests are unchanged.

| Function | In the app |
|---|---|
| `apple-verify` (new) | iPhone only (`iosOnly`, 403 for the website). `POST {reason, transactions:[{jws, renewalInfoJws?}]}`, at most 20, 30 requests an hour per account. Each JWS is verified; the transaction's `appAccountToken` must be the signed-in account's id. Reply `{results:[{index, transactionId, originalTransactionId, productId, status, finish}], plan, billing}`; `status` is `applied`, `stale`, `expired`, `revoked`, `wrong_account`, `not_ours`, `invalid`, `conflict_web_plan` or `in_other_team`; `finish:false` only ever comes with a 503 |
| `apple-notifications` (new) | Apple only (signed body, no sign-in). App Store Server Notifications V2: `SUBSCRIBED`, `DID_RENEW`, `DID_CHANGE_RENEWAL_STATUS`, `DID_CHANGE_RENEWAL_PREF`, `DID_FAIL_TO_RENEW` (grace period keeps access), `GRACE_PERIOD_EXPIRED`, `EXPIRED`, `REFUND`, `REVOKE`, `REFUND_REVERSED`, `RENEWAL_EXTENDED`, `OFFER_REDEEMED`; the rest are recorded as ignored. 400 for a bad signature, 500 when the database fails (Apple delivers again), 200 for duplicates, other apps and deleted accounts |
| `apple-sweep` (new) | Hourly: closes Apple-billed teams whose subscription ended without a notification |
| `account-status` | The real plan, usage and limits; `profile.billing {source: "apple"\|"stripe"\|"team"\|null, plan, productId, seatTier, interval, renewsAt, endsAt, autoRenew, inGrace, environment, alsoBilledElsewhere}`; `isAdmin: false`, `platform: "ios"`, `recoveryUsage`, `aiConsent {granted, known, version}`; history (`?includeHistory=1`) for Pro and Business; `profile.isTeamMember` is for members only on the iPhone (the team notice) |
| `analyze` | 428 `AI_CONSENT_REQUIRED` without consent; the account's own counter (`consume_analysis` / team pool); Free uses the mini model, Pro and Business the full one for ambiguous items; history saved for Pro, Business and team members; `mode=investigation` 403; at the limit the website's `Daily Free limit reached.` style message with code `daily_limit_reached` |
| `recovery-mode`, `recovery-update` | Consent first (428), then the plan's own counters (team pool for team members); the website's limit and cooldown messages |
| `quickscan-usage` | Counts the app's three Quick Scan buttons; no admin bypass in the app |
| `business-account`, `business-activity`, `business-invite`, `business-invite-cancel`, `business-member-remove` | Team management in the app (CORS). Accepting an invite stays on the website |
| `public-stats` | CORS, for the Home tab's live numbers |
| `ai-consent` | `GET` state, `POST {version}` grant (409 if the version is not the current one; 429 `rate_limited` after 30 grants an hour per account), `DELETE` withdraw (never rate-limited). Current version: `2026-11-ios-1` (`netlify/lib/ai-consent.mjs`) |
| `privacy-data` | `delete-account` accepts `appleAuthorizationCode`; reply adds `cancelledSubscriptions`, `appleTokensRevoked` and, when an App Store subscription was open, `appleSubscriptionOpen: true` (deletion cannot cancel it; the app tells the person to cancel in Settings). Apple-billed teams are closed with no Stripe call; the export includes the person's `appleSubscriptions` |
| `feedback` | Result reports: `{kind, resultId, comment?, platform: "ios", appVersion}`; `kind` is one of `quick_scan`, `qr`, `share`, `analysis_ai`, `recovery` |
| `client-error`, `legal-acceptance`, `recovery-case`, `team-activity` | CORS only (`team-activity` does not log on-device Quick Scans from the app) |
| `create-checkout-session`, `customer-portal`, `byok-analyze`, `validate-openai-key`, `screenshot-preview`, `feedback-admin`, `business-invite-accept` | 403 `NOT_AVAILABLE_IN_APP` (purchases in the app are Apple In-App Purchase only) |

`stripe-webhook`: a late Stripe event for an old plan (typically `customer.subscription.deleted`) does
not change a Business team that Apple now bills; a live Stripe subscription takes over a team that is
not paid by Apple any more and marks it `billing_source = 'stripe'`.

`recovery-checkin` sends the idle-case reminder to Apple Pro accounts too.

Account deletion is immediate on the website too (owner decision, 29 Oct 2026): open Stripe
subscriptions, including owned Business teams, are cancelled at once with no refund, then the
account is deleted. If Stripe cannot cancel, nothing is deleted (`SUBSCRIPTION_CANCEL_FAILED`). A stored
Stripe customer that Stripe no longer knows (`resource_missing`: deleted, or a test-mode id) is
skipped, because nothing can bill it. If only the check for stray subscriptions fails and no plan is
known to be open, the reply is `BILLING_CHECK_FAILED`, which does not mention a paid plan. An **Apple**
subscription cannot be cancelled by the server: deletion goes ahead and says
`appleSubscriptionOpen: true`.

Tests: `node tests/run-apple-iap.mjs` (the JWS verifier with a certificate chain built in the test, the
endpoints against a stubbed Supabase; fails until the Apple root is embedded), `node tests/run-ios-server.mjs`,
`node tests/run-ios-migration.mjs` (PGlite: both migrations, `plan_of`, the usage functions, every
`apply_apple_subscription` case, and the Netlify functions end to end against that database) and
`node tests/run-privacy.mjs`.
