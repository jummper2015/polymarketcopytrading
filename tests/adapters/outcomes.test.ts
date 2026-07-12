// tests/adapters/outcomes.test.ts
// Unit tests for the Polymarket outcomes adapter

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchMarketResolution,
  fetchResolvedMarketsBatch,
  checkResolutions,
  fetchRecentlyResolved,
  verifyPrediction,
  type ResolvedMarketSummary,
} from "@/lib/adapters/outcomes";

// Make retry delays instant for error/retry tests
vi.mock("@/lib/adapters/client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/adapters/client")>();
  return { ...mod, sleep: vi.fn(() => Promise.resolve()) };
});

// ─── Helpers ───────────────────────────────────────────────────

function mockFetchResponse(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: () => Promise.resolve(data),
    headers: new Headers(),
  } as Response);
}

// ─── Mock Data ─────────────────────────────────────────────────

const RESOLVED_YES_MARKET: Record<string, unknown> = {
  id: "market-yes",
  conditionId: "cond-yes",
  question: "Will X happen?",
  category: "Politics",
  outcomes: ["Yes", "No"],
  outcomePrices: ["1", "0"],
  volume: "100000",
  liquidity: "25000",
  endDate: "2026-06-15T00:00:00Z",
  closed: true,
  resolved: true,
};

const RESOLVED_NO_MARKET: Record<string, unknown> = {
  id: "market-no",
  conditionId: "cond-no",
  question: "Will Y happen?",
  outcomes: ["Yes", "No"],
  outcomePrices: ["0", "1"],
  volume: "50000",
  liquidity: "15000",
  endDate: "2026-06-20T00:00:00Z",
  closed: true,
  resolved: true,
};

const UNRESOLVED_MARKET: Record<string, unknown> = {
  id: "market-open",
  conditionId: "cond-open",
  question: "Will Z happen?",
  outcomes: ["Yes", "No"],
  outcomePrices: ["0.55", "0.45"],
  volume: "30000",
  liquidity: "10000",
  closed: false,
  resolved: false,
};

const CLOSED_UNRESOLVED_MARKET: Record<string, unknown> = {
  id: "market-closed",
  conditionId: "cond-closed",
  question: "Will W happen?",
  outcomes: ["Yes", "No"],
  outcomePrices: ["0", "0"],
  volume: "5000",
  liquidity: "2000",
  closed: true,
  resolved: true,
};

// ─── Tests ─────────────────────────────────────────────────────

describe("fetchMarketResolution", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("delegates to markets.fetchMarketOutcome for a resolved Yes market", async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse(RESOLVED_YES_MARKET));

    const result = await fetchMarketResolution("market-yes");

    expect(result.resolved).toBe(true);
    expect(result.outcome).toBe("Yes");
    expect(result.winningOutcomeIndex).toBe(0);
    expect(result.resolvedTime).toBe(
      new Date("2026-06-15T00:00:00Z").getTime() / 1000
    );
  });

  it("returns unresolved for an open market", async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse(UNRESOLVED_MARKET));

    const result = await fetchMarketResolution("market-open");

    expect(result.resolved).toBe(false);
    expect(result.outcome).toBeNull();
  });
});

describe("fetchResolvedMarketsBatch", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches and filters to only markets with winning outcomes", async () => {
    mockFetch.mockResolvedValueOnce(
      mockFetchResponse([
        RESOLVED_YES_MARKET,
        RESOLVED_NO_MARKET,
        CLOSED_UNRESOLVED_MARKET, // no winning outcome (prices are 0,0)
      ])
    );

    const result = await fetchResolvedMarketsBatch({ limit: 100 });

    // CLOSED_UNRESOLVED_MARKET is filtered out because no winningOutcome
    expect(result.markets).toHaveLength(2);
    expect(result.markets[0].winningOutcome).toBe("Yes");
    expect(result.markets[1].winningOutcome).toBe("No");
    expect(result.total).toBe(2);
  });

  it("maps resolved market fields correctly", async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse([RESOLVED_YES_MARKET]));

    const [market] = (await fetchResolvedMarketsBatch({ limit: 100 })).markets;

    expect(market).toMatchObject({
      marketId: "market-yes",
      conditionId: "cond-yes",
      question: "Will X happen?",
      category: "Politics",
      winningOutcome: "Yes",
      winningOutcomeIndex: 0,
      totalVolume: 100000,
      liquidity: 25000,
    });
    expect(market.resolvedAt).toBe(
      new Date("2026-06-15T00:00:00Z").getTime() / 1000
    );
  });

  it("respects the since filter", async () => {
    // All markets have endDate in 2026
    mockFetch.mockResolvedValueOnce(mockFetchResponse([RESOLVED_YES_MARKET]));

    // Filter with since timestamp AFTER the resolution date
    const farFutureSince = new Date("2027-01-01T00:00:00Z").getTime() / 1000;

    const result = await fetchResolvedMarketsBatch({
      limit: 100,
      since: farFutureSince,
    });

    // All should be filtered out because resolution is before "since"
    expect(result.markets).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("paginates across multiple pages", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      ...RESOLVED_YES_MARKET,
      id: `market-${i}`,
      conditionId: `cond-${i}`,
    }));

    mockFetch
      .mockResolvedValueOnce(mockFetchResponse(page1))
      .mockResolvedValueOnce(mockFetchResponse([]));

    const result = await fetchResolvedMarketsBatch({ limit: 200 });

    // 100 from page 1, 0 from page 2, capped at 200
    expect(result.markets).toHaveLength(100);
  });

  it("handles snake_case field names", async () => {
    mockFetch.mockResolvedValueOnce(
      mockFetchResponse([
        {
          id: "m1",
          condition_id: "c1",
          title: "Snake case market",
          outcomes: ["Yes", "No"],
          outcome_prices: ["1", "0"],
          liquidityNum: 5000,
          volumeNum: 25000,
          end_date: "2026-05-01T00:00:00Z",
          closed: true,
        },
      ])
    );

    const [market] = (await fetchResolvedMarketsBatch({ limit: 100 })).markets;

    expect(market.question).toBe("Snake case market");
    expect(market.conditionId).toBe("c1");
    expect(market.winningOutcome).toBe("Yes");
    expect(market.liquidity).toBe(5000);
  });
});

describe("checkResolutions", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("checks a batch of market IDs and returns resolved ones", async () => {
    mockFetch
      .mockResolvedValueOnce(mockFetchResponse(RESOLVED_YES_MARKET))    // market-1
      .mockResolvedValueOnce(mockFetchResponse(UNRESOLVED_MARKET))       // market-2
      .mockResolvedValueOnce(mockFetchResponse(RESOLVED_NO_MARKET));     // market-3

    const result = await checkResolutions(["market-1", "market-2", "market-3"]);

    // market-2 is unresolved so filtered out
    expect(result).toHaveLength(2);
    expect(result[0].winningOutcome).toBe("Yes");
    expect(result[1].winningOutcome).toBe("No");
  });

  it("skips markets that throw errors (sleep mocked for instant retry)", async () => {
    // sleep is mocked to resolve instantly (see vi.mock above)
    mockFetch
      .mockResolvedValueOnce(mockFetchResponse(RESOLVED_YES_MARKET)) // market-a
      .mockRejectedValueOnce(new Error("Not found"))                  // market-b
      .mockResolvedValueOnce(mockFetchResponse(RESOLVED_NO_MARKET)); // market-c

    const result = await checkResolutions(["market-a", "market-b", "market-c"]);

    // market-b is silently skipped
    expect(result).toHaveLength(2);
  }, 10000);
});

describe("fetchRecentlyResolved", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("filters to markets resolved within N hours", async () => {
    const now = Math.floor(Date.now() / 1000);
    const recentTime = new Date((now - 3600) * 1000).toISOString(); // 1 hour ago
    const oldTime = new Date((now - 72 * 3600) * 1000).toISOString(); // 72 hours ago

    mockFetch.mockResolvedValueOnce(
      mockFetchResponse([
        {
          ...RESOLVED_YES_MARKET,
          id: "recent",
          endDate: recentTime,
        },
        {
          ...RESOLVED_YES_MARKET,
          id: "old",
          endDate: oldTime,
        },
      ])
    );

    const result = await fetchRecentlyResolved(24, 100);

    // Only the recent market (within 24h) should be included
    expect(result).toHaveLength(1);
    expect(result[0].marketId).toBe("recent");
  });

  it("excludes markets without winning outcomes", async () => {
    const now = Math.floor(Date.now() / 1000);
    const recentTime = new Date((now - 3600) * 1000).toISOString();

    mockFetch.mockResolvedValueOnce(
      mockFetchResponse([
        {
          id: "no-winner",
          endDate: recentTime,
          outcomes: ["Yes", "No"],
          outcomePrices: ["0", "0"],
          closed: true,
        },
      ])
    );

    const result = await fetchRecentlyResolved(24);
    expect(result).toHaveLength(0);
  });
});

describe("verifyPrediction", () => {
  function makeResolution(winningOutcome: string): ResolvedMarketSummary {
    return {
      marketId: "test",
      conditionId: "test-c",
      question: "Test?",
      winningOutcome,
      winningOutcomeIndex: winningOutcome === "Yes" ? 0 : 1,
      resolvedAt: Date.now() / 1000,
      totalVolume: 10000,
      liquidity: 5000,
    };
  }

  it("confirms correct Yes prediction", () => {
    const result = verifyPrediction("Yes", "yes", makeResolution("Yes"));
    expect(result.correct).toBe(true);
    expect(result.profit).toBe(1.0);
  });

  it("confirms correct No prediction", () => {
    const result = verifyPrediction("No", "no", makeResolution("No"));
    expect(result.correct).toBe(true);
    expect(result.profit).toBe(1.0);
  });

  it("detects incorrect prediction (predicted Yes, No won)", () => {
    const result = verifyPrediction("Yes", "yes", makeResolution("No"));
    expect(result.correct).toBe(false);
    expect(result.profit).toBe(0);
  });

  it("marks prediction incorrect when side is wrong for binary market", () => {
    // Bet "no" on a market where "Yes" won = incorrect prediction
    const result = verifyPrediction("Yes", "no", makeResolution("Yes"));
    expect(result.correct).toBe(false);
    expect(result.profit).toBe(0);
  });

  it("returns null profit for unresolved market", () => {
    const unresolved: ResolvedMarketSummary = {
      ...makeResolution("Yes"),
      winningOutcome: null,
    };
    const result = verifyPrediction("Yes", "yes", unresolved);
    expect(result.correct).toBe(false);
    expect(result.profit).toBeNull();
  });

  it("is case-insensitive for outcome matching", () => {
    const result = verifyPrediction("yes", "yes", makeResolution("Yes"));
    expect(result.correct).toBe(true);
  });
});
