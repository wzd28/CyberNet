#!/usr/bin/env node
/**
 * Creates the Stripe Products and Prices that CyberNet's checkout looks for.
 *
 * The app resolves prices by `lookup_key`, never by Price ID, so the lookup key
 * is the part that has to be exact. Setting it by hand in the dashboard is easy
 * to get wrong - it lives under "Advanced options" when adding a price.
 *
 * Safe to re-run: an existing price with the same lookup key is left alone.
 * Run once per Stripe environment (sandbox/test, then live at launch).
 *
 *   STRIPE_SECRET_KEY=sk_test_... node scripts/create-stripe-prices.mjs
 *
 * Against a live key it refuses to run unless you also pass CONFIRM_LIVE=yes,
 * so you can't create live prices by accident.
 */
import Stripe from "stripe";

const KEY = (process.env.STRIPE_SECRET_KEY || "").trim();
if (!KEY) {
  console.error("STRIPE_SECRET_KEY is not set.\n");
  console.error("  STRIPE_SECRET_KEY=sk_test_... node scripts/create-stripe-prices.mjs");
  process.exit(1);
}

const isLive = KEY.startsWith("sk_live_");
const mode = isLive ? "LIVE" : "TEST / SANDBOX";

if (isLive && process.env.CONFIRM_LIVE !== "yes") {
  console.error(`Refusing to run: this is a LIVE key and real prices would be created.`);
  console.error(`If that is what you want:  CONFIRM_LIVE=yes STRIPE_SECRET_KEY=sk_live_... node scripts/create-stripe-prices.mjs`);
  process.exit(1);
}

// Amounts in the smallest currency unit. These match the figures published in
// terms.html section 11 and the pricing card's data-monthly/data-yearly.
const CURRENCY = "usd";
const CATALOG = [
  {
    product: "CyberNet AI Pro",
    description: "Advanced AI analysis, saved history and downloadable reports for one person.",
    prices: [
      { lookup_key: "cybernet_ai_pro_monthly", unit_amount: 999,   interval: "month" },
      { lookup_key: "cybernet_ai_pro_yearly",  unit_amount: 9590,  interval: "year"  },
    ],
  },
  {
    product: "CyberNet AI Business - 5 seats",
    description: "Five named seats sharing 50 analyses and 20 Recovery cases per day.",
    prices: [
      { lookup_key: "cybernet_ai_business_monthly", unit_amount: 4000,  interval: "month" },
      { lookup_key: "cybernet_ai_business_yearly",  unit_amount: 38400, interval: "year"  },
    ],
  },
  {
    product: "CyberNet AI Business - 10 seats",
    description: "Ten named seats sharing 90 analyses and 36 Recovery cases per day.",
    prices: [
      { lookup_key: "cybernet_ai_business_10seat_monthly", unit_amount: 8000,  interval: "month" },
      { lookup_key: "cybernet_ai_business_10seat_yearly",  unit_amount: 76800, interval: "year"  },
    ],
  },
  {
    product: "CyberNet AI Business - 20 seats",
    description: "Twenty named seats sharing 160 analyses and 64 Recovery cases per day.",
    prices: [
      { lookup_key: "cybernet_ai_business_20seat_monthly", unit_amount: 16000,  interval: "month" },
      { lookup_key: "cybernet_ai_business_20seat_yearly",  unit_amount: 153600, interval: "year"  },
    ],
  },
];

const money = (cents) => `$${(cents / 100).toFixed(2)}`;
const stripe = new Stripe(KEY);

console.log(`\nStripe environment: ${mode}\n`);

let created = 0, skipped = 0;

for (const entry of CATALOG) {
  let productId = null;

  for (const price of entry.prices) {
    const existing = await stripe.prices.list({
      lookup_keys: [price.lookup_key],
      active: true,
      limit: 1,
    });

    if (existing.data.length) {
      const found = existing.data[0];
      console.log(`  skip    ${price.lookup_key}  (exists: ${found.id}, ${money(found.unit_amount)})`);
      skipped++;
      continue;
    }

    // Only create the product once we know a price actually needs it, so a
    // fully-populated re-run doesn't leave orphaned products behind.
    if (!productId) {
      const product = await stripe.products.create({
        name: entry.product,
        description: entry.description,
      });
      productId = product.id;
      console.log(`\n  product ${entry.product}  (${productId})`);
    }

    const made = await stripe.prices.create({
      product: productId,
      lookup_key: price.lookup_key,
      unit_amount: price.unit_amount,
      currency: CURRENCY,
      recurring: { interval: price.interval },
      // Advertised figures are what the customer pays, so tax is inclusive.
      tax_behavior: "inclusive",
    });
    console.log(`  create  ${price.lookup_key}  ${money(price.unit_amount)}/${price.interval}  ${made.id}`);
    created++;
  }
}

console.log(`\n${created} price(s) created, ${skipped} already present.`);
if (created) {
  console.log(`Checkout resolves by lookup key, so no redeploy is needed.`);
}
console.log();
