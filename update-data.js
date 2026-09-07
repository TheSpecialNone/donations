/**
 * Regenerates donations.json from Roblox sales data.
 *
 * There is no public, documented Roblox API that returns *who* bought a
 * gamepass — that only exists on your private, logged-in Creator Hub page
 * (the "Sales of Goods" table). So this script has two modes:
 *
 *   MODE 1 — MANUAL (safe, no credentials, always works)
 *   Copy rows out of the Sales of Goods page into raw-transactions.json
 *   yourself (see the sample format below), then run:
 *     node update-data.js
 *
 *   MODE 2 — SEMI-AUTOMATIC (requires your own session cookie)
 *   1. Open the Sales of Goods page (the URL you already have) while
 *      logged in, open DevTools → Network → XHR, reload, and find the
 *      request that returns the transaction rows as JSON. Copy its URL
 *      and note the response shape.
 *   2. Fill in fetchTransactionsFromRoblox() below with that URL, using
 *      the .ROBLOSECURITY cookie value from an environment variable
 *      (never hardcode it, never commit it).
 *   3. Set USE_LIVE_FETCH = true.
 *   4. Run this on a schedule (see .github/workflows/update-donations.yml)
 *      with the cookie stored as a GitHub Actions secret.
 *
 *   Handling your own session cookie in an automated script carries real
 *   account-security risk (anyone with that cookie value can act as you)
 *   and Roblox's terms don't clearly bless scripted access to account
 *   pages. Mode 1 has none of that risk — it just takes you a minute
 *   whenever you want to refresh the numbers.
 */

const fs = require("fs");
const path = require("path");

const USE_LIVE_FETCH = false; // flip to true once fetchTransactionsFromRoblox() is filled in
const GOAL = 24800;
const OUTPUT_PATH = path.join(__dirname, "donations.json");
const RAW_INPUT_PATH = path.join(__dirname, "raw-transactions.json");

// ---- MODE 1: manual ----
// raw-transactions.json format:
// [
//   { "buyer": "travis", "amount": 35 },
//   { "buyer": "alex",   "amount": 175 },
//   ...
// ]
// "amount" = the Community Amount column (what you actually receive per sale).
function loadManualTransactions() {
  if (!fs.existsSync(RAW_INPUT_PATH)) {
    console.error(`Missing ${RAW_INPUT_PATH}. Create it with rows copied from`);
    console.error("your Sales of Goods page, or set USE_LIVE_FETCH = true.");
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(RAW_INPUT_PATH, "utf8"));
}

// ---- MODE 2: semi-automatic (fill this in yourself) ----
async function fetchTransactionsFromRoblox() {
  const cookie = process.env.ROBLOX_COOKIE;
  if (!cookie) throw new Error("Set ROBLOX_COOKIE env var first.");

  // TODO: replace with the real endpoint you found in DevTools, e.g.:
  // const res = await fetch("https://apis.roblox.com/.../transactions?...", {
  //   headers: { Cookie: `.ROBLOSECURITY=${cookie}` }
  // });
  // const json = await res.json();
  // return json.data.map(row => ({ buyer: row.agent.name, amount: row.currency.amount }));

  throw new Error("fetchTransactionsFromRoblox() is not implemented yet — see comments above.");
}

function aggregate(transactions) {
  const totals = new Map();
  let totalRaised = 0;
  for (const t of transactions) {
    totalRaised += t.amount;
    totals.set(t.buyer, (totals.get(t.buyer) || 0) + t.amount);
  }
  const topDonators = Array.from(totals.entries())
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);
  return { totalRaised, topDonators };
}

async function main() {
  const transactions = USE_LIVE_FETCH
    ? await fetchTransactionsFromRoblox()
    : loadManualTransactions();

  const { totalRaised, topDonators } = aggregate(transactions);

  const data = {
    totalRaised,
    goal: GOAL,
    lastUpdated: new Date().toISOString(),
    topDonators,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(data, null, 2));
  console.log(`Wrote ${OUTPUT_PATH} — total raised: ${totalRaised} / ${GOAL}`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
