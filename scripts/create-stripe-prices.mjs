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
 * Windows PowerShell:
 *   $env:STRIPE_SECRET_KEY = "sk_live_..."
 *   node scripts/create-stripe-prices.mjs --dry-run
 *
 * macOS / Linux / Git Bash:
 *   STRIPE_SECRET_KEY=sk_live_... node scripts/create-stripe-prices.mjs --dry-run
 *
 * Drop --dry-run to create what is missing. A live key additionally needs
 * CONFIRM_LIVE=yes, so live prices cannot be created by accident.
 */
import Stripe from "stripe";

// Strip quotes as well as whitespace: pasting a quoted value into PowerShell
// is a common way to end up with a key that looks right and is not.
const KEY = (process.env.STRIPE_SECRET_KEY || "").trim().replace(/^["']|["']$/g, "");

if (!KEY) {
  console.error("");
  console.error("STRIPE_SECRET_KEY is not set in this terminal.");
  console.error("");
  console.error("PowerShell:");
  console.error('  $env:STRIPE_SECRET_KEY = "sk_live_..."');
  console.error("  node scripts/create-stripe-prices.mjs --dry-run");
  console.error("");
  process.exit(1);
}

// Catch the wrong-kind-of-key mistakes before making a doomed API call.
if (!/^(sk|rk)_(test|live)_/.test(KEY)) {
  console.error("");
  console.error("That does not look like a Stripe secret key.");
  console.error('It starts with "' + KEY.slice(0, 8) + '" and is ' + KEY.length + " characters long.");
  console.error("");
  console.error("A usable key starts with sk_live_, sk_test_, rk_live_ or rk_test_.");
  console.error("  pk_...    is a publishable key - it cannot be used here.");
  console.error("  whsec_... is the webhook signing secret - a different thing.");
  console.error("");
  console.error("Check the whole key was copied and no trailing space came with it.");
  console.error("");
  process.exit(1);
}

const DRY_RUN = process.argv.includes("--dry-run");
// A restricted key (rk_live_) is just as live as a secret key (sk_live_).
const isLive = /_live_/.test(KEY);
const mode = isLive ? "LIVE  (real money)" : "TEST / SANDBOX";

if (isLive && !DRY_RUN && process.env.CONFIRM_LIVE !== "yes") {
  console.error("");
  console.error("Refusing to run: this is a LIVE key and real prices would be created.");
  console.error("");
  console.error("Inspect first - this changes nothing:");
  console.error("  node scripts/create-stripe-prices.mjs --dry-run");
  console.error("");
  console.error("To actually create live prices, set CONFIRM_LIVE first:");
  console.error('  $env:CONFIRM_LIVE = "yes"');
  console.error("  node scripts/create-stripe-prices.mjs");
  console.error("");
  process.exit(1);
}

// Amounts match terms.html section 11 and the pricing card's data attributes.
const CURRENCY = "usd";
const CATALOG = [
  {
    product: "CyberNet AI Pro",
    description: "Advanced AI analysis, saved history and downloadable reports for one person.",
    prices: [
      { lookup_key: "cybernet_ai_pro_monthly", unit_amount: 999, interval: "month" },
      { lookup_key: "cybernet_ai_pro_yearly", unit_amount: 9590, interval: "year" },
    ],
  },
  {
    product: "CyberNet AI Business - 5 seats",
    description: "Five named seats sharing 50 analyses and 20 Recovery cases per day.",
    prices: [
      { lookup_key: "cybernet_ai_business_monthly", unit_amount: 4000, interval: "month" },
      { lookup_key: "cybernet_ai_business_yearly", unit_amount: 38400, interval: "year" },
    ],
  },
  {
    product: "CyberNet AI Business - 10 seats",
    description: "Ten named seats sharing 90 analyses and 36 Recovery cases per day.",
    prices: [
      { lookup_key: "cybernet_ai_business_10seat_monthly", unit_amount: 8000, interval: "month" },
      { lookup_key: "cybernet_ai_business_10seat_yearly", unit_amount: 76800, interval: "year" },
    ],
  },
  {
    product: "CyberNet AI Business - 20 seats",
    description: "Twenty named seats sharing 160 analyses and 64 Recovery cases per day.",
    prices: [
      { lookup_key: "cybernet_ai_business_20seat_monthly", unit_amount: 16000, interval: "month" },
      { lookup_key: "cybernet_ai_business_20seat_yearly", unit_amount: 153600, interval: "year" },
    ],
  },
];

const money = (c) => "$" + (c / 100).toFixed(2);
const stripe = new Stripe(KEY);

// Without this, a Stripe rejection surfaces as an unhandled promise rejection
// and prints a stack trace, which reads as "the script is broken" when the real
// cause is almost always a mistyped key or a restricted key missing a scope.
function explain(error) {
  const type = error?.type || error?.raw?.type;
  const lines = [];
  if (type === "StripeAuthenticationError") {
    lines.push("Stripe rejected this key.");
    lines.push("");
    lines.push("  - Check the whole key was copied, with no trailing space.");
    lines.push("  - A live key only works on live data, a test key only on test data.");
    lines.push("  - If the key was rotated, the previous one stopped working immediately.");
  } else if (type === "StripePermissionError") {
    lines.push("This key is valid, but is not allowed to do this.");
    lines.push("");
    lines.push("  If it is a restricted key (rk_...), give it WRITE access to both");
    lines.push("  Products and Prices, or use the standard secret key instead.");
  } else if (type === "StripeConnectionError") {
    lines.push("Could not reach Stripe. Check the internet connection and try again.");
  } else {
    lines.push(error?.message || String(error));
  }
  return lines.join("\n");
}

console.log("");
console.log("Stripe environment : " + mode);
console.log("Action             : " + (DRY_RUN ? "inspect only, nothing will change" : "create anything missing"));
console.log("");

let ok = 0;
let created = 0;
const archivedFound = [];
const missing = [];

try {
  for (const entry of CATALOG) {
    let productId = null;

    for (const price of entry.prices) {
      const active = await stripe.prices.list({ lookup_keys: [price.lookup_key], active: true, limit: 1 });
      if (active.data.length) {
        const found = active.data[0];
        console.log("  ACTIVE    " + price.lookup_key + "  " + money(found.unit_amount) + "  " + found.id);
        ok++;
        continue;
      }

      const archived = await stripe.prices.list({ lookup_keys: [price.lookup_key], active: false, limit: 1 });
      if (archived.data.length) {
        const found = archived.data[0];
        console.log("  ARCHIVED  " + price.lookup_key + "  " + money(found.unit_amount) + "  " + found.id + "   <- reactivate this");
        archivedFound.push({ key: price.lookup_key, id: found.id });
        continue;
      }

      if (DRY_RUN) {
        console.log("  MISSING   " + price.lookup_key + "  (would create " + money(price.unit_amount) + "/" + price.interval + ")");
        missing.push(price.lookup_key);
        continue;
      }

      // Create the product only once a price actually needs it, so a re-run
      // against a populated account leaves no orphaned products behind.
      if (!productId) {
        const product = await stripe.products.create({ name: entry.product, description: entry.description });
        productId = product.id;
        console.log("");
        console.log("  product   " + entry.product + "  " + productId);
      }

      const made = await stripe.prices.create({
        product: productId,
        lookup_key: price.lookup_key,
        unit_amount: price.unit_amount,
        currency: CURRENCY,
        recurring: { interval: price.interval },
        tax_behavior: "inclusive", // the advertised figure is what the customer pays
      });
      console.log("  CREATED   " + price.lookup_key + "  " + money(price.unit_amount) + "/" + price.interval + "  " + made.id);
      created++;
    }
  }
} catch (error) {
  console.error("");
  console.error(explain(error));
  console.error("");
  process.exit(1);
}

console.log("");
console.log(ok + " active, " + archivedFound.length + " archived, " + missing.length + " missing, " + created + " created.");

if (archivedFound.length) {
  console.log("");
  console.log("Archived prices hold these lookup keys, so checkout cannot see them.");
  console.log("Reactivate them in the dashboard rather than creating new ones -");
  console.log("existing subscribers are attached to these:");
  for (const a of archivedFound) console.log("  " + a.key + "  " + a.id);
}

if (DRY_RUN && missing.length) {
  console.log("");
  console.log("To create the " + missing.length + " missing price(s), re-run without --dry-run.");
}
console.log("");
