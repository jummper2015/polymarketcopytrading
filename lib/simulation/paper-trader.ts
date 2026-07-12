// Paper Trading Engine — Hito 4.1
// Creates simulated trades from DecisionJournal records with decision=paper_copy,
// tracks unrealized/realized PnL, and handles resolution against real outcomes.
//
// Paper trades use $5–$20 positions. All trades are simulated — no real money.
//
// PnL formula:
//   shares = simulatedPositionSize / entryPrice
//   unrealizedPnl = shares * (currentPrice - entryPrice)
//
//   For YES trades: currentPrice is the YES token price
//   For NO trades:  currentPrice is the NO token price
//
// Resolution:
//   Win:  realizedPnl = shares * (1 - entryPrice)
//   Loss: realizedPnl = -simulatedPositionSize

import { db } from "@/db";
import {
  decisionJournals,
  observedTrades,
  paperTrades,
  pnlSnapshots,
} from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";

// ─── Types ─────────────────────────────────────────────────────

/** A row from the paper_trade table */
export type PaperTradeRow = typeof paperTrades.$inferSelect;

/** A row from the observed_trade table */
type ObservedTradeRow = typeof observedTrades.$inferSelect;

/** Result of processPendingDecisions() */
export interface ProcessPendingResult {
  created: number;
  skipped: number;
  errors: string[];
}

/** Snapshot of a paper trade's PnL state */
export interface PaperTradeSnapshot {
  trade: PaperTradeRow;
  /** Profit / loss in dollars */
  pnl: number;
  /** Percentage return on the simulated position */
  pnlPercent: number;
  /** Whether the trade is in profit */
  inProfit: boolean;
}

// ─── Core: Create Paper Trade ──────────────────────────────────

/**
 * Create a simulated paper trade from a DecisionJournal record.
 *
 * Loads the linked ObservedTrade to get side, outcome, and entry price.
 * Uses detectedPrice as the entry price, falling back to walletEntryPrice.
 *
 * @returns The created PaperTrade row, or null if the linked trade is missing.
 */
export async function createPaperTrade(
  decisionJournalId: number
): Promise<PaperTradeRow | null> {
  // Load the DecisionJournal
  const djRows = await db
    .select()
    .from(decisionJournals)
    .where(eq(decisionJournals.id, decisionJournalId))
    .limit(1);

  if (djRows.length === 0) return null;
  const dj = djRows[0];

  // Only create trades for paper_copy decisions
  if (dj.decision !== "paper_copy") return null;

  // Check if a paper trade already exists for this decision
  const existing = await db
    .select({ id: paperTrades.id })
    .from(paperTrades)
    .where(eq(paperTrades.decisionJournalId, decisionJournalId))
    .limit(1);

  if (existing.length > 0) return null; // Already created

  // Load the linked ObservedTrade for side & entry price
  let observedTrade: ObservedTradeRow | null = null;
  if (dj.observedTradeId) {
    const otRows = await db
      .select()
      .from(observedTrades)
      .where(eq(observedTrades.id, dj.observedTradeId))
      .limit(1);
    observedTrade = otRows[0] ?? null;
  }

  const side = observedTrade?.side ?? "yes";
  const entryPrice =
    observedTrade?.detectedPrice ??
    observedTrade?.walletEntryPrice ??
    0.5; // fallback midpoint
  const positionSize = dj.simulatedPositionSize ?? 5;

  await db.insert(paperTrades).values({
    decisionJournalId: dj.id,
    walletAddress: dj.walletAddress,
    marketId: dj.marketId,
    outcome: observedTrade?.outcome ?? null,
    side,
    entryPrice,
    currentPrice: entryPrice,
    simulatedPositionSize: positionSize,
    unrealizedPnl: 0,
    realizedPnl: 0,
    status: "open",
  });

  // Fetch and return the just-inserted row
  const created = await db
    .select()
    .from(paperTrades)
    .where(eq(paperTrades.decisionJournalId, decisionJournalId))
    .limit(1);

  return created[0] ?? null;
}

// ─── Core: Update PnL ──────────────────────────────────────────

/**
 * Update the unrealized PnL for an open paper trade given the
 * current market price of the traded token side.
 *
 * Also creates a PnlSnapshot record for historical tracking.
 *
 * @param paperTradeId - The paper trade to update
 * @param currentPrice - Current price of the token side (YES price for yes trades, NO price for no trades)
 */
export async function updatePaperTradePnL(
  paperTradeId: number,
  currentPrice: number
): Promise<void> {
  // Load the paper trade
  const rows = await db
    .select()
    .from(paperTrades)
    .where(eq(paperTrades.id, paperTradeId))
    .limit(1);

  if (rows.length === 0) return;
  const pt = rows[0];

  // Only update open trades
  if (pt.status !== "open") return;

  // Calculate PnL
  // shares = positionSize / entryPrice
  // pnl = shares * (currentPrice - entryPrice)
  // Works for both YES and NO: currentPrice is the price of the traded side
  const shares = pt.simulatedPositionSize / pt.entryPrice;
  const unrealizedPnl = shares * (currentPrice - pt.entryPrice);

  // Update the paper trade
  await db
    .update(paperTrades)
    .set({
      currentPrice,
      unrealizedPnl: Math.round(unrealizedPnl * 10_000) / 10_000,
    })
    .where(eq(paperTrades.id, paperTradeId));

  // Create PnL snapshot
  await db.insert(pnlSnapshots).values({
    paperTradeId,
    price: currentPrice,
    pnl: Math.round(unrealizedPnl * 10_000) / 10_000,
  });
}

/**
 * Update PnL for multiple open paper trades in batch.
 *
 * @param priceMap - Map of paperTradeId → currentPrice
 */
export async function updateBatchPnL(
  priceMap: Map<number, number>
): Promise<void> {
  for (const [id, price] of priceMap) {
    await updatePaperTradePnL(id, price);
  }
}

// ─── Core: Close Position ──────────────────────────────────────

/**
 * Close an open paper trade position (manual close, not resolution).
 *
 * Moves unrealized PnL to realized PnL and sets status to "closed".
 */
export async function closePaperTrade(
  paperTradeId: number
): Promise<PaperTradeRow | null> {
  const rows = await db
    .select()
    .from(paperTrades)
    .where(eq(paperTrades.id, paperTradeId))
    .limit(1);

  if (rows.length === 0) return null;
  const pt = rows[0];

  if (pt.status !== "open") return pt; // Already closed or resolved

  const now = new Date();

  await db
    .update(paperTrades)
    .set({
      status: "closed",
      closedAt: now,
      realizedPnl: pt.unrealizedPnl ?? 0,
      unrealizedPnl: 0,
    })
    .where(eq(paperTrades.id, paperTradeId));

  // Return updated row
  const updated = await db
    .select()
    .from(paperTrades)
    .where(eq(paperTrades.id, paperTradeId))
    .limit(1);

  return updated[0] ?? null;
}

// ─── Core: Resolve Trade ───────────────────────────────────────

/**
 * Resolve a paper trade against the real market outcome.
 *
 * In Polymarket, when a market resolves:
 * - If the side you bet on wins → you get $1 per share
 * - If the side you bet on loses → you get $0 per share
 *
 * @param paperTradeId - The paper trade to resolve
 * @param winningOutcome - The winning side: "Yes" or "No"
 * @param resolvedPrice - The resolved price (typically 1.0 or 0.0)
 */
export async function resolvePaperTrade(
  paperTradeId: number,
  winningOutcome: string,
  resolvedPrice: number = 1.0
): Promise<PaperTradeRow | null> {
  const rows = await db
    .select()
    .from(paperTrades)
    .where(eq(paperTrades.id, paperTradeId))
    .limit(1);

  if (rows.length === 0) return null;
  const pt = rows[0];

  if (pt.status !== "open") return pt; // Only resolve open trades

  // Determine if we won
  const winOutcomeNorm = winningOutcome.trim().toLowerCase();
  const sideNorm = pt.side.toLowerCase();
  const won = winOutcomeNorm === sideNorm;

  const shares = pt.simulatedPositionSize / pt.entryPrice;

  let realizedPnl: number;
  if (won) {
    // Win: shares * (1 - entryPrice)
    realizedPnl = shares * (resolvedPrice - pt.entryPrice);
  } else {
    // Loss: lose entire position
    realizedPnl = -pt.simulatedPositionSize;
  }

  const now = new Date();

  await db
    .update(paperTrades)
    .set({
      status: "resolved",
      resolvedAt: now,
      closedAt: now,
      currentPrice: resolvedPrice,
      realizedPnl: Math.round(realizedPnl * 10_000) / 10_000,
      unrealizedPnl: 0,
    })
    .where(eq(paperTrades.id, paperTradeId));

  // Create final PnL snapshot
  await db.insert(pnlSnapshots).values({
    paperTradeId,
    price: resolvedPrice,
    pnl: Math.round(realizedPnl * 10_000) / 10_000,
  });

  // Return updated row
  const updated = await db
    .select()
    .from(paperTrades)
    .where(eq(paperTrades.id, paperTradeId))
    .limit(1);

  return updated[0] ?? null;
}

// ─── Batch: Process Pending Decisions ──────────────────────────

/**
 * Find all DecisionJournal records with decision=paper_copy that
 * don't yet have a corresponding PaperTrade, and create them.
 *
 * Designed to run after `score:trades` to automatically generate
 * simulated positions for all copy-worthy trades.
 *
 * @param limit - Max number of trades to create (default: 50)
 */
export async function processPendingDecisions(
  limit: number = 50
): Promise<ProcessPendingResult> {
  const result: ProcessPendingResult = {
    created: 0,
    skipped: 0,
    errors: [],
  };

  // Find paper_copy decisions without a paper trade
  const pending = await db
    .select({
      dj: decisionJournals,
    })
    .from(decisionJournals)
    .leftJoin(
      paperTrades,
      eq(decisionJournals.id, paperTrades.decisionJournalId)
    )
    .where(
      and(
        eq(decisionJournals.decision, "paper_copy"),
        isNull(paperTrades.id)
      )
    )
    .orderBy(decisionJournals.createdAt)
    .limit(limit);

  if (pending.length === 0) return result;

  for (const { dj } of pending) {
    // Double-check: only paper_copy decisions
    if (dj.decision !== "paper_copy") {
      result.skipped++;
      continue;
    }

    try {
      const trade = await createPaperTrade(dj.id);
      if (trade) {
        result.created++;
      } else {
        result.skipped++;
      }
    } catch (error) {
      result.errors.push(
        `Decision #${dj.id}: ${(error as Error).message}`
      );
      result.skipped++;
    }
  }

  return result;
}

// ─── Queries ───────────────────────────────────────────────────

/**
 * Get all currently open paper trades.
 */
export async function getOpenPaperTrades(): Promise<PaperTradeRow[]> {
  return db
    .select()
    .from(paperTrades)
    .where(eq(paperTrades.status, "open"))
    .orderBy(paperTrades.openedAt);
}

/**
 * Get paper trades by wallet address.
 */
export async function getPaperTradesByWallet(
  walletAddress: string
): Promise<PaperTradeRow[]> {
  return db
    .select()
    .from(paperTrades)
    .where(eq(paperTrades.walletAddress, walletAddress))
    .orderBy(paperTrades.openedAt);
}

/**
 * Get all paper trades with a given status.
 */
export async function getPaperTradesByStatus(
  status: "open" | "closed" | "resolved"
): Promise<PaperTradeRow[]> {
  return db
    .select()
    .from(paperTrades)
    .where(eq(paperTrades.status, status))
    .orderBy(paperTrades.openedAt);
}

/**
 * Get a paper trade snapshot with calculated PnL metrics.
 */
export async function getPaperTradeSnapshot(
  paperTradeId: number
): Promise<PaperTradeSnapshot | null> {
  const rows = await db
    .select()
    .from(paperTrades)
    .where(eq(paperTrades.id, paperTradeId))
    .limit(1);

  if (rows.length === 0) return null;
  const pt = rows[0];

  const pnl = (pt.status === "open" ? pt.unrealizedPnl : pt.realizedPnl) ?? 0;
  const pnlPercent = (pnl / pt.simulatedPositionSize) * 100;

  return {
    trade: pt,
    pnl,
    pnlPercent: Math.round(pnlPercent * 100) / 100,
    inProfit: pnl > 0,
  };
}

// ─── Aggregate Stats ───────────────────────────────────────────

/**
 * Calculate aggregate portfolio stats for all paper trades.
 */
export async function getPaperPortfolioStats(): Promise<{
  openCount: number;
  closedCount: number;
  resolvedCount: number;
  totalUnrealizedPnl: number;
  totalRealizedPnl: number;
  totalPnl: number;
  winCount: number;
  lossCount: number;
  winRate: number;
}> {
  const all = await db.select().from(paperTrades);

  const open = all.filter((t) => t.status === "open");
  const resolved = all.filter((t) => t.status === "resolved");
  const wins = resolved.filter((t) => (t.realizedPnl ?? 0) > 0);
  const losses = resolved.filter((t) => (t.realizedPnl ?? 0) < 0);

  return {
    openCount: open.length,
    closedCount: all.filter((t) => t.status === "closed").length,
    resolvedCount: resolved.length,
    totalUnrealizedPnl: open.reduce((sum, t) => sum + (t.unrealizedPnl ?? 0), 0),
    totalRealizedPnl: resolved.reduce((sum, t) => sum + (t.realizedPnl ?? 0), 0),
    totalPnl: all.reduce(
      (sum, t) =>
        sum +
        (t.status === "open" ? (t.unrealizedPnl ?? 0) : (t.realizedPnl ?? 0)),
      0
    ),
    winCount: wins.length,
    lossCount: losses.length,
    winRate: resolved.length > 0 ? wins.length / resolved.length : 0,
  };
}

// ─── Duplicate Prevention ──────────────────────────────────────

/**
 * Check whether a paper trade already exists for a given
 * DecisionJournal ID.
 */
export async function hasPaperTrade(
  decisionJournalId: number
): Promise<boolean> {
  const rows = await db
    .select({ id: paperTrades.id })
    .from(paperTrades)
    .where(eq(paperTrades.decisionJournalId, decisionJournalId))
    .limit(1);

  return rows.length > 0;
}
