"use server";

import {
  runBacktest,
  compareStrategies,
  type BacktestResult,
  type StrategyComparison,
} from "@/lib/backtesting/engine";

export async function runSingleBacktest(
  walletAddress: string,
  days: number,
  positionSize: number,
  checkOutcomes: boolean
): Promise<{ success: true; result: BacktestResult } | { success: false; error: string }> {
  try {
    const endDate = new Date();
    const startDate = new Date(
      endDate.getTime() - days * 24 * 60 * 60 * 1000
    );

    const result = await runBacktest({
      walletAddress,
      startDate,
      endDate,
      positionSize,
      checkOutcomes,
    });

    return { success: true, result };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error running backtest";
    return { success: false, error: message };
  }
}

export async function runCompareBacktest(
  wallets: string[],
  days: number,
  positionSize: number
): Promise<
  { success: true; comparison: StrategyComparison } | { success: false; error: string }
> {
  try {
    const comparison = await compareStrategies(wallets, days, positionSize);
    return { success: true, comparison };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error running comparison";
    return { success: false, error: message };
  }
}
