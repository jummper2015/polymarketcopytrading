// Backtesting Engine — Hito 8.1
// Simulates historical copy trading for a wallet over a given period.
// Uses the same PnL formula as the paper-trader to calculate hypothetical
// returns if we had blindly copied every trade from a wallet.
//
// Key metrics:
//   - Total PnL, ROI, Win Rate, Profit Factor
//   - Max Drawdown, Sharpe Ratio (simplified)
//   - Per-trade breakdown
//
// No real money. No blockchain interaction. Pure computation.

import { fetchTradeHistory, type TradeData } from "@/lib/adapters/trades";
import { fetchMarketData, type MarketData } from "@/lib/adapters/markets";
import { checkResolutions } from "@/lib/adapters/outcomes";
import type { ResolvedMarketSummary } from "@/lib/adapters/outcomes";

// ─── Types ─────────────────────────────────────────────────────

/** Configuration for a backtest run */
export interface BacktestConfig {
  /** Wallet address to simulate copying */
  walletAddress: string;
  /** Start date (ISO string or Date) */
  startDate: string | Date;
  /** End date (ISO string or Date) */
  endDate: string | Date;
  /** Position size per trade in dollars (default: 10) */
  positionSize?: number;
  /** Minimum trade size to consider (ignore tiny trades, default: 1) */
  minTradeSize?: number;
  /** Whether to fetch market outcomes for resolved markets (default: true) */
  checkOutcomes?: boolean;
}

/** A single simulated trade in the backtest */
export interface BacktestTrade {
  /** Original trade data from the wallet */
  original: TradeData;
  /** Position size used in the simulation */
  positionSize: number;
  /** Number of shares bought = positionSize / entryPrice */
  shares: number;
  /** Entry price */
  entryPrice: number;
  /** Side traded (yes/no) */
  side: "yes" | "no";
  /** Whether the market has resolved */
  resolved: boolean;
  /** Winning outcome if resolved */
  winningOutcome?: string;
  /** Current or resolved price of the token */
  currentPrice?: number;
  /** Simulated PnL */
  pnl: number;
  /** Whether this trade was profitable */
  won: boolean | null; // null = unresolved
}

/** Aggregate result of a backtest */
export interface BacktestResult {
  walletAddress: string;
  startDate: string;
  endDate: string;
  /** Total number of trades simulated */
  totalTrades: number;
  /** Number of resolved trades */
  resolvedTrades: number;
  /** Number of winning trades */
  winningTrades: number;
  /** Number of losing trades */
  losingTrades: number;
  /** Total simulated PnL in dollars */
  totalPnl: number;
  /** Total position size invested */
  totalInvested: number;
  /** Return on investment: totalPnl / totalInvested */
  roi: number;
  /** Win rate: winningTrades / resolvedTrades */
  winRate: number;
  /** Profit factor: sum(wins) / abs(sum(losses)) */
  profitFactor: number;
  /** Maximum drawdown as a negative number (e.g. -0.15 = 15% drawdown) */
  maxDrawdown: number;
  /** Simplified Sharpe ratio (assuming 0% risk-free rate) */
  sharpeRatio: number;
  /** Individual trade results */
  trades: BacktestTrade[];
}

/** Comparison of multiple backtest strategies */
export interface StrategyComparison {
  /** Period covered */
  startDate: string;
  endDate: string;
  /** Results per wallet, sorted by totalPnl descending */
  results: BacktestResult[];
  /** Best performing wallet */
  best: BacktestResult | null;
  /** Worst performing wallet */
  worst: BacktestResult | null;
  /** Average ROI across all wallets */
  averageRoi: number;
  /** Average win rate across all wallets */
  averageWinRate: number;
}

// ─── Core: Run Backtest ────────────────────────────────────────

/**
 * Run a historical copy-trading simulation for a single wallet.
 *
 * Fetches the wallet's trade history from Polymarket, simulates copying
 * each trade with a fixed position size, batch-checks market outcomes for
 * resolved markets, and calculates aggregate performance metrics.
 *
 * @param config - Backtest configuration
 * @returns Complete backtest result with per-trade and aggregate metrics
 */
export async function runBacktest(
  config: BacktestConfig
): Promise<BacktestResult> {
  const {
    walletAddress,
    startDate,
    endDate,
    positionSize = 10,
    minTradeSize = 1,
    checkOutcomes = true,
  } = config;

  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.ceil(
    (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Phase 1: Fetch historical trades
  const trades = await fetchTradeHistory(walletAddress, days, {
    limit: 500,
  });

  // Filter by date range and minimum size
  const startTs = Math.floor(start.getTime() / 1000);
  const endTs = Math.floor(end.getTime() / 1000);
  const filteredTrades = trades.filter(
    (t) =>
      t.timestamp >= startTs &&
      t.timestamp <= endTs &&
      t.size >= minTradeSize
  );

  if (filteredTrades.length === 0) {
    return emptyResult(walletAddress, start, end);
  }

  // Phase 2: Batch-check resolutions (single API round-trip in lots of 10).
  // NOTE: trade.marketId (from trades adapter) maps from conditionId/condition_id,
  // while resolvedMarketSummary.marketId (from outcomes adapter) maps from
  // id/slug. These MAY differ for some Polymarket markets. If a resolution
  // is missed due to this mismatch, the trade will be treated as unresolved.
  let resolutionMap = new Map<string, ResolvedMarketSummary>();
  if (checkOutcomes) {
    const marketIds = [
      ...new Set(filteredTrades.map((t) => t.marketId)),
    ];
    if (marketIds.length > 0) {
      try {
        const resolved = await checkResolutions(marketIds);
        for (const r of resolved) {
          resolutionMap.set(r.marketId, r);
        }
      } catch (err) {
        console.warn(
          `[backtest] Resolution batch check failed: ${(err as Error).message}. Continuing without resolution data.`
        );
      }
    }
  }

  // Cache for unresolved market prices to avoid duplicate API calls
  // when a wallet trades the same market multiple times.
  const priceCache = new Map<string, MarketData>();

  // Phase 3: Simulate each trade
  const simulatedTrades: BacktestTrade[] = [];
  let cumulativePnl = 0;
  let peakPnl = 0;
  let maxDrawdown = 0;
  let totalInvestedSoFar = 0;

  for (const trade of filteredTrades) {
    const resolution = resolutionMap.get(trade.marketId);

    // Fetch current price for unresolved markets (in real usage, this would
    // be batched too, but the API doesn't support batch market data queries)
    let currentPrice: number | undefined;
    let pnl = 0;
    let resolved = false;
    let winningOutcome: string | undefined;
    let won: boolean | null = null;

    const entryPrice = trade.price;
    const side = trade.side;
    const shares = entryPrice > 0 ? positionSize / entryPrice : 0;
    totalInvestedSoFar += positionSize;

    if (resolution?.winningOutcome) {
      // Market resolved — determine win/loss
      resolved = true;
      winningOutcome = resolution.winningOutcome;
      const winOutcomeNorm = resolution.winningOutcome.trim().toLowerCase();
      const sideNorm = side.toLowerCase();
      won = winOutcomeNorm === sideNorm;

      if (won) {
        pnl = shares * (1 - entryPrice);
      } else {
        pnl = -positionSize;
      }
    } else {
      // Market not resolved — try current price from cache or API
      try {
        let market = priceCache.get(trade.marketId) ?? null;
        if (!market) {
          market = await fetchMarketData(trade.marketId);
          priceCache.set(trade.marketId, market);
        }
        if (market) {
          currentPrice =
            side === "yes" ? market.yesPrice : market.noPrice;
          if (currentPrice != null && currentPrice > 0) {
            pnl = shares * (currentPrice - entryPrice);
          }
        }
      } catch {
        // Price fetch failed — PnL stays 0. The trade is counted but has
        // no realized/unrealized PnL, which is a known limitation.
      }
    }

    simulatedTrades.push({
      original: trade,
      positionSize,
      shares: Math.round(shares * 10000) / 10000,
      entryPrice,
      side,
      resolved,
      winningOutcome,
      currentPrice,
      pnl: Math.round(pnl * 10000) / 10000,
      won,
    });

    // Track cumulative PnL and max drawdown
    cumulativePnl += pnl;
    if (cumulativePnl > peakPnl) {
      peakPnl = cumulativePnl;
    }
    // Drawdown: (current - peak) / peak, measured against starting capital
    // When peak is 0, measure against cumulative invested as fallback
    const drawdown =
      peakPnl > 0
        ? (cumulativePnl - peakPnl) / peakPnl
        : totalInvestedSoFar > 0
        ? cumulativePnl / totalInvestedSoFar
        : 0;
    if (drawdown < maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  // Phase 4: Aggregate metrics
  const resolvedTrades = simulatedTrades.filter((t) => t.resolved);
  const wins = resolvedTrades.filter((t) => t.won === true);
  const losses = resolvedTrades.filter((t) => t.won === false);

  const totalPnl = simulatedTrades.reduce((s, t) => s + t.pnl, 0);
  const totalInvested = simulatedTrades.length * positionSize;
  const roi = totalInvested > 0 ? totalPnl / totalInvested : 0;
  const winRate =
    resolvedTrades.length > 0
      ? wins.length / resolvedTrades.length
      : 0;

  const totalWins = wins.reduce((s, t) => s + t.pnl, 0);
  const totalLosses = Math.abs(
    losses.reduce((s, t) => s + t.pnl, 0)
  );
  const profitFactor =
    totalLosses > 0
      ? totalWins / totalLosses
      : totalWins > 0
      ? Infinity
      : 0;

  // Simplified Sharpe ratio (per-trade returns)
  const returns = simulatedTrades.map((t) => t.pnl / t.positionSize);
  const avgReturn =
    returns.reduce((s, r) => s + r, 0) / (returns.length || 1);
  const variance =
    returns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) /
    (returns.length || 1);
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0;

  return {
    walletAddress,
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    totalTrades: simulatedTrades.length,
    resolvedTrades: resolvedTrades.length,
    winningTrades: wins.length,
    losingTrades: losses.length,
    totalPnl: Math.round(totalPnl * 100) / 100,
    totalInvested,
    roi: Math.round(roi * 10000) / 10000,
    winRate: Math.round(winRate * 10000) / 10000,
    profitFactor:
      profitFactor === Infinity
        ? 999
        : Math.round(profitFactor * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 10000) / 10000,
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    trades: simulatedTrades,
  };
}

// ─── Convenience: Calculate PnL ────────────────────────────────

/**
 * Quick PnL calculation for a wallet over a period.
 * Thin wrapper around runBacktest() that returns only PnL.
 */
export async function calculateBacktestPnL(
  walletAddress: string,
  days: number = 30,
  positionSize: number = 10
): Promise<number> {
  const endDate = new Date();
  const startDate = new Date(
    endDate.getTime() - days * 24 * 60 * 60 * 1000
  );

  const result = await runBacktest({
    walletAddress,
    startDate,
    endDate,
    positionSize,
    checkOutcomes: true,
  });

  return result.totalPnl;
}

// ─── Compare Strategies ────────────────────────────────────────

/**
 * Compare backtest results across multiple wallets.
 *
 * Runs a backtest for each wallet, then ranks them by total PnL
 * and computes aggregate statistics.
 *
 * @param wallets - Array of wallet addresses to compare
 * @param days - Lookback period in days
 * @param positionSize - Position size per trade
 */
export async function compareStrategies(
  wallets: string[],
  days: number = 30,
  positionSize: number = 10
): Promise<StrategyComparison> {
  const endDate = new Date();
  const startDate = new Date(
    endDate.getTime() - days * 24 * 60 * 60 * 1000
  );

  const results: BacktestResult[] = [];

  for (const wallet of wallets) {
    console.log(`[backtest] Running backtest for ${wallet.slice(0, 10)}...`);
    const result = await runBacktest({
      walletAddress: wallet,
      startDate,
      endDate,
      positionSize,
    });
    results.push(result);
  }

  // Sort by totalPnl descending
  results.sort((a, b) => b.totalPnl - a.totalPnl);

  const best = results[0] ?? null;
  const worst = results[results.length - 1] ?? null;

  const averageRoi =
    results.length > 0
      ? results.reduce((s, r) => s + r.roi, 0) / results.length
      : 0;

  const averageWinRate =
    results.length > 0
      ? results.reduce((s, r) => s + r.winRate, 0) / results.length
      : 0;

  return {
    startDate: startDate.toISOString().slice(0, 10),
    endDate: endDate.toISOString().slice(0, 10),
    results,
    best,
    worst,
    averageRoi: Math.round(averageRoi * 10000) / 10000,
    averageWinRate: Math.round(averageWinRate * 10000) / 10000,
  };
}

// ─── Helpers ───────────────────────────────────────────────────

function emptyResult(
  walletAddress: string,
  start: Date,
  end: Date
): BacktestResult {
  return {
    walletAddress,
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    totalTrades: 0,
    resolvedTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    totalPnl: 0,
    totalInvested: 0,
    roi: 0,
    winRate: 0,
    profitFactor: 0,
    maxDrawdown: 0,
    sharpeRatio: 0,
    trades: [],
  };
}
