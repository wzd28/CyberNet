# iPhone app: server side (Netlify functions)

Written 29 Oct 2026 for the CyberNet AI iPhone app 1.0. Names only: no keys, codes or
passwords belong in this repository (it is public).

## Environment variables the owner sets in Netlify

| Name | Needed for | Value |
|---|---|---|
| `REVIEW_ACCOUNT_EMAILS` | App tier: the App Review demo account gets 50 AI explanations, 10 Recovery cases and 10 updates a day with no update wait (disclosed in the review notes) | Comma-separated emails, e.g. the review address. The account's email must be confirmed |
| `APPLE_TEAM_ID` | Sign in with Apple token revocation on account deletion | The 10-character Apple Developer Team ID |
| `APPLE_SIWA_KEY_ID` | same | Key ID of the "Sign in with Apple" key |
| `APPLE_SIWA_PRIVATE_KEY` | same | The whole `.p8` file (PEM). Line breaks may be pasted as `\n` |
| `APPLE_SIWA_CLIENT_ID` | same (optional) | Defaults to the app's bundle ID `app.cybernetai` |
| `STRIPE_SECRET_KEY` | Already set. Deletion now cancels open subscriptions with it | unchanged |
| `ADMIN_EMAILS` | Already set. In the app, admins get the same raised counts as the review account and no bypass | unchanged |

Without the Apple variables, deletion still works; the Apple tokens are just not revoked
(logged as `Apple token revocation failed (not_configured)`).

## Database

Apply `supabase/migrations/20261029120000_ios_app_1_0.sql` in the Supabase SQL Editor before the
first deploy-preview test. It only adds objects (`ai_consents` and six functions); the website
does not use them. Verify query at the bottom of the file: 7 rows.

## How the server recognises the app

`netlify/lib/cors.mjs`: a request is from the app when it carries `X-CyberNet-Platform: ios` or
comes from the origin `capacitor://localhost`. Only that origin gets CORS headers. Website
requests are unchanged.

| Function | In the app |
|---|---|
| `account-status` | `profile.plan: "app"`, no billing fields, `isAdmin: false`, App-tier `usage`, `recoveryUsage`, `aiConsent {granted, known, version}`, history with `?includeHistory=1` for every account, `profile.isTeamMember` for the team notice |
| `analyze` | 428 `AI_CONSENT_REQUIRED` without consent; `consume_analysis_app`; mini model; history saved for every account; `mode=investigation` 403; team members' results still go to the owner's log |
| `recovery-mode`, `recovery-update` | Consent first (428), then `consume_recovery_case_app` / `consume_recovery_update_app`; plan-free limit messages |
| `ai-consent` (new) | `GET` state, `POST {version}` grant (409 if the version is not the current one; 429 `rate_limited` after 30 grants an hour per account), `DELETE` withdraw (never rate-limited). Current version: `2026-11-ios-1` (`netlify/lib/ai-consent.mjs`) |
| `privacy-data` | `delete-account` accepts `appleAuthorizationCode`; reply adds `cancelledSubscriptions` and `appleTokensRevoked` (`false` with reason `different_apple_id` in the log when the device's Apple ID is not the account's: the code's own new grant is still revoked) |
| `feedback` | Result reports: `{kind, resultId, comment?, platform: "ios", appVersion}`; `kind` is one of `quick_scan`, `qr`, `share`, `analysis_ai`, `recovery` |
| `client-error`, `legal-acceptance`, `recovery-case`, `team-activity` | CORS only (`team-activity` does not log on-device Quick Scans from the app) |
| `create-checkout-session`, `customer-portal`, `byok-analyze`, `validate-openai-key`, `screenshot-preview`, `quickscan-usage`, `feedback-admin`, `business-*` | 403 `NOT_AVAILABLE_IN_APP` |

Account deletion is immediate on the website too (owner decision, 29 Oct 2026): open Stripe
subscriptions, including owned Business teams, are cancelled at once with no refund, then the
account is deleted. If Stripe cannot cancel, nothing is deleted (`SUBSCRIPTION_CANCEL_FAILED`). A stored
Stripe customer that Stripe no longer knows (`resource_missing`: deleted, or a test-mode id) is
skipped, because nothing can bill it. If only the check for stray subscriptions fails and no plan is
known to be open, the reply is `BILLING_CHECK_FAILED`, which does not mention a paid plan.

Tests: `node tests/run-ios-server.mjs`, `node tests/run-ios-migration.mjs` (PGlite) and
`node tests/run-privacy.mjs`.
