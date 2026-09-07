const fs = require("fs");
const path = require("path");

const USE_LIVE_FETCH = true;
const GROUP_ID = process.env.ROBLOX_GROUP_ID || "35995419";
const GOAL = 24800;
const CUTOFF_DATE = "2026-03-29T13:46:20.411Z";
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
        created: row.created,
      });
    }
    cursor = json.nextPageCursor || "";
  } while (cursor);

  return transactions;
}

function filterByCutoff(transactions) {
  if (!CUTOFF_DATE) return transactions;
  const cutoff = new Date(CUTOFF_DATE).getTime();
  return transactions.filter(t => !t.created || new Date(t.created).getTime() > cutoff);
}

function aggregate(transactions) {
  const totals = new Map();
  let totalRaised = 0;

  for (const t of transactions) {
    totalRaised += t.amount;
    const key = t.userId || t.buyer;
    const existing = totals.get(key) || { name: t.buyer, userId: t.userId || null, amount: 0 };
    existing.amount += t.amount;
    totals.set(key, existing);
  }

  const topDonators = Array.from(totals.values()).sort((a, b) => b.amount - a.amount);
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

async function fetchUserInfo(userIds) {
  const ids = [...new Set(userIds.filter(Boolean))];
  const infoByUserId = {};
  if (!ids.length) return infoByUserId;

  const CHUNK_SIZE = 100;
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);

    try {
      const res = await fetch("https://users.roblox.com/v1/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: chunk, excludeBannedUsers: false }),
      });
      if (!res.ok) continue;
      const json = await res.json();
      for (const item of json.data) {
        infoByUserId[item.id] = { username: item.name, displayName: item.displayName };
      }
    } catch (err) {
      console.warn("User info fetch chunk failed, continuing without it:", err.message);
    }
  }

  return infoByUserId;
}

async function fetchAccountRobuxBalance() {
  const cookie = process.env.ROBLOX_COOKIE;
  if (!cookie) return { available: 0, pending: 0 };

  try {
    const authRes = await fetch("https://users.roblox.com/v1/users/authenticated", {
      headers: { Cookie: `.ROBLOSECURITY=${cookie}` },
    });
    if (!authRes.ok) {
      console.warn("Could not identify authenticated account, skipping balance:", authRes.status);
      return { available: 0, pending: 0 };
    }
    const { id: userId } = await authRes.json();

    const currencyRes = await fetch(`https://economy.roblox.com/v1/users/${userId}/currency`, {
      headers: { Cookie: `.ROBLOSECURITY=${cookie}` },
    });
    const available = currencyRes.ok ? (await currencyRes.json()).robux || 0 : 0;
    if (!currencyRes.ok) console.warn("Could not fetch spendable balance, skipping:", currencyRes.status);

    const totalsUrl =
      `https://apis.roblox.com/transaction-records/v1/users/${userId}/transaction-totals` +
      `?usedTypes=573037616&timeFrame=Month&transactionType=summary`;
    const totalsRes = await fetch(totalsUrl, { headers: { Cookie: `.ROBLOSECURITY=${cookie}` } });
    const pending = totalsRes.ok ? (await totalsRes.json()).pendingRobuxTotal || 0 : 0;
    if (!totalsRes.ok) console.warn("Could not fetch pending balance, skipping:", totalsRes.status);

    return { available, pending };
  } catch (err) {
    console.warn("Account balance fetch failed, continuing without it:", err.message);
    return { available: 0, pending: 0 };
  }
}

async function main() {
  const rawTransactions = USE_LIVE_FETCH
    ? await fetchTransactionsFromRoblox()
    : loadManualTransactions();

  const transactions = filterByCutoff(rawTransactions);
  const { totalRaised: donationsTotal, topDonators } = aggregate(transactions);

  const { available: availableRobux, pending: pendingRobux } = USE_LIVE_FETCH
    ? await fetchAccountRobuxBalance()
    : { available: 0, pending: 0 };
  const accountBalance = availableRobux + pendingRobux;
  const totalRaised = donationsTotal + accountBalance;

  const userIds = topDonators.map(d => d.userId);
  const [avatarByUserId, userInfoByUserId] = await Promise.all([
    fetchAvatars(userIds),
    fetchUserInfo(userIds),
  ]);

  const enrichedDonators = topDonators.map(d => {
    const info = d.userId ? userInfoByUserId[d.userId] : null;
    const username = info ? info.username : d.name;
    const displayName = info ? info.displayName : d.name;
    return {
      name: username,
      displayName,
      amount: d.amount,
      userId: d.userId,
      avatarUrl: d.userId ? avatarByUserId[d.userId] || null : null,
    };
  });

  const data = {
    totalRaised,
    donationsTotal,
    accountBalance,
    availableRobux,
    pendingRobux,
    goal: GOAL,
    lastUpdated: new Date().toISOString(),
    topDonators: enrichedDonators,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(data, null, 2));
  console.log(`Wrote ${OUTPUT_PATH} — total raised: ${totalRaised} (donations: ${donationsTotal} + available: ${availableRobux} + pending: ${pendingRobux}) / ${GOAL}`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
