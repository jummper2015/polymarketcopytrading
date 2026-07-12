// Rule Engine — Hito 5.1
// Versioned rule management with auto-improvement based on evidence.
// Rules control thresholds and weights used by the scoring engines.
//
// Default rules (v1.0.0) from ROADMAP.md:
//   thresholds: minGlobalScore, minLiquidity, maxSpread, etc.
//   weights:    walletQuality, categoryFit, entryTiming, spread, etc.

import { db } from "@/db";
import { ruleSets, ruleChanges } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

// ─── Types ─────────────────────────────────────────────────────

/** Threshold values that control trade filtering */
export interface RuleThresholds {
  minGlobalScore: number;
  minLiquidity: number;
  maxSpread: number;
  maxEntryDelayMinutes: number;
  minTimeToResolutionHours: number;
  minConsistencyScore: number;
  maxOneHitWonderRatio: number;
  minResolvedTrades: number;
  paperPositionMin: number;
  paperPositionMax: number;
}

/** Weight distribution for the copyScore formula */
export interface RuleWeights {
  walletQuality: number;
  categoryFit: number;
  entryTiming: number;
  spread: number;
  liquidity: number;
  roi: number;
  thesis: number;
  timeToResolution: number;
}

/** The full rules data stored as JSON in rule_sets */
export interface RuleSetData {
  version: string;
  thresholds: RuleThresholds;
  weights: RuleWeights;
}

/** A DB row from rule_sets */
export type RuleSetRecord = typeof ruleSets.$inferSelect;

/** A DB row from rule_changes */
export type RuleChangeRecord = typeof ruleChanges.$inferSelect;

/** Evidence that may trigger a rule change */
export interface RuleChangeEvidence {
  /** Overall portfolio stats since last rule update */
  winRate: number;
  totalPnl: number;
  resolvedCount: number;
  /** Average loss amount on incorrect trades */
  avgLoss: number;
  /** Average gain on correct trades */
  avgGain: number;
  /** Profit factor: totalGains / totalLosses */
  profitFactor: number;
  /** Number of skipped trades that turned out profitable */
  missedWinners: number;
  /** Number of copied trades that lost */
  copiedLosers: number;
  /** Market conditions */
  marketConditions?: string;
}

/** A proposed change to the rules — thresholds/weights can be partial */
export interface RuleChangeProposal {
  reason: string;
  evidenceSummary: string;
  changes: {
    thresholds?: Partial<RuleThresholds>;
    weights?: Partial<RuleWeights>;
    version?: string;
  };
}

/** Result of applying a rule change */
export interface RuleChangeResult {
  oldRuleSet: RuleSetRecord;
  newRuleSet: RuleSetRecord;
  change: RuleChangeRecord;
}

// ─── Default Rules (v1.0.0) ───────────────────────────────────

export function getDefaultRules(): RuleSetData {
  return {
    version: "1.0.0",
    thresholds: {
      minGlobalScore: 0.65,
      minLiquidity: 1000,
      maxSpread: 0.05,
      maxEntryDelayMinutes: 30,
      minTimeToResolutionHours: 2,
      minConsistencyScore: 0.4,
      maxOneHitWonderRatio: 0.4,
      minResolvedTrades: 5,
      paperPositionMin: 5,
      paperPositionMax: 20,
    },
    weights: {
      walletQuality: 0.25,
      categoryFit: 0.15,
      entryTiming: 0.15,
      spread: 0.10,
      liquidity: 0.10,
      roi: 0.10,
      thesis: 0.10,
      timeToResolution: 0.05,
    },
  };
}

// ─── Load & Query ──────────────────────────────────────────────

/**
 * Load the currently active rule set.
 * If no rules exist yet, seeds the default v1.0.0 rules automatically.
 */
export async function loadActiveRules(): Promise<RuleSetRecord> {
  const rows = await db
    .select()
    .from(ruleSets)
    .where(eq(ruleSets.active, true))
    .limit(1);

  if (rows.length > 0) return rows[0];

  // No active rules — seed the defaults
  return seedDefaultRules();
}

/** Parse the rules JSON from a RuleSet record */
export function parseRules(record: RuleSetRecord): RuleSetData {
  const parsed = JSON.parse(record.rulesJson) as RuleSetData;
  return {
    version: parsed.version ?? record.version,
    thresholds: { ...getDefaultRules().thresholds, ...parsed.thresholds },
    weights: { ...getDefaultRules().weights, ...parsed.weights },
  };
}

/**
 * Get the full history of rule changes, ordered newest first.
 */
export async function getRuleHistory(): Promise<
  (RuleChangeRecord & { before: RuleSetData | null; after: RuleSetData | null })[]
> {
  const changes = await db
    .select()
    .from(ruleChanges)
    .orderBy(desc(ruleChanges.createdAt));

  return changes.map((c) => ({
    ...c,
    before: c.beforeJson ? (JSON.parse(c.beforeJson) as RuleSetData) : null,
    after: c.afterJson ? (JSON.parse(c.afterJson) as RuleSetData) : null,
  }));
}

/**
 * Get all rule sets ordered by creation date (newest first).
 */
export async function getAllRuleSets(): Promise<RuleSetRecord[]> {
  return db
    .select()
    .from(ruleSets)
    .orderBy(desc(ruleSets.createdAt));
}

// ─── Auto-improvement ──────────────────────────────────────────

/**
 * Analyze evidence and propose rule changes.
 *
 * The system looks at:
 * - Win rate: if too low, tighten thresholds
 * - Copied losers vs missed winners: adjust entry criteria
 * - Profit factor: optimize position sizing
 * - Spread losses: adjust maxSpread threshold
 *
 * Returns null if no changes are warranted.
 */
export function proposeRuleChange(
  evidence: RuleChangeEvidence
): RuleChangeProposal | null {
  // All adjustments are relative to default thresholds, not current active rules.
  // This prevents runaway drift — repeated runs with similar evidence won't
  // compound adjustments indefinitely (e.g., tightening minGlobalScore by 0.05
  // every day until it's 0.99). Each proposal starts fresh from defaults.
  const defaults = getDefaultRules().thresholds;
  const changes: Partial<RuleThresholds> = {};
  const reasons: string[] = [];
  const evidenceLines: string[] = [];

  // ---- Win rate analysis ----
  if (evidence.resolvedCount >= 10 && evidence.winRate < 0.4) {
    changes.minGlobalScore = Math.min(defaults.minGlobalScore + 0.05, 0.85);
    reasons.push("Win rate below 40% — tightening minGlobalScore");
    evidenceLines.push(`Win rate: ${(evidence.winRate * 100).toFixed(0)}% over ${evidence.resolvedCount} resolved trades`);
  } else if (evidence.resolvedCount >= 10 && evidence.winRate > 0.65) {
    changes.minGlobalScore = Math.max(defaults.minGlobalScore - 0.03, 0.5);
    reasons.push("Win rate above 65% — slightly relaxing minGlobalScore");
    evidenceLines.push(`Win rate: ${(evidence.winRate * 100).toFixed(0)}% over ${evidence.resolvedCount} resolved trades`);
  }

  // ---- Copied losers analysis ----
  if (evidence.copiedLosers > evidence.resolvedCount * 0.5) {
    changes.minConsistencyScore = Math.min(defaults.minConsistencyScore + 0.05, 0.6);
    reasons.push("More than 50% of copied trades lost — raising minConsistencyScore");
    evidenceLines.push(`Copied losers: ${evidence.copiedLosers} out of ${evidence.resolvedCount}`);
  }

  // ---- Missed winners ----
  if (evidence.missedWinners > 3) {
    changes.minLiquidity = Math.max(defaults.minLiquidity - 200, 500);
    reasons.push(`${evidence.missedWinners} profitable trades were missed — relaxing minLiquidity`);
    evidenceLines.push(`Missed winners: ${evidence.missedWinners}`);
  }

  // ---- Profit factor analysis ----
  if (evidence.profitFactor > 0 && evidence.profitFactor < 0.8 && evidence.resolvedCount >= 10) {
    changes.paperPositionMax = Math.max(defaults.paperPositionMax - 5, 10);
    reasons.push("Profit factor below 0.8 — reducing max position size");
    evidenceLines.push(`Profit factor: ${evidence.profitFactor.toFixed(2)}`);
  } else if (evidence.profitFactor > 2.0 && evidence.resolvedCount >= 10) {
    changes.paperPositionMax = Math.min(defaults.paperPositionMax + 3, 30);
    reasons.push("Profit factor above 2.0 — increasing max position size");
    evidenceLines.push(`Profit factor: ${evidence.profitFactor.toFixed(2)}`);
  }

  // ---- Spread cost analysis ----
  if (evidence.avgLoss < -5 && evidence.resolvedCount >= 5) {
    changes.maxSpread = Math.max(defaults.maxSpread - 0.01, 0.02);
    reasons.push("Average loss exceeds $5 — tightening maxSpread to reduce entry costs");
    evidenceLines.push(`Avg loss: $${Math.abs(evidence.avgLoss).toFixed(2)}`);
  }

  // ---- No changes needed ----
  if (Object.keys(changes).length === 0) return null;

  return {
    reason: reasons.join("; "),
    evidenceSummary: evidenceLines.join(" | "),
    changes: {
      thresholds: changes,
    },
  };
}

/** Clone a ruleset and bump its version (patch increment) */
function bumpVersion(currentVersion: string): string {
  const parts = currentVersion.split(".").map(Number);
  if (parts.length !== 3) return "1.0.1";
  parts[2] = (parts[2] ?? 0) + 1;
  return parts.join(".");
}

// ─── Apply Changes ─────────────────────────────────────────────

/**
 * Apply a proposed rule change: deactivates the current rules,
 * creates a new version, and records the change.
 *
 * This is the auto-update mechanism — no human approval needed.
 */
export async function applyRuleChange(
  proposal: RuleChangeProposal
): Promise<RuleChangeResult> {
  // Load current active rules
  const current = await loadActiveRules();
  const currentData = parseRules(current);

  // Build new rules by merging proposed changes onto current rules
  const newData: RuleSetData = {
    version: bumpVersion(currentData.version),
    thresholds: {
      ...currentData.thresholds,
      ...(proposal.changes.thresholds ?? {}),
    },
    weights: {
      ...currentData.weights,
      ...(proposal.changes.weights ?? {}),
    },
  };

  // Deactivate current rule set
  await db
    .update(ruleSets)
    .set({ active: false })
    .where(eq(ruleSets.id, current.id));

  // Insert new active rule set (insert-then-select, consistent with project convention)
  await db.insert(ruleSets).values({
    version: newData.version,
    active: true,
    rulesJson: JSON.stringify(newData),
  });

  // Fetch the newly inserted record (most recent active)
  const newRows = await db
    .select()
    .from(ruleSets)
    .where(eq(ruleSets.active, true))
    .orderBy(desc(ruleSets.id))
    .limit(1);
  const newRuleSet = newRows[0];
  if (!newRuleSet) throw new Error("Failed to create new rule set");

  // Record the change
  await db.insert(ruleChanges).values({
    oldRuleSetId: current.id,
    newRuleSetId: newRuleSet.id,
    changedBy: "hermes",
    reason: proposal.reason,
    evidenceSummary: proposal.evidenceSummary,
    beforeJson: JSON.stringify(currentData),
    afterJson: JSON.stringify(newData),
  });

  // Fetch the change record (most recent for this newRuleSetId)
  const changeRows = await db
    .select()
    .from(ruleChanges)
    .where(eq(ruleChanges.newRuleSetId, newRuleSet.id))
    .limit(1);

  return {
    oldRuleSet: current,
    newRuleSet,
    change: changeRows[0]!,
  };
}

// ─── Seed ──────────────────────────────────────────────────────

/**
 * Create the initial default rule set (v1.0.0) if none exists.
 * Called automatically by `loadActiveRules()`.
 */
export async function seedDefaultRules(): Promise<RuleSetRecord> {
  // Safety check: avoid duplicate seeding if rules already exist
  const existing = await db
    .select()
    .from(ruleSets)
    .orderBy(desc(ruleSets.createdAt))
    .limit(1);
  if (existing.length > 0) return existing[0];

  const defaults = getDefaultRules();

  await db.insert(ruleSets).values({
    version: defaults.version,
    active: true,
    rulesJson: JSON.stringify(defaults),
  });

  // Fetch the seeded record
  const rows = await db
    .select()
    .from(ruleSets)
    .orderBy(desc(ruleSets.id))
    .limit(1);

  return rows[0]!;
}
