# CyberNet AI

CyberNet AI is a cybersecurity platform that helps people check suspicious
messages, links, and screenshots for phishing and scams, get AI-powered
security analysis, and get guided help recovering from an incident.

**Live site:** https://cybernetai.app

## Core features

- **Quick Scan** — fast, rule-based and AI-assisted analysis of suspicious
  text, links, screenshots, and email headers.
- **Analysis AI** — a unified chat-style assistant that auto-detects whether
  you've pasted text, a link, or an image and runs the right analysis, using
  CyberNet's managed AI or your own OpenAI API key (BYOK).
- **Recovery Mode** — a guided, case-based incident-response system for
  account takeovers, phishing, scams, and related cybersecurity incidents.
  Generates a structured recovery plan, tracks progress, and adapts as you
  update it with what you've done.

## Architecture

- **Frontend:** static HTML/CSS/vanilla JS in `public/`, deployed as-is by
  Netlify (no build step for the frontend).
- **Backend:** Netlify Functions in `netlify/functions/` (TypeScript, `.mts`).
- **Database/Auth:** Supabase (Postgres + Auth), schema in `supabase/schema.sql`.
- **Payments:** Stripe (subscriptions).
- **AI:** OpenAI, called server-side for managed analysis or via BYOK.

## Local development

```bash
npm install
netlify dev
```

## Deploying

This repo deploys automatically via Netlify's GitHub integration on every
push to `main`. See `netlify.toml` for build/publish configuration.

## Database setup

Run `supabase/schema.sql` once in the Supabase Dashboard → SQL Editor. It's
idempotent (safe to re-run) and is the single authoritative migration file —
don't create separate one-off SQL files going forward; add new tables and
functions to this file instead.

## Before commercial launch

See `LEGAL-REVIEW-CHECKLIST.txt` for the current pre-launch checklist,
including the legal-entity placeholder that still needs to be filled in
before accepting real customer payments.
