"use client";

import { useState, useCallback } from "react";
import {
  FlaskConical,
  TrendingUp,
  DollarSign,
  Target,
  AlertTriangle,
  ClipboardList,
  Trophy,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/ui/status-dot";
import { ScoreBar } from "@/components/ui/score-bar";
import { PnlChart, type PnlDataPoint } from "@/components/charts/pnl-chart";
import {
  runSingleBacktest,
  runCompareBacktest,
} from "@/app/backtesting/actions";
import type { BacktestResult, BacktestTrade, StrategyComparison } from "@/lib/backtesting/engine";

// ─── Types ─────────────────────────────────────────────────────

interface KnownWallet {
  address: string;
  label?: string;
  status: string;
  globalScore: number;
}

interface BacktestPageProps {
  knownWallets: KnownWallet[];
}

type Mode = "single" | "compare";
type RunState = "idle" | "loading" | "success" | "error";

// ─── Helpers ───────────────────────────────────────────────────

function fmtPct(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function truncAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function statusBadge(status: string) {
  const map: Record<string, "success" | "warning" | "danger"> = {
    track: "success",
    watch: "warning",
    ignore: "danger",
  };
  return map[status] ?? "neutral";
}

/** Build cumulative PnL data points from backtest trades sorted by timestamp */
function buildPnlData(trades: BacktestTrade[]): PnlDataPoint[] {
  const sorted = [...trades].sort(
    (a, b) => a.original.timestamp - b.original.timestamp
  );
  let cumulative = 0;
  const points: PnlDataPoint[] = [];
  for (const t of sorted) {
    cumulative += t.pnl;
    const date = new Date(t.original.timestamp * 1000);
    points.push({
      date: `${date.getMonth() + 1}/${date.getDate()}`,
      pnl: Math.round(cumulative * 100) / 100,
    });
  }
  return points;
}

// ─── Component ─────────────────────────────────────────────────

export function BacktestPage({ knownWallets }: BacktestPageProps) {
  // Form state
  const [mode, setMode] = useState<Mode>("single");
  const [wallet, setWallet] = useState("");
  const [compareWallets, setCompareWallets] = useState("");
  const [days, setDays] = useState(30);
  const [positionSize, setPositionSize] = useState(10);
  const [checkOutcomes, setCheckOutcomes] = useState(true);

  // Results state
  const [runState, setRunState] = useState<RunState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [comparison, setComparison] = useState<StrategyComparison | null>(null);

  const handleRun = useCallback(async () => {
    setRunState("loading");
    setErrorMsg("");
    setResult(null);
    setComparison(null);

    if (mode === "single") {
      const addr = wallet.trim();
      if (!addr) {
        setErrorMsg("Please enter a wallet address.");
        setRunState("error");
        return;
      }
      const res = await runSingleBacktest(addr, days, positionSize, checkOutcomes);
      if (res.success) {
        setResult(res.result);
        setRunState("success");
      } else {
        setErrorMsg(res.error);
        setRunState("error");
      }
    } else {
      const addrs = compareWallets
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean);
      if (addrs.length < 2) {
        setErrorMsg("Please enter at least 2 wallet addresses for comparison.");
        setRunState("error");
        return;
      }
      const res = await runCompareBacktest(addrs, days, positionSize);
      if (res.success) {
        setComparison(res.comparison);
        setRunState("success");
      } else {
        setErrorMsg(res.error);
        setRunState("error");
      }
    }
  }, [mode, wallet, compareWallets, days, positionSize, checkOutcomes]);

  const handleWalletSelect = (addr: string) => {
    setWallet(addr);
  };

  // ── Render ──────────────────────────────────────────────────

  const pnlData = result ? buildPnlData(result.trades) : [];

  return (
    <div className="animate-fade-in space-y-6">
      {/* Page header */}
      <div className="page-header">
        <h2 className="flex items-center gap-2">
          <FlaskConical className="size-6 text-purple-400" />
          Backtesting
        </h2>
        <p>
          Simula copy trading histórico para cualquier wallet de Polymarket.
          Consulta APIs públicas en tiempo real — los resultados pueden tardar unos segundos.
        </p>
      </div>

      {/* ── Configuration Card ──────────────────────────────── */}
      <Card title="Configuration" icon={<FlaskConical className="size-5 text-purple-400" />} subtitle="Set backtest parameters and run">
        <div className="space-y-5">
          {/* Mode toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setMode("single"); setResult(null); setComparison(null); setRunState("idle"); }}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                mode === "single"
                  ? "bg-brand-500/15 text-brand-400 border border-brand-500/30"
                  : "bg-surface-800/40 text-surface-400 border border-transparent hover:text-surface-300"
              }`}
            >
              Single Wallet
            </button>
            <button
              onClick={() => { setMode("compare"); setResult(null); setComparison(null); setRunState("idle"); }}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                mode === "compare"
                  ? "bg-brand-500/15 text-brand-400 border border-brand-500/30"
                  : "bg-surface-800/40 text-surface-400 border border-transparent hover:text-surface-300"
              }`}
            >
              Compare Wallets
            </button>
          </div>

          {/* Single wallet form */}
          {mode === "single" && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-surface-400 uppercase tracking-wider mb-1.5">
                  Wallet Address
                </label>
                <input
                  type="text"
                  value={wallet}
                  onChange={(e) => setWallet(e.target.value)}
                  placeholder="0x..."
                  className="w-full bg-surface-800/50 border border-surface-700/50 rounded-lg px-3 py-2 text-sm text-surface-200 placeholder:text-surface-600 focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/20 font-mono"
                />
              </div>
              {/* Known wallets dropdown */}
              {knownWallets.length > 0 && (
                <div>
                  <label className="block text-xs text-surface-500 uppercase tracking-wider mb-1.5">
                    Or pick a tracked wallet
                  </label>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                    {knownWallets.slice(0, 30).map((w) => {
                      const sb = statusBadge(w.status);
                      return (
                        <button
                          key={w.address}
                          onClick={() => handleWalletSelect(w.address)}
                          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-mono transition-colors border ${
                            wallet === w.address
                              ? "bg-brand-500/15 text-brand-400 border-brand-500/30"
                              : "bg-surface-800/60 text-surface-400 border-surface-700/40 hover:text-surface-300 hover:border-surface-600"
                          }`}
                          title={`${w.label ?? truncAddr(w.address)} — Score: ${w.globalScore.toFixed(2)}`}
                        >
                          <StatusDot
                            variant={sb === "success" ? "active" : sb === "warning" ? "watch" : "inactive"}
                            size="sm"
                          />
                          {w.label ?? truncAddr(w.address)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Compare form */}
          {mode === "compare" && (
            <div>
              <label className="block text-xs text-surface-400 uppercase tracking-wider mb-1.5">
                Wallet Addresses (comma-separated)
              </label>
              <textarea
                value={compareWallets}
                onChange={(e) => setCompareWallets(e.target.value)}
                placeholder="0xAAA..., 0xBBB..., 0xCCC..."
                rows={3}
                className="w-full bg-surface-800/50 border border-surface-700/50 rounded-lg px-3 py-2 text-sm text-surface-200 placeholder:text-surface-600 focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/20 font-mono resize-none"
              />
            </div>
          )}

          {/* Common parameters */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-surface-400 uppercase tracking-wider mb-1.5">
                Period (days)
              </label>
              <input
                type="number"
                value={days}
                onChange={(e) => setDays(Math.max(1, Math.min(365, parseInt(e.target.value) || 30)))}
                min={1}
                max={365}
                className="w-full bg-surface-800/50 border border-surface-700/50 rounded-lg px-3 py-2 text-sm text-surface-200 focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/20"
              />
            </div>
            <div>
              <label className="block text-xs text-surface-400 uppercase tracking-wider mb-1.5">
                Position Size ($)
              </label>
              <input
                type="number"
                value={positionSize}
                onChange={(e) => setPositionSize(Math.max(1, parseFloat(e.target.value) || 10))}
                min={1}
                step={1}
                className="w-full bg-surface-800/50 border border-surface-700/50 rounded-lg px-3 py-2 text-sm text-surface-200 focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/20"
              />
            </div>
            {mode === "single" && (
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checkOutcomes}
                    onChange={(e) => setCheckOutcomes(e.target.checked)}
                    className="w-4 h-4 rounded border-surface-600 bg-surface-800 text-brand-500 focus:ring-brand-500/30 cursor-pointer"
                  />
                  <span className="text-xs text-surface-400">Check outcomes</span>
                </label>
              </div>
            )}
          </div>

          {/* Run button */}
          <button
            onClick={handleRun}
            disabled={runState === "loading"}
            className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
              runState === "loading"
                ? "bg-surface-700 text-surface-500 cursor-wait"
                : "bg-brand-500 text-white hover:bg-brand-600 active:scale-[0.98] shadow-lg shadow-brand-500/20"
            }`}
          >
            {runState === "loading" ? (
              <span className="inline-flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Running backtest...
              </span>
            ) : mode === "single" ? (
              "Run Backtest"
            ) : (
              "Compare Wallets"
            )}
          </button>
        </div>
      </Card>

      {/* ── Error State ─────────────────────────────────────── */}
      {runState === "error" && (
        <Card title="Error" icon={<AlertTriangle className="size-5 text-red-400" />}>
          <p className="text-sm text-red-400">{errorMsg}</p>
          <p className="text-xs text-surface-500 mt-2">
            The backtest queries Polymarket's public APIs. Make sure the wallet
            address is valid and has recent trading activity.
          </p>
        </Card>
      )}

      {/* ── Empty / No results ──────────────────────────────── */}
      {result && result.totalTrades === 0 && (
        <Card title="No Trades Found" icon={<XCircle className="size-5 text-surface-400" />}>
          <p className="text-sm text-surface-400">
            No trades found for <span className="font-mono text-surface-300">{truncAddr(result.walletAddress)}</span> in
            the last {days} days. Try a longer period or a different wallet.
          </p>
        </Card>
      )}

      {/* ── Single Wallet Results ───────────────────────────── */}
      {result && result.totalTrades > 0 && (
        <div className="space-y-5">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card compact>
              <p className="text-[10px] text-surface-400 uppercase tracking-wider flex items-center gap-1">
                <DollarSign className="size-3" /> Total PnL
              </p>
              <p className={`text-lg font-bold tabular-nums ${result.totalPnl >= 0 ? "text-brand-400" : "text-red-400"}`}>
                {result.totalPnl >= 0 ? "+" : ""}${result.totalPnl.toFixed(2)}
              </p>
              <p className="text-[10px] text-surface-500 mt-0.5">
                {result.totalTrades} trades · ${result.totalInvested.toFixed(0)} invested
              </p>
            </Card>
            <Card compact>
              <p className="text-[10px] text-surface-400 uppercase tracking-wider flex items-center gap-1">
                <TrendingUp className="size-3" /> ROI
              </p>
              <p className={`text-lg font-bold tabular-nums ${result.roi >= 0 ? "text-brand-400" : "text-red-400"}`}>
                {fmtPct(result.roi)}
              </p>
              <ScoreBar value={result.roi > 0 ? Math.min(result.roi * 5, 1) : 0} size="sm" className="mt-1.5" />
            </Card>
            <Card compact>
              <p className="text-[10px] text-surface-400 uppercase tracking-wider flex items-center gap-1">
                <Target className="size-3" /> Win Rate
              </p>
              <p className="text-lg font-bold tabular-nums text-surface-50">
                {fmtPct(result.winRate)}
              </p>
              <p className="text-[10px] text-surface-500 mt-0.5">
                {result.winningTrades}W / {result.losingTrades}L of {result.resolvedTrades} resolved
              </p>
            </Card>
            <Card compact>
              <p className="text-[10px] text-surface-400 uppercase tracking-wider flex items-center gap-1">
                <Activity className="size-3" /> Max Drawdown
              </p>
              <p className="text-lg font-bold tabular-nums text-red-400">
                {fmtPct(Math.abs(result.maxDrawdown))}
              </p>
              <p className="text-[10px] text-surface-500 mt-0.5">
                PF: {result.profitFactor.toFixed(2)} · Sharpe: {result.sharpeRatio.toFixed(2)}
              </p>
            </Card>
          </div>

          {/* PnL Chart */}
          {pnlData.length > 0 && (
            <Card title="Cumulative PnL" subtitle={`${truncAddr(result.walletAddress)} · ${result.startDate} → ${result.endDate}`} icon={<TrendingUp className="size-5 text-brand-400" />}>
              <PnlChart data={pnlData} />
            </Card>
          )}

          {/* Trade table */}
          <Card title="Trade Details" subtitle={`Showing ${Math.min(25, result.trades.length)} of ${result.trades.length} trades`} icon={<ClipboardList className="size-5 text-brand-400" />}>
            {result.trades.length === 0 ? (
              <p className="text-sm text-surface-500 py-4">No trades to display.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-700/50">
                      <th className="table-header">Market</th>
                      <th className="table-header">Side</th>
                      <th className="table-header text-right">Entry</th>
                      <th className="table-header text-right">Pos</th>
                      <th className="table-header text-right">PnL</th>
                      <th className="table-header text-center">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.trades.slice(0, 25).map((t, i) => {
                      const pnlSign = t.pnl >= 0 ? "+" : "";
                      const marketId = t.original.marketId.slice(0, 20);
                      return (
                        <tr key={i} className="border-b border-surface-700/20 hover:bg-surface-800/30 transition-colors">
                          <td className="table-cell font-mono text-[11px] text-surface-400 max-w-[180px] truncate" title={t.original.marketId}>
                            {marketId}...
                          </td>
                          <td className="table-cell">
                            <Badge variant={t.side === "yes" ? "success" : "danger"}>
                              {t.side.toUpperCase()}
                            </Badge>
                          </td>
                          <td className="table-cell text-right font-mono text-surface-300">
                            ${t.entryPrice.toFixed(4)}
                          </td>
                          <td className="table-cell text-right font-mono text-surface-400 text-[11px]">
                            ${t.positionSize.toFixed(0)}
                          </td>
                          <td className={`table-cell text-right font-mono font-semibold tabular-nums ${t.pnl >= 0 ? "text-brand-400" : "text-red-400"}`}>
                            {pnlSign}${t.pnl.toFixed(2)}
                          </td>
                          <td className="table-cell text-center">
                            {t.resolved ? (
                              t.won ? (
                                <Badge variant="success" icon={<CheckCircle2 className="size-3" />}>Win</Badge>
                              ) : (
                                <Badge variant="danger" icon={<XCircle className="size-3" />}>Loss</Badge>
                              )
                            ) : (
                              <Badge variant="neutral" icon={<Clock className="size-3" />}>Open</Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {result.trades.length > 25 && (
                  <p className="text-xs text-surface-500 mt-2 text-center">
                    ...and {result.trades.length - 25} more trades
                  </p>
                )}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ── Comparison Results ──────────────────────────────── */}
      {comparison && comparison.results.length > 0 && (
        <div className="space-y-5">
          {/* Comparison summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card compact>
              <p className="text-[10px] text-surface-400 uppercase tracking-wider flex items-center gap-1">
                <Trophy className="size-3 text-brand-400" /> Best Wallet
              </p>
              <p className="text-sm font-mono text-brand-400 mt-1">
                {truncAddr(comparison.best!.walletAddress)}
              </p>
              <p className="text-xs text-surface-500">
                +${comparison.best!.totalPnl.toFixed(2)} · {fmtPct(comparison.best!.roi)}
              </p>
            </Card>
            <Card compact>
              <p className="text-[10px] text-surface-400 uppercase tracking-wider flex items-center gap-1">
                <XCircle className="size-3 text-red-400" /> Worst Wallet
              </p>
              <p className="text-sm font-mono text-red-400 mt-1">
                {truncAddr(comparison.worst!.walletAddress)}
              </p>
              <p className="text-xs text-surface-500">
                {comparison.worst!.totalPnl >= 0 ? "+" : ""}${comparison.worst!.totalPnl.toFixed(2)} · {fmtPct(comparison.worst!.roi)}
              </p>
            </Card>
            <Card compact>
              <p className="text-[10px] text-surface-400 uppercase tracking-wider flex items-center gap-1">
                <TrendingUp className="size-3" /> Avg ROI
              </p>
              <p className={`text-lg font-bold tabular-nums ${comparison.averageRoi >= 0 ? "text-brand-400" : "text-red-400"}`}>
                {fmtPct(comparison.averageRoi)}
              </p>
              <p className="text-[10px] text-surface-500 mt-0.5">
                Across {comparison.results.length} wallets
              </p>
            </Card>
            <Card compact>
              <p className="text-[10px] text-surface-400 uppercase tracking-wider flex items-center gap-1">
                <Target className="size-3" /> Avg Win Rate
              </p>
              <p className="text-lg font-bold tabular-nums text-surface-50">
                {fmtPct(comparison.averageWinRate)}
              </p>
              <p className="text-[10px] text-surface-500 mt-0.5">
                {comparison.startDate} → {comparison.endDate}
              </p>
            </Card>
          </div>

          {/* Comparison table */}
          <Card title="Wallet Comparison" subtitle="Sorted by total PnL" icon={<Trophy className="size-5 text-amber-400" />}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-700/50">
                    <th className="table-header">#</th>
                    <th className="table-header">Wallet</th>
                    <th className="table-header text-right">Trades</th>
                    <th className="table-header text-right">Win/Loss</th>
                    <th className="table-header text-right">PnL</th>
                    <th className="table-header text-right">ROI</th>
                    <th className="table-header text-right">WR</th>
                    <th className="table-header text-right">Max DD</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.results.map((r, i) => {
                    const isBest = i === 0;
                    const isWorst = i === comparison.results.length - 1;
                    return (
                      <tr
                        key={r.walletAddress}
                        className={`border-b border-surface-700/20 hover:bg-surface-800/30 transition-colors ${
                          isBest ? "bg-brand-500/5" : isWorst ? "bg-red-500/5" : ""
                        }`}
                      >
                        <td className="table-cell">
                          <span className={`font-mono text-xs font-semibold ${
                            isBest ? "text-brand-400" : isWorst ? "text-red-400" : "text-surface-500"
                          }`}>
                            {i + 1}
                          </span>
                        </td>
                        <td className="table-cell font-mono text-[11px] text-surface-300">
                          {truncAddr(r.walletAddress)}
                        </td>
                        <td className="table-cell text-right font-mono text-surface-300">
                          {r.totalTrades}
                        </td>
                        <td className="table-cell text-right">
                          <span className="font-mono text-xs text-surface-400">
                            {r.winningTrades}W / {r.losingTrades}L
                          </span>
                        </td>
                        <td className={`table-cell text-right font-mono font-semibold tabular-nums ${r.totalPnl >= 0 ? "text-brand-400" : "text-red-400"}`}>
                          {r.totalPnl >= 0 ? "+" : ""}${r.totalPnl.toFixed(2)}
                        </td>
                        <td className={`table-cell text-right font-mono tabular-nums ${r.roi >= 0 ? "text-brand-400" : "text-red-400"}`}>
                          {fmtPct(r.roi)}
                        </td>
                        <td className="table-cell text-right font-mono text-surface-300">
                          {fmtPct(r.winRate)}
                        </td>
                        <td className="table-cell text-right font-mono text-red-400">
                          {fmtPct(Math.abs(r.maxDrawdown))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
