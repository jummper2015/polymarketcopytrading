// Trades adapter — Polymarket Data API
// Fetches trade data for wallets: recent trades, full trade history, and aggregate stats

import { apiFetch, buildQuery, DATA_URL, mapSide } from "./client";

// ─── Types ─────────────────────────────────────────────────────

export interface TradeData {
  id?: string;
  txHash?: string;
  marketId: string;
  conditionId?: string;
  marketQuestion?: string;
  marketCategory?: string;
  outcome?: string;
  outcomeIndex?: number;
  side: "yes" | "no";
  price: number;
  size: number;
  value: number;
  timestamp: number;
  type: "buy" | "sell";
  fee?: number;
}

export interface TradeAggregateStats {
  walletAddress: string;
  periodDays: number;
  totalTrades: number;
  totalVolume: number;
  averageTradeSize: number;
  averagePrice: number;
  buyRatio: number; // 0–1, what fraction are buys
  uniqueMarkets: number;
  categories: Record<string, number>; // category → trade count
}

// ─── Recent Trades ─────────────────────────────────────────────

export async function fetchRecentTrades(
  walletAddress: string,
  options?: { limit?: number }
): Promise<TradeData[]> {
  const { limit = 100 } = options ?? {};

  // Data API /trades endpoint filtered by user
  const url = buildQuery(`${DATA_URL}/trades`, {
    user: walletAddress,
    limit,
  });

  const raw = await apiFetch<Record<string, unknown>[]>(url);
  return raw.map(mapTradeData);
}

// ─── Trade History ─────────────────────────────────────────────

export async function fetchTradeHistory(
  walletAddress: string,
  days: number = 30,
  options?: { limit?: number }
): Promise<TradeData[]> {
  const { limit = 500 } = options ?? {};

  // Fetch from both /trades and /activity endpoints to get comprehensive history
  const [tradesResult, activityResult] = await Promise.allSettled([
    apiFetch<Record<string, unknown>[]>(
      buildQuery(`${DATA_URL}/trades`, {
        user: walletAddress,
        limit,
      })
    ),
    apiFetch<Record<string, unknown>[]>(
      buildQuery(`${DATA_URL}/activity`, {
        user: walletAddress,
        limit,
        type: "trade",
      })
    ),
  ]);

  // Merge results from both endpoints
  const allTrades: TradeData[] = [];

  if (tradesResult.status === "fulfilled") {
    allTrades.push(...tradesResult.value.map(mapTradeData));
  }

  if (activityResult.status === "fulfilled") {
    const activityTrades = activityResult.value
      .filter(
        (item) =>
          String(item.type ?? "").toLowerCase() === "trade"
      )
      .map((item) => ({
        ...mapTradeData(item),
        id: item.transactionHash
          ? String(item.transactionHash)
          : undefined,
      }));
    allTrades.push(...activityTrades);
  }

  // Deduplicate by txHash/id
  const seen = new Set<string>();
  const deduped: TradeData[] = [];
  for (const trade of allTrades) {
    const key = trade.id ?? trade.txHash ?? `${trade.marketId}-${trade.timestamp}-${trade.price}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(trade);
    }
  }

  // Filter by time window
  const cutoff = Date.now() / 1000 - days * 86400;
  const filtered = deduped
    .filter((t) => t.timestamp >= cutoff)
    .sort((a, b) => b.timestamp - a.timestamp);

  return filtered.slice(0, limit);
}

// ─── Aggregate Stats ───────────────────────────────────────────

export async function fetchTradeAggregateStats(
  walletAddress: string,
  days: number = 30
): Promise<TradeAggregateStats> {
  const trades = await fetchTradeHistory(walletAddress, days);

  const totalTrades = trades.length;
  const totalVolume = trades.reduce((sum, t) => sum + t.value, 0);
  const averageTradeSize = totalTrades > 0 ? totalVolume / totalTrades : 0;
  const averagePrice = totalTrades > 0
    ? trades.reduce((sum, t) => sum + t.price, 0) / totalTrades
    : 0;
  const buyCount = trades.filter((t) => t.type === "buy").length;
  const buyRatio = totalTrades > 0 ? buyCount / totalTrades : 0;

  const uniqueMarkets = new Set(
    trades.map((t) => t.conditionId ?? t.marketId)
  ).size;

  // Category breakdown
  const categories: Record<string, number> = {};
  for (const trade of trades) {
    const cat = trade.marketCategory ?? "unknown";
    categories[cat] = (categories[cat] ?? 0) + 1;
  }

  return {
    walletAddress,
    periodDays: days,
    totalTrades,
    totalVolume,
    averageTradeSize,
    averagePrice,
    buyRatio,
    uniqueMarkets,
    categories,
  };
}

// ─── Helpers ───────────────────────────────────────────────────

function mapTradeData(raw: Record<string, unknown>): TradeData {
  const price = Number(raw.price ?? 0);
  const size = Number(raw.size ?? 0);

  return {
    id: raw.id ?? raw.transactionHash
      ? String(raw.id ?? raw.transactionHash)
      : undefined,
    txHash: raw.transactionHash
      ? String(raw.transactionHash)
      : undefined,
    marketId: String(
      raw.conditionId ?? raw.condition_id ?? raw.market ?? ""
    ),
    conditionId:
      raw.conditionId ?? raw.condition_id
        ? String(raw.conditionId ?? raw.condition_id)
        : undefined,
    marketQuestion:
      raw.question ?? raw.title
        ? String(raw.question ?? raw.title)
        : undefined,
    marketCategory: raw.category
      ? String(raw.category)
      : undefined,
    outcome: raw.outcome ? String(raw.outcome) : undefined,
    outcomeIndex: raw.outcomeIndex !== undefined
      ? Number(raw.outcomeIndex)
      : undefined,
    side: mapSide(
      String(raw.side ?? raw.outcomeIndex ?? raw.outcome ?? "yes")
    ),
    price,
    size,
    value: price * size,
    timestamp: Number(raw.timestamp ?? raw.blockTimestamp ?? raw.createdAt ?? 0),
    type: mapTradeType(String(raw.type ?? raw.side ?? "buy")),
    fee: raw.fee ? Number(raw.fee) : undefined,
  };
}


function mapTradeType(raw: string): "buy" | "sell" {
  const t = raw.toLowerCase();
  if (t === "sell" || t === "short" || t === "redeem") return "sell";
  return "buy";
}
