// Shared API client for Polymarket adapters
// Provides fetch wrapper with retry, backoff, and base URL management

// ─── Config ────────────────────────────────────────────────────

export const GAMMA_URL =
  process.env.POLYMARKET_GAMMA_URL || "https://gamma-api.polymarket.com";
export const CLOB_URL =
  process.env.POLYMARKET_CLOB_URL || "https://clob.polymarket.com";
export const DATA_URL =
  process.env.POLYMARKET_DATA_URL || "https://data-api.polymarket.com";

// ─── Types ─────────────────────────────────────────────────────

export interface PolymarketClientOptions {
  /** Max retries on failure (default 3) */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff (default 1000) */
  baseDelayMs?: number;
  /** Timeout per request in ms (default 15000) */
  timeoutMs?: number;
}

// ─── Fetch wrapper ─────────────────────────────────────────────

export async function apiFetch<T = unknown>(
  url: string,
  options: PolymarketClientOptions = {}
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 1000, timeoutMs = 15000 } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "hermes-copybot/1.0",
        },
      });

      clearTimeout(timer);

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        const waitMs = retryAfter
          ? parseInt(retryAfter) * 1000
          : baseDelayMs * Math.pow(2, attempt);
        console.warn(`[hermes] Rate limited (429). Waiting ${waitMs}ms...`);
        await sleep(waitMs);
        continue;
      }

      if (!response.ok) {
        throw new Error(
          `API ${response.status} ${response.statusText} for ${url}`
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on abort/timeout if it's the last attempt
      if (attempt === maxRetries) break;

      const delay = baseDelayMs * Math.pow(2, attempt);
      console.warn(
        `[hermes] Request failed (attempt ${attempt + 1}/${maxRetries + 1}): ${lastError.message}. Retrying in ${delay}ms...`
      );
      await sleep(delay);
    }
  }

  throw new Error(
    `[hermes] API request failed after ${maxRetries + 1} attempts: ${lastError?.message}`
  );
}

// ─── Query builders ────────────────────────────────────────────

export function buildQuery(
  baseUrl: string,
  params: Record<string, string | number | undefined>
): string {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

// ─── Shared Parsers ───────────────────────────────────────────

/** Parse outcome prices from API response (array, JSON string, or fallback) */
export function parseOutcomePrices(
  prices: unknown,
  outcomes: string[]
): number[] {
  if (Array.isArray(prices)) {
    return prices.map((p) => {
      const n = Number(p);
      return isNaN(n) ? 0 : n;
    });
  }
  if (typeof prices === "string") {
    try {
      const parsed = JSON.parse(prices);
      if (Array.isArray(parsed)) {
        return parsed.map((p: unknown) => {
          const n = Number(p);
          return isNaN(n) ? 0 : n;
        });
      }
    } catch {
      // fall through
    }
  }
  return outcomes.map(() => 0);
}

/** Map raw API side/outcome index to "yes" | "no" */
export function mapSide(raw: string): "yes" | "no" {
  const s = raw.toLowerCase();
  if (s === "0" || s === "yes" || s === "y") return "yes";
  if (s === "1" || s === "no" || s === "n") return "no";
  return "yes";
}

// ─── Helpers ───────────────────────────────────────────────────

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
