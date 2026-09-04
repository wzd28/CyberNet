#!/usr/bin/env node
/**
 * Inspects - and optionally creates - the Stripe Prices that CyberNet checkout
 * looks for. The app resolves prices by `lookup_key`, never by Price ID.
 *
 * Checkout only ever sees ACTIVE prices, so an archived price still holding a
 * lookup key produces "price was not found" while the price sits plainly
 * visible in the dashboard. Creating a duplicate would be the wrong fix -
 * existing subscribers stay attached to the original - so this script reports
 * archived prices and refuses to shadow them.
 *
 * Look, don't touch (safe against live, creates nothing):
 *   STRIPE_SECRET_KEY=sk_... node scripts/create-stripe-prices.mjs --dry-run
 *
 * Create what is genuinely missing:
 *   STRIPE_SECRET_KEY=sk_test_... node scripts/create-stripe-prices.mjs
 *   CONFIRM_LIVE=yes STRIPE_SECRET_KEY=sk_live_... node scripts/create-stripe-prices.mjs
 */
import Stripe from "stripe";

const KEY = (process.env.STRIPE_SECRET_KEY || "").trim();
if (!KEY) {
  console.error("STRIPE_SECRET_KEY is not set.\n");
  console.error("  STRIPE_SECRET_KEY=sk_... node scripts/create-stripe-prices.mjs --dry-run");
  process.exit(1);
}

const DRY_RUN = process.argv.includes("--dry-run");
const isLive = KEY.startsWith("sk_live_");
const mode = isLive ? "LIVE  (real money)" : "TEST / SANDBOX";

if (isLive && !DRY_RUN && process.env.CONFIRM_LIVE !== "yes") {
  console.error(`\nRefusing to run: this is a LIVE key and real prices would be created.\n`);
  console.error(`Inspect first, which changes nothing:`);
  console.error(`  STRIPE_SECRET_KEY=sk_live_... node scripts/create-stripe-prices.mjs --dry-run\n`);
  console.error(`If you really do want to create live prices:`);
  console.error(`  CONFIRM_LIVE=yes STRIPE_SECRET_KEY=sk_live_... node scripts/create-stripe-prices.mjs\n`);
  process.exit(1);
}

// Amounts match terms.html section 11 and the pricing card's data attributes.
const CURRENCY = "usd";
const CATALOG = [
  { product: "CyberNet AI Pro",
    description: "Advanced AI analysis, saved history and downloadable reports for one person.",
    prices: [
      { lookup_key: "cybernet_ai_pro_monthly", unit_amount: 999,  interval: "month" },
      { lookup_key: "cybernet_ai_pro_yearly",  unit_amount: 9590, interval: "year"  } ] },
  { product: "CyberNet AI Business - 5 seats",
    description: "Five named seats sharing 50 analyses and 20 Recovery cases per day.",
    prices: [
      { lookup_key: "cybernet_ai_business_monthly", unit_amount: 4000,  interval: "month" },
      { lookup_key: "cybernet_ai_business_yearly",  unit_amount: 38400, interval: "year"  } ] },
  { product: "CyberNet AI Business - 10 seats",
    description: "Ten named seats sharing 90 analyses and 36 Recovery cases per day.",
    prices: [
      { lookup_key: "cybernet_ai_business_10seat_monthly", unit_amount: 8000,  interval: "month" },
      { lookup_key: "cybernet_ai_business_10seat_yearly",  unit_amount: 76800, interval: "year"  } ] },
  { product: "CyberNet AI Business - 20 seats",
    description: "Twenty named seats sharing 160 analyses and 64 Recovery cases per day.",
    prices: [
      { lookup_key: "cybernet_ai_business_20seat_monthly", unit_amount: 16000,  interval: "month" },
      { lookup_key: "cybernet_ai_business_20seat_yearly",  unit_amount: 153600, interval: "year"  } ] },
];

const money = (c) => `$${(c / 100).toFixed(2)}`;
const stripe = new Stripe(KEY);

console.log(`\nStripe environment : ${mode}`);
console.log(`Action             : ${DRY_RUN ? "inspect only, nothing will be changed" : "create anything missing"}\n`);

let ok = 0, created = 0;
const archivedFound = [], missing = [];

for (const entry of CATALOG) {
  let productId = null;

  for (const price of entry.prices) {
    const active = await stripe.prices.list({ lookup_keys: [price.lookup_key], active: true, limit: 1 });
    if (active.data.length) {
      const f = active.data[0];
      console.log(`  ACTIVE    ${price.lookup_key}  ${money(f.unit_amount)}  ${f.id}`);
      ok++;
      continue;
    }

    const archived = await stripe.prices.list({ lookup_keys: [price.lookup_key], active: false, limit: 1 });
    if (archived.data.length) {
      const f = archived.data[0];
      console.log(`  ARCHIVED  ${price.lookup_key}  ${money(f.unit_amount)}  ${f.id}   <- reactivate this`);
      archivedFound.push({ key: price.lookup_key, id: f.id });
      continue;
    }

    if (DRY_RUN) {
      console.log(`  MISSING   ${price.lookup_key}  (would create ${money(price.unit_amount)}/${price.interval})`);
      missing.push(price.lookup_key);
      continue;
    }

    // Create the product only once a price actually needs it, so a re-run
    // against a populated account leaves no orphaned products behind.
    if (!productId) {
      const product = await stripe.products.create({ name: entry.product, description: entry.description });
      productId = product.id;
      console.log(`\n  product   ${entry.product}  ${productId}`);
    }

    const made = await stripe.prices.create({
      product: productId,
      lookup_key: price.lookup_key,
      unit_amount: price.unit_amount,
      currency: CURRENCY,
      recurring: { interval: price.interval },
      tax_behavior: "inclusive", // advertised figure is what the customer pays
    });
    console.log(`  CREATED   ${price.lookup_key}  ${money(price.unit_amount)}/${price.interval}  ${made.id}`);
    created++;
  }
}

console.log(`\n${ok} active, ${archivedFound.length} archived, ${missing.length} missing, ${created} created.`);

if (archivedFound.length) {
  console.log(`\nArchived prices hold these lookup keys, so checkout cannot see them.`);
  console.log(`This is very likely why checkout broke. Reactivate them in the dashboard`);
  console.log(`rather than creating new ones - existing subscribers are attached to these:`);
  for (const a of archivedFound) console.log(`  ${a.key}  ${a.id}`);
}

if (DRY_RUN && missing.length) {
  console.log(`\nTo create the ${missing.length} genuinely missing price(s), re-run without --dry-run.`);
}
console.log();
