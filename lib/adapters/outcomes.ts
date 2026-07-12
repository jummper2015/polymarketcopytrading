// Outcomes adapter — Polymarket Gamma API
// Fetches resolved market outcomes, resolution details, and market settlement data

import { apiFetch, buildQuery, GAMMA_URL, parseOutcomePrices } from "./client";
import {
  fetchMarketData,
  fetchMarketOutcome,
  type MarketData,
  type MarketOutcome,
} from "./markets";

// ─── Types ─────────────────────────────────────────────────────

export type { MarketOutcome };

export interface ResolvedMarketSummary {
  marketId: string;
  conditionId: string;
  question: string;
  category?: string;
  resolvedAt: number | null;
  winningOutcome: string | null;
  winningOutcomeIndex: number | null;
  totalVolume: number;
  liquidity: number;
}

export interface ResolutionBatch {
  markets: ResolvedMarketSummary[];
  total: number;
  since: number; // timestamp of earliest resolution looked back
}

// ─── Single Market Resolution ──────────────────────────────────

export async function fetchMarketResolution(
  marketId: string
): Promise<MarketOutcome> {
  return fetchMarketOutcome(marketId);
}

// ─── Batch Resolved Markets ────────────────────────────────────

/**
 * Fetches all markets that have been resolved.
 * Paginates through Gamma API to get up to `limit` resolved markets.
 */
export async function fetchResolvedMarketsBatch(
  options?: {
    limit?: number;
    since?: number; // timestamp: only markets resolved after this
  }
): Promise<ResolutionBatch> {
  const { limit = 200, since } = options ?? {};
  const pageSize = 100; // Gamma API max per page
  const pages = Math.ceil(limit / pageSize);
  const results: ResolvedMarketSummary[] = [];

  for (let page = 0; page < pages; page++) {
    const pageLimit = Math.min(pageSize, limit - page * pageSize);

    const url = buildQuery(`${GAMMA_URL}/markets`, {
      closed: "true",
      limit: pageLimit,
      offset: page * pageSize,
      order: "end_date",
    });

    const raw = await apiFetch<Record<string, unknown>[]>(url);

    for (const market of raw) {
      const summary = mapResolvedMarket(market);

      // Filter by since timestamp
      if (since !== undefined && summary.resolvedAt !== null) {
        if (summary.resolvedAt < since) continue;
      }

      // Only include actually resolved markets (not just closed)
      if (!summary.winningOutcome) continue;

      results.push(summary);
    }

    if (raw.length < pageLimit) break;
  }

  return {
    markets: results.slice(0, limit),
    total: results.length,
    since: since ?? 0,
  };
}

// ─── Resolution by IDs ─────────────────────────────────────────

/**
 * Checks resolution status for a batch of market IDs.
 * Returns only those that have been resolved.
 */
export async function checkResolutions(
  marketIds: string[]
): Promise<ResolvedMarketSummary[]> {
  // Fetch each market individually (Gamma API doesn't support bulk by ID)
  const results: ResolvedMarketSummary[] = [];

  // Batch in groups of 10 to avoid hammering the API
  const BATCH_SIZE = 10;

  for (let i = 0; i < marketIds.length; i += BATCH_SIZE) {
    const batch = marketIds.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (id) => {
      try {
        const data = await fetchMarketData(id);
        if (data.resolved) {
          return mapResolvedFromMarketData(data);
        }
      } catch {
        // Market not found or error — skip
      }
      return null;
    });

    const batchResults = await Promise.all(promises);
    for (const result of batchResults) {
      if (result) results.push(result);
    }
  }

  return results;
}

// ─── Recently Resolved (last N hours) ──────────────────────────

/**
 * Fetches markets resolved in the last `hours` hours.
 */
export async function fetchRecentlyResolved(
  hours: number = 24,
  limit: number = 100
): Promise<ResolvedMarketSummary[]> {
  // Get recently closed markets from Gamma
  const url = buildQuery(`${GAMMA_URL}/markets`, {
    closed: "true",
    limit,
    order: "end_date",
  });

  const raw = await apiFetch<Record<string, unknown>[]>(url);

  const now = Date.now() / 1000;
  const cutoff = now - hours * 3600;

  return raw
    .map(mapResolvedMarket)
    .filter((m) => {
      // Only truly resolved (has outcome) and within time window
      if (!m.winningOutcome) return false;
      if (m.resolvedAt === null) return false;
      return m.resolvedAt >= cutoff;
    })
    .slice(0, limit);
}

// ─── Resolution Comparison ─────────────────────────────────────

/**
 * Given a predicted outcome and the actual resolution, returns whether
 * the prediction was correct.
 */
export function verifyPrediction(
  predictedOutcome: string,
  predictedSide: "yes" | "no",
  resolution: ResolvedMarketSummary
): { correct: boolean; profit: number | null } {
  if (!resolution.winningOutcome) {
    return { correct: false, profit: null }; // Not yet resolved
  }

  // Did we predict the winning outcome?
  const correct =
    predictedOutcome.toLowerCase() ===
    resolution.winningOutcome.toLowerCase();

  // For binary yes/no markets:
  // - If we bet "yes" and "Yes" won → profit
  // - If we bet "no" and "No" won → profit
  const yesWon =
    resolution.winningOutcome.toLowerCase() === "yes";
  const noWon =
    resolution.winningOutcome.toLowerCase() === "no";

  if (yesWon && predictedSide === "yes") {
    return { correct: true, profit: 1.0 }; // $1 per share at resolution
  } else if (noWon && predictedSide === "no") {
    return { correct: true, profit: 1.0 };
  } else if (yesWon || noWon) {
    return { correct: false, profit: 0 };
  }

  // Non-binary market
  return { correct, profit: correct ? 1.0 : 0 };
}

// ─── Helpers ───────────────────────────────────────────────────

function mapResolvedMarket(
  raw: Record<string, unknown>
): ResolvedMarketSummary {
  const outcomes = (raw.outcomes as string[]) ?? ["Yes", "No"];
  const outcomePrices = parseOutcomePrices(
    raw.outcomePrices ?? raw.outcome_prices,
    outcomes
  );

  // Determine winning outcome: the one with price = 1
  let winningOutcome: string | null = null;
  let winningOutcomeIndex: number | null = null;

  const winIdx = outcomePrices.indexOf(1);
  if (winIdx >= 0) {
    winningOutcome = outcomes[winIdx] ?? null;
    winningOutcomeIndex = winIdx;
  }

  return {
    marketId: String(raw.id ?? raw.slug ?? ""),
    conditionId: String(raw.conditionId ?? raw.condition_id ?? raw.id ?? ""),
    question: String(raw.question ?? raw.title ?? ""),
    category: raw.category ? String(raw.category) : undefined,
    resolvedAt: raw.endDate ?? raw.end_date
      ? new Date(String(raw.endDate ?? raw.end_date)).getTime() / 1000
      : null,
    winningOutcome,
    winningOutcomeIndex,
    totalVolume: Number(raw.volume ?? raw.volumeNum ?? 0),
    liquidity: Number(raw.liquidity ?? raw.liquidityNum ?? 0),
  };
}

function mapResolvedFromMarketData(
  data: MarketData
): ResolvedMarketSummary {
  const winIdx = data.outcomePrices.indexOf(1);

  return {
    marketId: data.id,
    conditionId: data.conditionId,
    question: data.question,
    category: data.category,
    resolvedAt: data.endDate
      ? new Date(data.endDate).getTime() / 1000
      : null,
    winningOutcome: winIdx >= 0 ? (data.outcomes[winIdx] ?? null) : null,
    winningOutcomeIndex: winIdx >= 0 ? winIdx : null,
    totalVolume: data.volume,
    liquidity: data.liquidity,
  };
}

