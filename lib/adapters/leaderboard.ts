// Leaderboard adapter — Polymarket Data API
// Fetches top wallets from the public leaderboard and their activity

import { apiFetch, buildQuery, DATA_URL, mapSide, sleep } from "./client";

// ─── Types ─────────────────────────────────────────────────────

export interface LeaderboardEntry {
  address: string;
  rank: number;
  label?: string;
  pnl?: number;
  volume?: number;
  roi?: number;
  tradeCount?: number;
  winRate?: number;
}

export interface WalletActivityItem {
  id?: string;
  timestamp: number;
  type: "trade" | "split" | "merge" | "redeem" | "reward" | "transfer";
  marketId?: string;
  conditionId?: string;
  marketQuestion?: string;
  outcome?: string;
  side?: "yes" | "no";
  price?: number;
  size?: number;
  txHash?: string;
}

export interface WalletPosition {
  marketId: string;
  conditionId?: string;
  question?: string;
  outcome: string;
  side: "yes" | "no";
  avgPrice: number;
  currentPrice?: number;
  size: number;
  value: number;
  realizedPnl?: number;
}

export interface WalletActivitySummary {
  address: string;
  recentTrades: WalletActivityItem[];
  positions: WalletPosition[];
  tradeCount: number;
  resolvedTradeCount: number;
  winRate: number;
  totalVolume: number;
  averageTradeSize: number;
  roiEstimate: number | null;
}

// Pagination max from Data API
const LEADERBOARD_PAGE_SIZE = 50;

// ─── Leaderboard ───────────────────────────────────────────────

export async function fetchLeaderboard(
  limit: number = 500,
  options?: {
    timePeriod?: "DAY" | "WEEK" | "MONTH" | "ALL";
    category?: "OVERALL" | "POLITICS" | "SPORTS" | "CRYPTO" | "CULTURE" | "SCIENCE";
  }
): Promise<LeaderboardEntry[]> {
  const { timePeriod = "ALL", category = "OVERALL" } = options ?? {};
  const pages = Math.ceil(limit / LEADERBOARD_PAGE_SIZE);
  const entries: LeaderboardEntry[] = [];

  for (let page = 0; page < pages; page++) {
    const offset = page * LEADERBOARD_PAGE_SIZE;
    const pageLimit = Math.min(LEADERBOARD_PAGE_SIZE, limit - offset);

    const url = buildQuery(`${DATA_URL}/v1/leaderboard`, {
      category,
      timePeriod,
      orderBy: "PNL",
      limit: pageLimit,
      offset,
    });

    const pageEntries = await apiFetch<Record<string, unknown>[]>(url);

    // Map API response to our type
    // Polymarket Data API returns proxyWallet for the address and userName for the label
    const mapped = pageEntries.map((entry: Record<string, unknown>) => ({
      address: String(entry.proxyWallet || entry.user || entry.address || ""),
      rank: Number(entry.rank ?? offset + 1),
      label: entry.userName ? String(entry.userName) : entry.name ? String(entry.name) : undefined,
      pnl: entry.pnl ? Number(entry.pnl) : undefined,
      volume: entry.vol ? Number(entry.vol) : entry.volume ? Number(entry.volume) : undefined,
      roi: entry.roi ? Number(entry.roi) : undefined,
      tradeCount: entry.tradeCount ? Number(entry.tradeCount) : undefined,
      winRate: entry.winRate ? Number(entry.winRate) : undefined,
    }));

    entries.push(...mapped);

    if (pageEntries.length < pageLimit) break; // No more entries

    // Delay between pages to avoid rate limiting
    if (page < pages - 1) {
      await sleep(200);
    }
  }

  return entries.slice(0, limit);
}

// ─── Wallet Activity ───────────────────────────────────────────

export async function fetchWalletActivity(
  address: string,
  options?: { limit?: number }
): Promise<WalletActivityItem[]> {
  const { limit = 200 } = options ?? {};

  const url = buildQuery(`${DATA_URL}/activity`, {
    user: address,
    limit,
  });

  const raw = await apiFetch<Record<string, unknown>[]>(url);

  return raw.map((item) => ({
    id: item.transactionHash ? String(item.transactionHash) : undefined,
    timestamp: Number(item.timestamp ?? item.blockTimestamp ?? 0),
    type: mapActivityType(String(item.type ?? "trade")),
    marketId: item.conditionId ?? item.market ? String(item.conditionId ?? item.market) : undefined,
    conditionId: item.conditionId ? String(item.conditionId) : undefined,
    marketQuestion: item.title ?? item.question ? String(item.title ?? item.question) : undefined,
    outcome: item.outcome ? String(item.outcome) : undefined,
    side: item.side ? mapSide(String(item.side)) : undefined,
    price: item.price ? Number(item.price) : undefined,
    size: item.size ? Number(item.size) : undefined,
    txHash: item.transactionHash ? String(item.transactionHash) : undefined,
  }));
}

// ─── Wallet Positions ──────────────────────────────────────────

export async function fetchWalletPositions(
  address: string
): Promise<WalletPosition[]> {
  const url = buildQuery(`${DATA_URL}/positions`, { user: address });

  const raw = await apiFetch<Record<string, unknown>[]>(url);

  return raw.map((item) => ({
    marketId: String(item.conditionId ?? item.market ?? ""),
    conditionId: item.conditionId ? String(item.conditionId) : undefined,
    question: item.title ?? item.question ? String(item.title ?? item.question) : undefined,
    outcome: String(item.outcome ?? ""),
    side: mapSide(String(item.outcomeIndex ?? item.side ?? "yes")),
    avgPrice: Number(item.avgPrice ?? item.price ?? 0),
    currentPrice: item.currentPrice ? Number(item.currentPrice) : undefined,
    size: Number(item.size ?? 0),
    value: Number(item.value ?? item.currentValue ?? 0),
    realizedPnl: item.realizedPnl ? Number(item.realizedPnl) : undefined,
  }));
}

// ─── Wallet Activity Summary ───────────────────────────────────

export async function fetchWalletActivitySummary(
  address: string,
  days: number = 30
): Promise<WalletActivitySummary> {
  // Fetch trades and positions in parallel
  const [recentTrades, positions] = await Promise.all([
    fetchWalletActivity(address, { limit: 200 }),
    fetchWalletPositions(address),
  ]);

  // Filter to requested lookback period
  const cutoff = Date.now() / 1000 - days * 86400;
  const filtered = recentTrades.filter((t) => t.timestamp >= cutoff);

  // Calculate metrics
  const trades = filtered.filter((t) => t.type === "trade");
  const tradeCount = trades.length;
  const totalVolume = trades.reduce((sum, t) => sum + (t.size ?? 0) * (t.price ?? 0), 0);
  const averageTradeSize = tradeCount > 0 ? totalVolume / tradeCount : 0;

  // Resolved count + win rate: estimate from positions with realized PnL
  const resolvedPositions = positions.filter((p) => p.realizedPnl !== undefined);
  const resolvedTradeCount = resolvedPositions.length;
  const winningPositions = resolvedPositions.filter((p) => (p.realizedPnl ?? 0) > 0);
  const winRate = resolvedTradeCount > 0 ? winningPositions.length / resolvedTradeCount : 0;

  // ROI estimate from positions
  let roiEstimate: number | null = null;
  if (resolvedPositions.length > 0) {
    const totalInvested = resolvedPositions.reduce(
      (sum, p) => sum + p.avgPrice * p.size,
      0
    );
    const totalPnl = resolvedPositions.reduce(
      (sum, p) => sum + (p.realizedPnl ?? 0),
      0
    );
    roiEstimate = totalInvested > 0 ? totalPnl / totalInvested : 0;
  }

  return {
    address,
    recentTrades: filtered,
    positions,
    tradeCount,
    resolvedTradeCount,
    winRate,
    totalVolume,
    averageTradeSize,
    roiEstimate,
  };
}

// ─── Helpers ───────────────────────────────────────────────────

function mapActivityType(raw: string): WalletActivityItem["type"] {
  const t = raw.toLowerCase();
  if (t.includes("split")) return "split";
  if (t.includes("merge")) return "merge";
  if (t.includes("redeem")) return "redeem";
  if (t.includes("reward")) return "reward";
  if (t.includes("transfer")) return "transfer";
  return "trade";
}


