// tests/adapters/markets.test.ts
// Unit tests for the Polymarket markets adapter (Gamma + CLOB APIs)

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchMarketData,
  fetchMarketByToken,
  fetchOrderBook,
  fetchCurrentPrice,
  fetchPriceHistory,
  fetchMarketOutcome,
  fetchMarketsByCondition,
  fetchResolvedMarkets,
  fetchActiveMarkets,
  type MarketData,
  type OrderBookSummary,
} from "@/lib/adapters/markets";

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

// ─── Mock Market Data ──────────────────────────────────────────

const MOCK_MARKET: Record<string, unknown> = {
  id: "market-123",
  conditionId: "cond-456",
  question: "Will ETH be above $5000 by end of 2026?",
  description: "Prediction market for ETH price",
  category: "Crypto",
  tags: ["ethereum", "price"],
  outcomes: ["Yes", "No"],
  outcomePrices: ["0.65", "0.35"],
  clobTokenIds: [
    "token-yes-123",
    "token-no-456",
  ],
  liquidity: "50000",
  volume: "250000",
  endDate: "2026-12-31T23:59:59Z",
  closed: false,
  resolved: false,
};

const MOCK_ORDER_BOOK = {
  bids: [
    { price: "0.64", size: "1000" },
    { price: "0.63", size: "500" },
  ],
  asks: [
    { price: "0.66", size: "800" },
    { price: "0.67", size: "1200" },
  ],
};

// ─── Tests ─────────────────────────────────────────────────────

describe("fetchMarketData", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches and maps full market data", async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse(MOCK_MARKET));

    const result = await fetchMarketData("market-123");

    expect(result).toMatchObject({
      id: "market-123",
      conditionId: "cond-456",
      question: "Will ETH be above $5000 by end of 2026?",
      category: "Crypto",
      outcomes: ["Yes", "No"],
      outcomePrices: [0.65, 0.35],
      clobTokenIds: ["token-yes-123", "token-no-456"],
      yesPrice: 0.65,
      noPrice: 0.35,
      liquidity: 50000,
      volume: 250000,
      closed: false,
      resolved: false,
    });
  });

  it("calls the correct Gamma API URL", async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse(MOCK_MARKET));

    await fetchMarketData("market-123");

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("gamma-api.polymarket.com");
    expect(url).toContain("/markets/market-123");
  });

  it("handles snake_case API field names", async () => {
    mockFetch.mockResolvedValueOnce(
      mockFetchResponse({
        id: "m1",
        condition_id: "c1",
        question: "Test?",
        outcomes: ["Yes", "No"],
        outcome_prices: ["0.7", "0.3"],
        clob_token_ids: ["t1", "t2"],
        liquidityNum: 3000,
        volumeNum: 15000,
      })
    );

    const result = await fetchMarketData("m1");

    expect(result.conditionId).toBe("c1");
    expect(result.outcomePrices).toEqual([0.7, 0.3]);
    expect(result.clobTokenIds).toEqual(["t1", "t2"]);
    expect(result.liquidity).toBe(3000);
  });

  it("handles missing optional fields with defaults", async () => {
    mockFetch.mockResolvedValueOnce(
      mockFetchResponse({
        id: "bare",
        conditionId: "bare-c",
        question: "Minimal market",
      })
    );

    const result = await fetchMarketData("bare");

    expect(result.outcomes).toEqual(["Yes", "No"]);
    expect(result.outcomePrices).toEqual([0, 0]);
    expect(result.clobTokenIds).toEqual([]);
    expect(result.liquidity).toBe(0);
    expect(result.volume).toBe(0);
    expect(result.bestBid).toBeNull();
    expect(result.bestAsk).toBeNull();
    expect(result.spread).toBeNull();
    expect(result.endDate).toBeNull();
  });

  it("uses closed as fallback for resolved when field absent", async () => {
    // When `resolved` is absent/undefined, the code falls back to `closed`
    // But `false` is not nullish, so it won't be replaced by `??`
    // This test verifies the actual behavior: explicit `resolved: false` stays false
    const { closed: _, resolved: __, ...withoutResolved } = MOCK_MARKET;
    mockFetch.mockResolvedValueOnce(
      mockFetchResponse({ ...withoutResolved, closed: true })
    );

    const result = await fetchMarketData("m1");
    // resolved absent → falls back to closed (true)
    expect(result.resolved).toBe(true);
  });
});

describe("fetchMarketByToken", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetchs market data by CLOB token ID", async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse([MOCK_MARKET]));

    const result = await fetchMarketByToken("token-yes-123");

    expect(result.id).toBe("market-123");
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("clob_token_id=token-yes-123");
  });

  it("throws when no market found for token", async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse([]));

    await expect(
      fetchMarketByToken("nonexistent")
    ).rejects.toThrow(/No market found/);
  });
});

describe("fetchOrderBook", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calculates bestBid, bestAsk, spread from order book", async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse(MOCK_ORDER_BOOK));

    const result = await fetchOrderBook("token-1");

    expect(result.bestBid).toBe(0.64);
    expect(result.bestAsk).toBe(0.66);
    expect(result.spread).toBeCloseTo(0.02);
    expect(result.bidSize).toBe(1500); // 1000 + 500
    expect(result.askSize).toBe(2000); // 800 + 1200
  });

  it("returns null spread when order book is empty", async () => {
    mockFetch.mockResolvedValueOnce(
      mockFetchResponse({ bids: [], asks: [] })
    );

    const result = await fetchOrderBook("token-1");

    expect(result.bestBid).toBeNull();
    expect(result.bestAsk).toBeNull();
    expect(result.spread).toBeNull();
    expect(result.bidSize).toBe(0);
    expect(result.askSize).toBe(0);
  });

  it("handles missing bids/asks arrays", async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse({}));

    const result = await fetchOrderBook("token-1");

    expect(result.bestBid).toBeNull();
    expect(result.bestAsk).toBeNull();
    expect(result.spread).toBeNull();
  });
});

describe("fetchCurrentPrice", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the current buy price as a number", async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse({ price: "0.72" }));

    const price = await fetchCurrentPrice("token-1");
    expect(price).toBe(0.72);
  });
});

describe("fetchPriceHistory", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps price history with t/p keys", async () => {
    mockFetch.mockResolvedValueOnce(
      mockFetchResponse([
        { t: 1700000000, p: 0.55 },
        { t: 1700003600, p: 0.58 },
        { t: 1700007200, p: 0.62 },
      ])
    );

    const result = await fetchPriceHistory("token-1");
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ timestamp: 1700000000, price: 0.55 });
  });

  it("also accepts timestamp/price keys", async () => {
    mockFetch.mockResolvedValueOnce(
      mockFetchResponse([
        { timestamp: 1700000000, price: 0.7 },
      ])
    );

    const result = await fetchPriceHistory("token-1");
    expect(result[0]).toEqual({ timestamp: 1700000000, price: 0.7 });
  });
});

describe("fetchMarketOutcome", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns unresolved outcome for open markets", async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse(MOCK_MARKET));

    const result = await fetchMarketOutcome("market-123");

    expect(result.resolved).toBe(false);
    expect(result.outcome).toBeNull();
    expect(result.winningOutcomeIndex).toBeNull();
  });

  it("detects resolved market with Yes winning", async () => {
    mockFetch.mockResolvedValueOnce(
      mockFetchResponse({
        ...MOCK_MARKET,
        resolved: true,
        closed: true,
        outcomePrices: ["1", "0"],
      })
    );

    const result = await fetchMarketOutcome("market-123");

    expect(result.resolved).toBe(true);
    expect(result.outcome).toBe("Yes");
    expect(result.winningOutcomeIndex).toBe(0);
  });

  it("detects resolved market with No winning", async () => {
    mockFetch.mockResolvedValueOnce(
      mockFetchResponse({
        ...MOCK_MARKET,
        resolved: true,
        closed: true,
        outcomePrices: ["0", "1"],
      })
    );

    const result = await fetchMarketOutcome("market-123");

    expect(result.outcome).toBe("No");
    expect(result.winningOutcomeIndex).toBe(1);
  });
});

describe("fetchMarketsByCondition", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches markets filtered by condition ID", async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse([MOCK_MARKET]));

    const result = await fetchMarketsByCondition("cond-456");

    expect(result).toHaveLength(1);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("condition_id=cond-456");
  });
});

describe("fetchResolvedMarkets", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches closed/resolved markets with pagination", async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse([MOCK_MARKET]));

    const result = await fetchResolvedMarkets({ limit: 50, offset: 0 });

    expect(result).toHaveLength(1);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("closed=true");
    expect(url).toContain("order=end_date");
  });
});

describe("fetchActiveMarkets", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches active markets with optional category and tag filters", async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse([MOCK_MARKET]));

    const result = await fetchActiveMarkets({
      category: "Crypto",
      tag: "ethereum",
      limit: 20,
    });

    expect(result).toHaveLength(1);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("closed=false");
    expect(url).toContain("category=Crypto");
    expect(url).toContain("tag=ethereum");
  });

  it("works without optional filters", async () => {
    mockFetch.mockResolvedValueOnce(mockFetchResponse([]));

    const result = await fetchActiveMarkets();

    expect(result).toHaveLength(0);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("closed=false");
  });
});
