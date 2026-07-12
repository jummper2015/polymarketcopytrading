// Markets adapter — Polymarket Gamma API + CLOB API
// Fetches market metadata, pricing, order book data, and related markets

import { apiFetch, buildQuery, GAMMA_URL, CLOB_URL, parseOutcomePrices } from "./client";

// ─── Types ─────────────────────────────────────────────────────

export interface MarketData {
  id: string; // conditionId / market slug
  conditionId: string;
  question: string;
  description?: string;
  category?: string;
  tags?: string[];
  outcomes: string[];
  outcomePrices: number[];
  clobTokenIds: string[];
  yesPrice: number;
  noPrice: number;
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
  liquidity: number;
  volume: number;
  endDate: string | null;
  closed: boolean;
  resolved: boolean;
}

export interface MarketOutcome {
  marketId: string;
  conditionId: string;
  question: string;
  resolved: boolean;
  outcome: string | null;
  resolvedTime: number | null;
  winningOutcomeIndex: number | null;
}

export interface OrderBookSummary {
  tokenId: string;
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
  bidSize: number;
  askSize: number;
}

export interface PriceHistoryEntry {
  timestamp: number;
  price: number;
}

// ─── Market Data ───────────────────────────────────────────────

export async function fetchMarketData(
  marketId: string
): Promise<MarketData> {
  const url = `${GAMMA_URL}/markets/${marketId}`;
  const raw = await apiFetch<Record<string, unknown>>(url);

  return mapMarketData(raw);
}

/**
 * Fetches market data by CLOB token ID.
 * Polymarket CLOB operates on token IDs, not condition IDs directly.
 */
export async function fetchMarketByToken(
  tokenId: string
): Promise<MarketData> {
  // Get the market data from Gamma using the token
  const url = buildQuery(`${GAMMA_URL}/markets`, {
    clob_token_id: tokenId,
    limit: 1,
  });

  const markets = await apiFetch<Record<string, unknown>[]>(url);
  if (!markets || markets.length === 0) {
    throw new Error(`[hermes] No market found for token ID: ${tokenId}`);
  }

  return mapMarketData(markets[0]);
}

// ─── Market Prices (CLOB) ──────────────────────────────────────

export async function fetchOrderBook(
  tokenId: string
): Promise<OrderBookSummary> {
  const url = `${CLOB_URL}/book?token_id=${tokenId}`;
  const raw = await apiFetch<Record<string, unknown>>(url);

  const bids = (raw.bids as Array<{ price: string; size: string }>) ?? [];
  const asks = (raw.asks as Array<{ price: string; size: string }>) ?? [];

  const bestBid = bids.length > 0 ? Number(bids[0].price) : null;
  const bestAsk = asks.length > 0 ? Number(asks[0].price) : null;
  const spread =
    bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null;
  const bidSize = bids.reduce((sum, b) => sum + Number(b.size), 0);
  const askSize = asks.reduce((sum, a) => sum + Number(a.size), 0);

  return {
    tokenId,
    bestBid,
    bestAsk,
    spread,
    bidSize,
    askSize,
  };
}

export async function fetchCurrentPrice(tokenId: string): Promise<number> {
  const url = `${CLOB_URL}/price?token_id=${tokenId}&side=buy`;
  const raw = await apiFetch<{ price: string }>(url);
  return Number(raw.price);
}

export async function fetchPriceHistory(
  tokenId: string,
  options?: { interval?: string; limit?: number }
): Promise<PriceHistoryEntry[]> {
  const { interval = "1h", limit = 168 } = options ?? {};

  const url = buildQuery(`${CLOB_URL}/prices-history`, {
    token_id: tokenId,
    interval,
    limit,
  });

  const raw = await apiFetch<
    Array<{ t: number; p: number } | { timestamp: number; price: number }>
  >(url);

  return raw.map((entry) => ({
    timestamp: "t" in entry ? entry.t : entry.timestamp,
    price: "p" in entry ? entry.p : entry.price,
  }));
}

// ─── Market Resolution (Outcomes) ───────────────────────────────

export async function fetchMarketOutcome(
  marketId: string
): Promise<MarketOutcome> {
  const raw = await fetchMarketData(marketId);

  // Determine winning outcome if resolved
  let winningOutcomeIndex: number | null = null;
  if (raw.resolved && raw.outcomePrices.some((p) => p === 1)) {
    winningOutcomeIndex = raw.outcomePrices.indexOf(1);
  }

  return {
    marketId: raw.id,
    conditionId: raw.conditionId,
    question: raw.question,
    resolved: raw.resolved,
    outcome:
      winningOutcomeIndex !== null
        ? raw.outcomes[winningOutcomeIndex] ?? null
        : null,
    resolvedTime: raw.endDate ? new Date(raw.endDate).getTime() / 1000 : null,
    winningOutcomeIndex,
  };
}

// ─── Related Markets ───────────────────────────────────────────

export async function fetchMarketsByCondition(
  conditionId: string
): Promise<MarketData[]> {
  // Gamma API: filter markets by condition_id
  const url = buildQuery(`${GAMMA_URL}/markets`, {
    condition_id: conditionId,
    limit: 100,
  });

  const raw = await apiFetch<Record<string, unknown>[]>(url);
  return raw.map(mapMarketData);
}

/**
 * Fetches recently resolved/closed markets.
 */
export async function fetchResolvedMarkets(
  options?: { limit?: number; offset?: number }
): Promise<MarketData[]> {
  const { limit = 100, offset = 0 } = options ?? {};

  const url = buildQuery(`${GAMMA_URL}/markets`, {
    closed: "true",
    limit,
    offset,
    order: "end_date",
  });

  const raw = await apiFetch<Record<string, unknown>[]>(url);
  return raw.map(mapMarketData);
}

// ─── Market Discovery ──────────────────────────────────────────

export async function fetchActiveMarkets(
  options?: {
    category?: string;
    tag?: string;
    limit?: number;
    offset?: number;
  }
): Promise<MarketData[]> {
  const { category, tag, limit = 100, offset = 0 } = options ?? {};

  const url = buildQuery(`${GAMMA_URL}/markets`, {
    closed: "false",
    limit,
    offset,
    ...(tag && { tag }),
    ...(category && { category }),
  });

  const raw = await apiFetch<Record<string, unknown>[]>(url);
  return raw.map(mapMarketData);
}

// ─── Helpers ───────────────────────────────────────────────────

function mapMarketData(raw: Record<string, unknown>): MarketData {
  const outcomes = (raw.outcomes as string[]) ?? ["Yes", "No"];
  const outcomePrices = parseOutcomePrices(
    raw.outcomePrices ?? raw.outcome_prices,
    outcomes
  );
  const clobTokenIds = (raw.clobTokenIds as string[]) ??
    (raw.clob_token_ids as string[]) ?? [];

  const yesPrice = outcomePrices[0] ?? 0;
  const noPrice = outcomePrices[1] ?? 0;
  const liquidity = Number(raw.liquidity ?? raw.liquidityNum ?? 0);
  const volume = Number(raw.volume ?? raw.volumeNum ?? 0);

  return {
    id: String(raw.id ?? raw.slug ?? ""),
    conditionId: String(raw.conditionId ?? raw.condition_id ?? raw.id ?? ""),
    question: String(raw.question ?? raw.title ?? ""),
    description: raw.description ? String(raw.description) : undefined,
    category: raw.category ? String(raw.category) : undefined,
    tags: raw.tags ? (raw.tags as string[]) : undefined,
    outcomes,
    outcomePrices,
    clobTokenIds,
    yesPrice,
    noPrice,
    bestBid: null, // CLOB call needed for this
    bestAsk: null,
    spread: null,
    liquidity,
    volume,
    endDate: raw.endDate ?? raw.end_date
      ? String(raw.endDate ?? raw.end_date)
      : null,
    closed: Boolean(raw.closed ?? false),
    resolved: Boolean(raw.resolved ?? raw.closed ?? false),
  };
}

