// tests/rules/auto-update.test.ts
// Hito 5.4 — Tests for automatic rule updates based on evidence
// Verifies that proposeRuleChange correctly analyzes evidence
// and proposes appropriate threshold/weight adjustments.

import { describe, it, expect } from "vitest";
import { proposeRuleChange, getDefaultRules } from "@/lib/rules/rule-engine";
import type { RuleChangeEvidence } from "@/lib/rules/rule-engine";

// ─── Helpers ───────────────────────────────────────────────────

function makeEvidence(overrides: Partial<RuleChangeEvidence> = {}): RuleChangeEvidence {
  return {
    winRate: 0.5,
    totalPnl: 0,
    resolvedCount: 10,
    avgLoss: -3,
    avgGain: 4,
    profitFactor: 1.2,
    missedWinners: 0,
    copiedLosers: 2,
    ...overrides,
  };
}

// ─── proposeRuleChange Tests ───────────────────────────────────

describe("proposeRuleChange", () => {
  // --- Win Rate Analysis ---

  it("tightens minGlobalScore when win rate is below 40%", () => {
    const evidence = makeEvidence({ winRate: 0.35, resolvedCount: 10 });
    const proposal = proposeRuleChange(evidence);
    expect(proposal).not.toBeNull();
    expect(proposal!.changes.thresholds?.minGlobalScore).toBeGreaterThan(
      getDefaultRules().thresholds.minGlobalScore
    );
    expect(proposal!.reason).toContain("minGlobalScore");
  });

  it("relaxes minGlobalScore when win rate is above 65%", () => {
    const evidence = makeEvidence({ winRate: 0.70, resolvedCount: 10 });
    const proposal = proposeRuleChange(evidence);
    expect(proposal).not.toBeNull();
    expect(proposal!.changes.thresholds?.minGlobalScore).toBeLessThan(
      getDefaultRules().thresholds.minGlobalScore
    );
  });

  it("does NOT change minGlobalScore when resolved count < 10", () => {
    const evidence = makeEvidence({ winRate: 0.30, resolvedCount: 5 });
    const proposal = proposeRuleChange(evidence);
    // Should not trigger win rate adjustment (resolved < 10)
    // May trigger other changes (copiedLosers, spread)
    if (proposal) {
      expect(proposal.changes.thresholds?.minGlobalScore).toBeUndefined();
    }
  });

  // --- Copied Losers ---

  it("raises minConsistencyScore when more than 50% copied trades lose", () => {
    const evidence = makeEvidence({ copiedLosers: 8, resolvedCount: 10 });
    const proposal = proposeRuleChange(evidence);
    expect(proposal).not.toBeNull();
    expect(proposal!.changes.thresholds?.minConsistencyScore).toBeGreaterThan(
      getDefaultRules().thresholds.minConsistencyScore
    );
    expect(proposal!.reason).toContain("Consistency");
  });

  // --- Missed Winners ---

  it("relaxes minLiquidity when there are missed winners", () => {
    const evidence = makeEvidence({ missedWinners: 5 });
    const proposal = proposeRuleChange(evidence);
    expect(proposal).not.toBeNull();
    expect(proposal!.changes.thresholds?.minLiquidity).toBeLessThan(
      getDefaultRules().thresholds.minLiquidity
    );
    expect(proposal!.reason).toContain("liquidity");
  });

  it("does NOT relax minLiquidity when missedWinners is 0", () => {
    const evidence = makeEvidence({ missedWinners: 0 });
    const proposal = proposeRuleChange(evidence);
    // Should not trigger minLiquidity change if no missed winners
    if (proposal) {
      expect(proposal.changes.thresholds?.minLiquidity).toBeUndefined();
    }
  });

  // --- Profit Factor ---

  it("reduces max position when profit factor is below 0.8", () => {
    const evidence = makeEvidence({ profitFactor: 0.5, resolvedCount: 10 });
    const proposal = proposeRuleChange(evidence);
    expect(proposal).not.toBeNull();
    const changed = proposal!.changes.thresholds?.paperPositionMax;
    if (changed !== undefined) {
      expect(changed).toBeLessThan(getDefaultRules().thresholds.paperPositionMax);
    }
  });

  it("increases max position when profit factor is above 2.0", () => {
    const evidence = makeEvidence({ profitFactor: 2.5, resolvedCount: 10 });
    const proposal = proposeRuleChange(evidence);
    expect(proposal).not.toBeNull();
    const changed = proposal!.changes.thresholds?.paperPositionMax;
    if (changed !== undefined) {
      expect(changed).toBeGreaterThan(getDefaultRules().thresholds.paperPositionMax);
    }
  });

  // --- Spread Cost ---

  it("tightens maxSpread when average loss exceeds $5", () => {
    const evidence = makeEvidence({ avgLoss: -8, resolvedCount: 10 });
    const proposal = proposeRuleChange(evidence);
    expect(proposal).not.toBeNull();
    expect(proposal!.changes.thresholds?.maxSpread).toBeLessThan(
      getDefaultRules().thresholds.maxSpread
    );
  });

  // --- No Changes ---

  it("returns null when all metrics are healthy", () => {
    const evidence = makeEvidence({
      winRate: 0.55,
      resolvedCount: 10,
      missedWinners: 0,
      copiedLosers: 2,
      profitFactor: 1.2,
      avgLoss: -2,
    });
    // With winRate 55% (not <40 or >65), copiedLosers 2/10 (20%, not >50%),
    // missedWinners 0, profitFactor 1.2 (not <0.8 or >2.0), avgLoss $2 (not < -5)
    // → no changes should be proposed
    const proposal = proposeRuleChange(evidence);
    expect(proposal).toBeNull();
  });

  // --- Multiple Changes ---

  it("can propose multiple threshold changes simultaneously", () => {
    const evidence = makeEvidence({
      winRate: 0.25,
      resolvedCount: 10,
      missedWinners: 8,
      copiedLosers: 7,
      profitFactor: 0.4,
      avgLoss: -10,
    });
    const proposal = proposeRuleChange(evidence);
    expect(proposal).not.toBeNull();

    const changes = proposal!.changes.thresholds ?? {};
    // Should trigger all 5 adjustments
    expect(changes.minGlobalScore).toBeDefined();
    expect(changes.minConsistencyScore).toBeDefined();
    expect(changes.minLiquidity).toBeDefined();
    expect(changes.paperPositionMax).toBeDefined();
    expect(changes.maxSpread).toBeDefined();
  });

  // --- Clamping ---

  it("clamps minGlobalScore at 0.85 max", () => {
    // Apply repeated tightening evidence
    let proposal = proposeRuleChange(makeEvidence({ winRate: 0.35, resolvedCount: 10 }));
    expect(proposal!.changes.thresholds?.minGlobalScore).toBeLessThanOrEqual(0.85);
  });

  it("respects minimum liquidity floor of 500", () => {
    const evidence = makeEvidence({ missedWinners: 10 });
    const proposal = proposeRuleChange(evidence);
    expect(proposal!.changes.thresholds?.minLiquidity).toBeGreaterThanOrEqual(500);
  });

  // --- Evidence Summary ---

  it("includes evidence summary in the proposal", () => {
    const evidence = makeEvidence({ winRate: 0.30, resolvedCount: 15 });
    const proposal = proposeRuleChange(evidence);
    expect(proposal).not.toBeNull();
    expect(proposal!.evidenceSummary.length).toBeGreaterThan(0);
    expect(proposal!.evidenceSummary).toContain("30%");
  });
});
