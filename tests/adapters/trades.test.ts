// tests/adapters/trades.test.ts
// Unit tests for the Polymarket trades adapter

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchRecentTrades,
  fetchTradeHistory,
  fetchTradeAggregateStats,
  type TradeData,
} from "@/lib/adapters/trades";

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

const MOCK_TRADE = (i: number): Record<string, unknown> => ({
  transactionHash: `0xhash${i}`,
  conditionId: `cond_${i}`,
  condition_id: `cond_${i}`,
  question: `Will market ${i} resolve Yes?`,
  title: `Market ${i}`,
  category: i % 2 === 0 ? "Politics" : "Crypto",
  outcome: i % 2 === 0 ? "Yes" : "No",
  side: i % 2 === 0 ? "yes" : "no",
  price: 0.5 + i * 0.01,
  size: 100 + i * 25,
  timestamp: Math.floor(Date.now() / 1000) - i * 7200,
  type: i % 3 === 0 ? "sell" : "buy",
  fee: 0.002,
});

// ─── Tests ─────────────────────────────────────────────────────

describe("fetchRecentTrades", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches and maps recent trades", async () => {
    const trades = Array.from({ length: 5 }, (_, i) => MOCK_TRADE(i));
    mockFetch.mockResolvedValueOnce(mockFetchResponse(trades));

    const result = await fetchRecentTrades("0xwallet");

    expect(result).toHaveLength(5);
    expect(result[0]).toMatchObject({
      id: "0xhash0",
      txHash: "0xhash0",
      marketId: "cond_0",
      conditionId: "cond_0",
      side: "yes",
      price: 0.5,
      size: 100,
      value: 50, // price * size
      type: "sell", // 0 % 3 === 0
    });
  });

  it("calls the correct URL with wallet address", async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse([]));

    await fetchRecentTrades("0xabc", { limit: 50 });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("data-api.polymarket.com");
    expect(url).toContain("/trades");
    expect(url).toContain("user=0xabc");
    expect(url).toContain("limit=50");
  });

  it("defaults to limit 100", async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse([]));

    await fetchRecentTrades("0xabc");

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("limit=100");
  });

  it("maps side correctly (yes/no → yes/no)", async () => {
    mockFetch.mockResolvedValueOnce(
      mockFetchResponse([
        { ...MOCK_TRADE(0), side: "yes" },
        { ...MOCK_TRADE(0), side: "no" },
        { ...MOCK_TRADE(0), side: "0" },
      ])
    );

    const result = await fetchRecentTrades("0xabc");
    expect(result[0].side).toBe("yes");
    expect(result[1].side).toBe("no");
    expect(result[2].side).toBe("yes"); // 0 → yes
  });

  it("computes value as price * size", async () => {
    mockFetch.mockResolvedValueOnce(
      mockFetchResponse([{ price: 0.75, size: 400, timestamp: 1000 }])
    );

    const result = await fetchRecentTrades("0xabc");
    expect(result[0].value).toBe(300); // 0.75 * 400
  });

  it("handles missing optional fields", async () => {
    mockFetch.mockResolvedValueOnce(
      mockFetchResponse([{ price: 0.5, size: 100, timestamp: 1000 }])
    );

    const result = await fetchRecentTrades("0xabc");
    expect(result[0]).toMatchObject({
      id: undefined,
      txHash: undefined,
      marketId: "",
      side: "yes",
      type: "buy",
    });
  });
});

describe("fetchTradeHistory", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches from both /trades and /activity endpoints", async () => {
    const tradesData = [
      { transactionHash: "tx1", conditionId: "c1", price: 0.5, size: 100, timestamp: Date.now() / 1000 - 3600, type: "buy", side: "yes" },
    ];
    const activityData = [
      { transactionHash: "tx2", conditionId: "c2", price: 0.6, size: 200, timestamp: Date.now() / 1000 - 7200, type: "trade", side: "no" },
    ];

    // Two calls: /trades then /activity
    mockFetch
      .mockResolvedValueOnce(mockFetchResponse(tradesData))
      .mockResolvedValueOnce(mockFetchResponse(activityData));

    const result = await fetchTradeHistory("0xabc", 7, { limit: 200 });

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("tx1");
    expect(result[1].id).toBe("tx2");
  });

  it("deduplicates trades from both endpoints", async () => {
    const now = Date.now() / 1000;
    const sharedTrade = {
      transactionHash: "same-tx",
      conditionId: "c1",
      price: 0.5,
      size: 100,
      timestamp: now - 3600,
      type: "buy",
      side: "yes",
    };

    mockFetch
      .mockResolvedValueOnce(mockFetchResponse([sharedTrade]))
      .mockResolvedValueOnce(mockFetchResponse([sharedTrade]));

    const result = await fetchTradeHistory("0xabc", 7);
    expect(result).toHaveLength(1);
  });

  it("filters trades outside the time window", async () => {
    const now = Math.floor(Date.now() / 1000);

    mockFetch
      .mockResolvedValueOnce(
        mockFetchResponse([
          { transactionHash: "recent", conditionId: "c1", price: 0.5, size: 100, timestamp: now - 3600, type: "buy", side: "yes" },
          { transactionHash: "old", conditionId: "c2", price: 0.5, size: 100, timestamp: now - 40 * 86400, type: "buy", side: "yes" },
        ])
      )
      .mockResolvedValueOnce(mockFetchResponse([]));

    const result = await fetchTradeHistory("0xabc", 30);
    expect(result).toHaveLength(1);
    expect(result[0].txHash).toBe("recent");
  });

  it("handles one endpoint failing gracefully (sleep mocked for instant retry)", async () => {
    // sleep is mocked to resolve instantly (see vi.mock above)
    const now = Date.now() / 1000;
    const tradesData = [
      { transactionHash: "tx1", conditionId: "c1", price: 0.5, size: 100, timestamp: now - 3600, type: "buy", side: "yes" },
    ];

    // /trades succeeds, /activity fails
    mockFetch
      .mockResolvedValueOnce(mockFetchResponse(tradesData))
      .mockRejectedValueOnce(new Error("Network error"));

    const result = await fetchTradeHistory("0xabc", 7);
    expect(result).toHaveLength(1);
    expect(result[0].txHash).toBe("tx1");
  }, 10000);

  it("filters non-trade activity types from the activity endpoint", async () => {
    const now = Date.now() / 1000;

    mockFetch
      .mockResolvedValueOnce(mockFetchResponse([]))
      .mockResolvedValueOnce(
        mockFetchResponse([
          { transactionHash: "tx1", conditionId: "c1", price: 0.5, size: 100, timestamp: now - 3600, type: "trade", side: "yes" },
          { transactionHash: "sp1", conditionId: "c2", price: 0.5, size: 100, timestamp: now - 7200, type: "split", side: "yes" },
        ])
      );

    const result = await fetchTradeHistory("0xabc", 7);
    expect(result).toHaveLength(1);
    expect(result[0].txHash).toBe("tx1");
  });
});

describe("fetchTradeAggregateStats", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("computes aggregate stats from trade history", async () => {
    const now = Math.floor(Date.now() / 1000);

    const trades = [
      { transactionHash: "tx1", conditionId: "c1", price: 0.5, size: 100, timestamp: now - 3600, type: "buy", side: "yes", category: "Politics" },
      { transactionHash: "tx2", conditionId: "c2", price: 0.6, size: 200, timestamp: now - 7200, type: "buy", side: "no", category: "Crypto" },
      { transactionHash: "tx3", conditionId: "c1", price: 0.55, size: 150, timestamp: now - 10800, type: "sell", side: "yes", category: "Politics" },
    ];

    // /trades + /activity (empty)
    mockFetch
      .mockResolvedValueOnce(mockFetchResponse(trades))
      .mockResolvedValueOnce(mockFetchResponse([]));

    const result = await fetchTradeAggregateStats("0xabc", 7);

    expect(result.totalTrades).toBe(3);
    expect(result.totalVolume).toBeCloseTo(252.5); // 0.5*100 + 0.6*200 + 0.55*150
    expect(result.averageTradeSize).toBeCloseTo(252.5 / 3);
    expect(result.buyRatio).toBeCloseTo(2 / 3);
    expect(result.uniqueMarkets).toBe(2); // c1, c2
    expect(result.categories).toEqual({ Politics: 2, Crypto: 1 });
  });

  it("returns zeros for empty trade history", async () => {
    mockFetch
      .mockResolvedValueOnce(mockFetchResponse([]))
      .mockResolvedValueOnce(mockFetchResponse([]));

    const result = await fetchTradeAggregateStats("0xabc", 7);

    expect(result.totalTrades).toBe(0);
    expect(result.totalVolume).toBe(0);
    expect(result.averageTradeSize).toBe(0);
    expect(result.buyRatio).toBe(0);
    expect(result.uniqueMarkets).toBe(0);
  });
});
