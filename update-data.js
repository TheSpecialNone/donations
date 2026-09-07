const fs = require("fs");
const path = require("path");

const USE_LIVE_FETCH = true;
const GROUP_ID = process.env.ROBLOX_GROUP_ID || "35995419";
const GOAL = 24800;
const OUTPUT_PATH = path.join(__dirname, "donations.json");
const RAW_INPUT_PATH = path.join(__dirname, "raw-transactions.json");

function loadManualTransactions() {
  if (!fs.existsSync(RAW_INPUT_PATH)) {
    console.error(`Missing ${RAW_INPUT_PATH}. Create it with rows copied from`);
    console.error("your Sales of Goods page, or set USE_LIVE_FETCH = true.");
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(RAW_INPUT_PATH, "utf8"));
}

async function fetchTransactionsFromRoblox() {
  const cookie = process.env.ROBLOX_COOKIE;
  if (!cookie) throw new Error("Set ROBLOX_COOKIE env var first.");

  const transactions = [];
  let cursor = "";

  do {
    const url =
      `https://apis.roblox.com/transaction-records/v1/groups/${GROUP_ID}/transactions` +
      `?cursor=${encodeURIComponent(cursor)}&limit=100&transactionType=Sale`;

    const res = await fetch(url, {
      headers: { Cookie: `.ROBLOSECURITY=${cookie}` },
    });
    if (!res.ok) {
      throw new Error(`Roblox request failed: ${res.status} ${res.statusText}`);
    }

    const json = await res.json();
    for (const row of json.data) {
      transactions.push({
        buyer: row.agent.name,
        amount: row.currency.amount,
        userId: row.agent.id,
      });
    }
    cursor = json.nextPageCursor || "";
  } while (cursor);

  return transactions;
}

function aggregate(transactions) {
  const totals = new Map();
  let totalRaised = 0;

  for (const t of transactions) {
    totalRaised += t.amount;
    const existing = totals.get(t.buyer) || { amount: 0, userId: t.userId || null };
    existing.amount += t.amount;
    if (!existing.userId && t.userId) existing.userId = t.userId;
    totals.set(t.buyer, existing);
  }

  const topDonators = Array.from(totals.entries())
    .map(([name, v]) => ({ name, amount: v.amount, userId: v.userId }))
    .sort((a, b) => b.amount - a.amount);

  return { totalRaised, topDonators };
}

async function fetchAvatars(userIds) {
  const ids = [...new Set(userIds.filter(Boolean))];
  const avatarByUserId = {};
  if (!ids.length) return avatarByUserId;

  const CHUNK_SIZE = 100;
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    const url =
      `https://thumbnails.roblox.com/v1/users/avatar-headshot` +
      `?userIds=${chunk.join(",")}&size=150x150&format=Png&isCircular=true`;

    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const json = await res.json();
      for (const item of json.data) {
        if (item.state === "Completed") avatarByUserId[item.targetId] = item.imageUrl;
      }
    } catch (err) {
      console.warn("Avatar fetch chunk failed, continuing without it:", err.message);
    }
  }

  return avatarByUserId;
}

async function main() {
  const transactions = USE_LIVE_FETCH
    ? await fetchTransactionsFromRoblox()
    : loadManualTransactions();

  const { totalRaised, topDonators } = aggregate(transactions);
  const avatarByUserId = await fetchAvatars(topDonators.map(d => d.userId));

  const enrichedDonators = topDonators.map(d => ({
    name: d.name,
    amount: d.amount,
    userId: d.userId,
    avatarUrl: d.userId ? avatarByUserId[d.userId] || null : null,
  }));

  const data = {
    totalRaised,
    goal: GOAL,
    lastUpdated: new Date().toISOString(),
    topDonators: enrichedDonators,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(data, null, 2));
  console.log(`Wrote ${OUTPUT_PATH} — total raised: ${totalRaised} / ${GOAL}`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
