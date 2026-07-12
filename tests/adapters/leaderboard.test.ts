// tests/adapters/leaderboard.test.ts
// Unit tests for the Polymarket leaderboard adapter

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchLeaderboard,
  fetchWalletActivity,
  fetchWalletPositions,
  fetchWalletActivitySummary,
  type LeaderboardEntry,
  type WalletActivityItem,
  type WalletPosition,
} from "@/lib/adapters/leaderboard";

// Make retry delays instant for error/retry tests
vi.mock("@/lib/adapters/client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/adapters/client")>();
  return { ...mod, sleep: vi.fn(() => Promise.resolve()) };
});

// ─── Helpers ───────────────────────────────────────────────────

function mockFetchResponse(data: unknown, status = 200, statusText = "OK") {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: () => Promise.resolve(data),
    headers: new Headers(),
  } as Response);
}

function mockFetchError(status: number, statusText: string) {
  return Promise.resolve({
    ok: false,
    status,
    statusText,
    json: () => Promise.resolve({}),
    headers: new Headers(),
  } as Response);
}

// ─── Mock Data ─────────────────────────────────────────────────

const MOCK_LEADERBOARD_ENTRY = (i: number) => ({
  user: `0xwallet${i}`,
  rank: i + 1,
  name: `Trader ${i}`,
  pnl: 1500 - i * 30,
  volume: 50000 - i * 1000,
  roi: 0.45 - i * 0.01,
  tradeCount: 120 - i * 2,
  winRate: 0.62 - i * 0.005,
});

const MOCK_ACTIVITY_ITEM = (i: number) => ({
  transactionHash: `0xtx${i}`,
  timestamp: Math.floor(Date.now() / 1000) - i * 3600,
  type: i % 3 === 0 ? "split" : "trade",
  conditionId: `cond_${i}`,
  title: `Will event ${i} happen?`,
  outcome: i % 2 === 0 ? "Yes" : "No",
  side: i % 2 === 0 ? "0" : "1",
  price: 0.55 + i * 0.01,
  size: 100 + i * 10,
});

const MOCK_POSITION = (i: number) => ({
  conditionId: `cond_${i}`,
  title: `Position market ${i}`,
  outcome: i % 2 === 0 ? "Yes" : "No",
  outcomeIndex: i % 2 === 0 ? "0" : "1",
  avgPrice: 0.45,
  currentPrice: 0.55,
  size: 200,
  value: 110,
  realizedPnl: i % 3 === 0 ? 25 : -10,
});

// ─── Tests ─────────────────────────────────────────────────────

describe("fetchLeaderboard", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches a single page of leaderboard entries", async () => {
    const entries = Array.from({ length: 30 }, (_, i) => MOCK_LEADERBOARD_ENTRY(i));
    mockFetch.mockResolvedValueOnce(mockFetchResponse(entries));

    const result = await fetchLeaderboard(50);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("data-api.polymarket.com");
    expect(calledUrl).toContain("/v1/leaderboard");
    expect(calledUrl).toContain("category=OVERALL");
    expect(calledUrl).toContain("timePeriod=ALL");
    expect(calledUrl).toContain("orderBy=PNL");

    expect(result).toHaveLength(30);
    expect(result[0]).toMatchObject({
      address: "0xwallet0",
      rank: 1,
      label: "Trader 0",
      roi: 0.45,
    });
  });

  it("maps API fields correctly (user → address, name → label)", async () => {
    mockFetch.mockResolvedValueOnce(
      mockFetchResponse([{ user: "0xabc", rank: 1, name: "Alpha", pnl: 500, roi: 0.3, tradeCount: 50, winRate: 0.7 }])
    );

    const result = await fetchLeaderboard(50);
    expect(result[0]).toEqual({
      address: "0xabc",
      rank: 1,
      label: "Alpha",
      pnl: 500,
      volume: undefined,
      roi: 0.3,
      tradeCount: 50,
      winRate: 0.7,
    });
  });

  it("paginates when limit exceeds page size", async () => {
    const page1 = Array.from({ length: 50 }, (_, i) => MOCK_LEADERBOARD_ENTRY(i));
    const page2 = Array.from({ length: 50 }, (_, i) => MOCK_LEADERBOARD_ENTRY(i + 50));
    const page3 = Array.from({ length: 50 }, (_, i) => MOCK_LEADERBOARD_ENTRY(i + 100));

    mockFetch
      .mockResolvedValueOnce(mockFetchResponse(page1))
      .mockResolvedValueOnce(mockFetchResponse(page2))
      .mockResolvedValueOnce(mockFetchResponse(page3));

    const result = await fetchLeaderboard(150);

    expect(mockFetch).toHaveBeenCalledTimes(3);
    // Check pagination offsets
    expect(mockFetch.mock.calls[0][0]).toContain("offset=0");
    expect(mockFetch.mock.calls[1][0]).toContain("offset=50");
    expect(mockFetch.mock.calls[2][0]).toContain("offset=100");

    expect(result).toHaveLength(150);
    expect(result[0].address).toBe("0xwallet0");
    expect(result[50].address).toBe("0xwallet50");
    expect(result[100].address).toBe("0xwallet100");
  });

  it("stops paginating when fewer results than page size are returned", async () => {
    const page1 = Array.from({ length: 30 }, (_, i) => MOCK_LEADERBOARD_ENTRY(i));
    mockFetch.mockResolvedValueOnce(mockFetchResponse(page1));

    const result = await fetchLeaderboard(200);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(30);
  });

  it("handles empty leaderboard response", async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse([]));
    const result = await fetchLeaderboard(50);
    expect(result).toHaveLength(0);
  });

  it("handles entries with missing optional fields", async () => {
    mockFetch.mockResolvedValueOnce(
      mockFetchResponse([{ user: "0xminimal", rank: 1 }])
    );

    const result = await fetchLeaderboard(50);
    expect(result[0]).toMatchObject({
      address: "0xminimal",
      rank: 1,
      label: undefined,
      pnl: undefined,
      roi: undefined,
    });
  });

  it("respects custom timePeriod and category options", async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse([]));

    await fetchLeaderboard(50, { timePeriod: "WEEK", category: "SPORTS" });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("timePeriod=WEEK");
    expect(url).toContain("category=SPORTS");
  });

  it("throws after exhausting retries on API error", async () => {
    // sleep is mocked to resolve instantly (see vi.mock above)
    mockFetch.mockResolvedValue(mockFetchError(500, "Internal Server Error"));

    await expect(fetchLeaderboard(50)).rejects.toThrow(/API request failed/);
  }, 10000);
});

describe("fetchWalletActivity", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches and maps wallet activity", async () => {
    const items = Array.from({ length: 5 }, (_, i) => MOCK_ACTIVITY_ITEM(i));
    mockFetch.mockResolvedValueOnce(mockFetchResponse(items));

    const result = await fetchWalletActivity("0xabc");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(5);
    expect(result[0]).toMatchObject({
      id: "0xtx0",
      type: "split", // 0 % 3 === 0
      marketId: "cond_0",
      side: "yes", // "0" maps to "yes"
      price: 0.55,
      size: 100,
    });
  });

  it("maps outcome index to side correctly", async () => {
    mockFetch.mockResolvedValueOnce(
      mockFetchResponse([{ transactionHash: "0x1", timestamp: 1000, side: "1", price: 0.5, size: 50 }])
    );

    const result = await fetchWalletActivity("0xabc");
    expect(result[0].side).toBe("no");
  });

  it("handles missing optional fields gracefully", async () => {
    mockFetch.mockResolvedValueOnce(
      mockFetchResponse([{ timestamp: 1000 }])
    );

    const result = await fetchWalletActivity("0xabc");
    expect(result[0]).toMatchObject({
      id: undefined,
      type: "trade",
      side: undefined,
      price: undefined,
      size: undefined,
    });
  });
});

describe("fetchWalletPositions", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches and maps wallet positions", async () => {
    const positions = Array.from({ length: 3 }, (_, i) => MOCK_POSITION(i));
    mockFetch.mockResolvedValueOnce(mockFetchResponse(positions));

    const result = await fetchWalletPositions("0xabc");

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      marketId: "cond_0",
      side: "yes",
      avgPrice: 0.45,
      currentPrice: 0.55,
      size: 200,
      value: 110,
      realizedPnl: 25,
    });
  });

  it("handles positions without realized PnL", async () => {
    mockFetch.mockResolvedValueOnce(
      mockFetchResponse([{ conditionId: "c1", outcome: "Yes", avgPrice: 0.3, size: 100 }])
    );

    const result = await fetchWalletPositions("0xabc");
    expect(result[0].realizedPnl).toBeUndefined();
    expect(result[0].value).toBe(0);
  });
});

describe("fetchWalletActivitySummary", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("computes aggregate summary from activity and positions", async () => {
    const now = Math.floor(Date.now() / 1000);
    const activityItems = Array.from({ length: 10 }, (_, i) => ({
      transactionHash: `0x${i}`,
      timestamp: now - i * 3600, // within last 10 hours
      type: "trade",
      conditionId: `cond_${i}`,
      price: 0.5,
      size: 100 + i * 10,
      side: "0",
    }));
    const positions = Array.from({ length: 5 }, (_, i) => ({
      conditionId: `cond_${i}`,
      outcome: "Yes",
      outcomeIndex: "0",
      avgPrice: 0.4 + i * 0.05,
      currentPrice: 0.5,
      size: 200,
      value: 100,
      realizedPnl: (i % 2 === 0 ? 1 : -1) * (20 + i * 5),
    }));

    // First call: activity, second: positions
    mockFetch
      .mockResolvedValueOnce(mockFetchResponse(activityItems))
      .mockResolvedValueOnce(mockFetchResponse(positions));

    const result = await fetchWalletActivitySummary("0xabc", 30);

    expect(result.tradeCount).toBe(10);
    expect(result.resolvedTradeCount).toBe(5); // all have realizedPnl
    expect(result.winRate).toBe(3 / 5); // 3 positive PnLs out of 5
    expect(result.totalVolume).toBeGreaterThan(0);
    expect(result.averageTradeSize).toBeGreaterThan(0);
    expect(result.roiEstimate).not.toBeNull();
  });

  it("returns winRate 0 when no positions have resolved", async () => {
    mockFetch
      .mockResolvedValueOnce(mockFetchResponse([]))
      .mockResolvedValueOnce(
        mockFetchResponse([{ conditionId: "c1", outcome: "Yes", avgPrice: 0.3, size: 100 }])
      );

    const result = await fetchWalletActivitySummary("0xabc", 30);
    expect(result.winRate).toBe(0);
    expect(result.resolvedTradeCount).toBe(0);
    expect(result.roiEstimate).toBeNull();
  });

  it("filters trades older than lookback period", async () => {
    const now = Math.floor(Date.now() / 1000);
    const oldTimestamp = now - 40 * 86400; // 40 days ago
    const recentTimestamp = now - 3600; // 1 hour ago

    mockFetch
      .mockResolvedValueOnce(
        mockFetchResponse([
          { transactionHash: "old", timestamp: oldTimestamp, type: "trade", price: 0.3, size: 100, side: "0" },
          { transactionHash: "recent", timestamp: recentTimestamp, type: "trade", price: 0.5, size: 200, side: "0" },
        ])
      )
      .mockResolvedValueOnce(mockFetchResponse([]));

    const result = await fetchWalletActivitySummary("0xabc", 30);
    expect(result.tradeCount).toBe(1);
    expect(result.recentTrades[0].id).toBe("recent");
  });
});
