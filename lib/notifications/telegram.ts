// Telegram Notification Integration — Hito 6.2
// Sends daily reports, alerts, and messages via the Telegram Bot API.
// Uses native fetch (Node 20+) — no external dependencies.
//
// Environment variables:
//   TELEGRAM_BOT_TOKEN — Bot token from @BotFather
//   TELEGRAM_CHAT_ID   — Target chat/group/channel ID
//
// If either is missing, all functions silently return { ok: false }
// without throwing errors — the system degrades gracefully.

import {
  type DailyReportData,
  formatReportForTelegram,
  markReportSent,
} from "@/lib/reports/daily-report";

// ─── Types ─────────────────────────────────────────────────────

/** Result of sending a Telegram message */
export interface TelegramResult {
  ok: boolean;
  /** Error message if ok=false */
  error?: string;
  /** Telegram message ID if ok=true */
  messageId?: number;
}

/** Severity levels for alerts */
export type AlertSeverity = "info" | "warning" | "critical" | "success";

/** Structured alert event */
export interface AlertEvent {
  /** Short title for the alert */
  title: string;
  /** Detailed message body */
  message: string;
  /** Severity level */
  severity: AlertSeverity;
  /** Optional metadata (shown in code block) */
  metadata?: Record<string, string | number | boolean>;
}

/** Options for sendMessage */
export interface SendMessageOptions {
  /** Parse mode: "HTML" or "MarkdownV2" (default: "MarkdownV2") */
  parseMode?: "HTML" | "MarkdownV2";
  /** Disable notification sound (default: false) */
  disableNotification?: boolean;
  /** Disable link previews (default: true for reports) */
  disableWebPagePreview?: boolean;
}

// ─── Configuration ─────────────────────────────────────────────

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "";
const TELEGRAM_API_BASE = "https://api.telegram.org";

/**
 * Check whether Telegram integration is configured.
 * Both TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set.
 */
export function isTelegramConfigured(): boolean {
  return TELEGRAM_BOT_TOKEN.length > 0 && TELEGRAM_CHAT_ID.length > 0;
}

// ─── Core: Send Message ────────────────────────────────────────

/**
 * Send a raw text message to the configured Telegram chat.
 *
 * This is the low-level function. Use sendDailyReport() or sendAlert()
 * for structured messages.
 *
 * @param text - The message text (supports MarkdownV2 or HTML based on parseMode)
 * @param options - Optional formatting/notification settings
 * @returns TelegramResult with ok, optional messageId or error
 */
export async function sendMessage(
  text: string,
  options: SendMessageOptions = {}
): Promise<TelegramResult> {
  if (!isTelegramConfigured()) {
    return { ok: false, error: "Telegram not configured — set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID" };
  }

  const url = `${TELEGRAM_API_BASE}/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: options.parseMode ?? "MarkdownV2",
        disable_notification: options.disableNotification ?? false,
        disable_web_page_preview: options.disableWebPagePreview ?? true,
      }),
    });

    const data = (await response.json()) as {
      ok: boolean;
      result?: { message_id: number };
      description?: string;
    };

    if (!data.ok) {
      const error = data.description ?? `HTTP ${response.status}`;
      console.error(`[telegram] Failed to send message: ${error}`);

      // If MarkdownV2 parsing fails, retry without parse_mode
      if (error.includes("can't parse entities") && options.parseMode !== "HTML") {
        console.log("[telegram] Retrying with HTML parse mode...");
        return sendMessage(escapeHtml(text), {
          ...options,
          parseMode: "HTML",
        });
      }

      return { ok: false, error };
    }

    return { ok: true, messageId: data.result?.message_id };
  } catch (err) {
    const error = (err as Error).message;
    console.error(`[telegram] Network error: ${error}`);
    return { ok: false, error };
  }
}

// ─── Send Daily Report ─────────────────────────────────────────

/**
 * Send the daily report to the configured Telegram chat.
 *
 * Uses formatReportForTelegram() to produce a clean Markdown message,
 * then marks the report as sent in the database.
 *
 * @param report - The DailyReportData from generateDailyReport()
 * @returns TelegramResult
 */
export async function sendDailyReport(
  report: DailyReportData
): Promise<TelegramResult> {
  if (!isTelegramConfigured()) {
    console.log("[telegram] Skipping daily report — Telegram not configured");
    return { ok: false, error: "Telegram not configured" };
  }

  // formatReportForTelegram() already produces valid MarkdownV2.
  // Dynamic content (addresses, labels) is numeric/hex — no special chars to escape.
  const text = formatReportForTelegram(report);

  // Truncate if over Telegram's 4096 char limit
  const truncated =
    text.length > 4000
      ? text.slice(0, 3997) + "\n\n_...truncated_"
      : text;

  const result = await sendMessage(truncated, {
    parseMode: "MarkdownV2",
    disableNotification: false,
    disableWebPagePreview: true,
  });

  // Mark report as sent regardless of result (best-effort)
  if (result.ok) {
    try {
      await markReportSent(report.date);
    } catch (err) {
      console.error(`[telegram] Failed to mark report sent: ${(err as Error).message}`);
    }
  }

  return result;
}

// ─── Send Alert ────────────────────────────────────────────────

const SEVERITY_EMOJI: Record<AlertSeverity, string> = {
  info: "ℹ️",
  warning: "⚠️",
  critical: "🚨",
  success: "✅",
};

/**
 * Send an alert/event notification to the configured Telegram chat.
 *
 * Use for important events: rule changes, PnL milestones, errors, etc.
 * Alerts are formatted with severity indicators and optional metadata.
 *
 * @param event - The alert event with title, message, severity, and optional metadata
 * @returns TelegramResult
 */
export async function sendAlert(
  event: AlertEvent
): Promise<TelegramResult> {
  if (!isTelegramConfigured()) {
    console.log(`[telegram] Skipping alert "${event.title}" — Telegram not configured`);
    return { ok: false, error: "Telegram not configured" };
  }

  const emoji = SEVERITY_EMOJI[event.severity];
  const lines: string[] = [];

  // Header
  lines.push(`${emoji} *${escapeMarkdownV2(event.title)}*`);
  lines.push("");

  // Message body
  lines.push(escapeMarkdownV2(event.message));

  // Metadata section
  if (event.metadata && Object.keys(event.metadata).length > 0) {
    lines.push("");
    lines.push("*Details:*");
    for (const [key, value] of Object.entries(event.metadata)) {
      // Keys need escaping since they appear outside code blocks.
      // Values are inside `code` blocks — Telegram treats those as literal,
      // so no escaping needed (avoids showing visible backslashes).
      const escapedKey = escapeMarkdownV2(key);
      lines.push(`  • ${escapedKey}: \`${value}\``);
    }
  }

  // Footer
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  lines.push("");
  lines.push(`_🤖 MESIRVE Alert \\| ${now}_`);

  const text = lines.join("\n");

  return sendMessage(text, {
    parseMode: "MarkdownV2",
    disableNotification: event.severity !== "critical",
    disableWebPagePreview: true,
  });
}

// ─── Convenience Alert Helpers ─────────────────────────────────

/**
 * Send a rule change notification.
 */
export async function sendRuleChangeAlert(
  fromVersion: string,
  toVersion: string,
  reason: string
): Promise<TelegramResult> {
  return sendAlert({
    title: "Rules Updated",
    message: `MESIRVE has auto\\-updated the trading rules based on recent performance evidence\\.`,
    severity: "info",
    metadata: {
      From: fromVersion,
      To: toVersion,
      Reason: reason,
    },
  });
}

/**
 * Send a PnL milestone alert.
 */
export async function sendPnlAlert(
  milestone: number,
  currentPnl: number
): Promise<TelegramResult> {
  const crossed = currentPnl >= milestone ? "above" : "below";
  return sendAlert({
    title: `PnL ${currentPnl >= 0 ? "Milestone" : "Warning"}`,
    message: `Paper portfolio PnL has crossed ${crossed} $${milestone.toFixed(2)}\\.`,
    severity: currentPnl >= 0 ? "success" : "warning",
    metadata: {
      "Current PnL": `$${currentPnl.toFixed(2)}`,
      Milestone: `$${milestone.toFixed(2)}`,
    },
  });
}

/**
 * Send an error alert for critical issues.
 */
export async function sendErrorAlert(
  context: string,
  error: Error
): Promise<TelegramResult> {
  return sendAlert({
    title: "Error Detected",
    message: `An error occurred in *${escapeMarkdownV2(context)}*:\n\n\`${escapeMarkdownV2(error.message)}\``,
    severity: "critical",
    metadata: {
      Context: context,
      Stack: error.stack?.split("\n").slice(0, 3).join(" | ") ?? "N/A",
    },
  });
}

// ─── MarkdownV2 Escaping ───────────────────────────────────────

/**
 * Escape special characters for Telegram's MarkdownV2 format.
 *
 * Telegram MarkdownV2 requires escaping: _ * [ ] ( ) ~ ` > # + - = | { } . !
 * Characters inside code blocks (`...`) or code spans are NOT escaped.
 *
 * This function uses a simple regex-based approach — for complex content
 * with mixed formatting, use HTML parse_mode instead.
 */
export function escapeMarkdownV2(text: string): string {
  // Escape all Telegram MarkdownV2 special characters.
  // Note: the hyphen must be escaped (\-) to avoid acting as a range operator
  // inside the character class, e.g. [+\-=] would match \ through =.
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, "\\$1");
}

/**
 * Escape special characters for Telegram's HTML format.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ─── Health Check ──────────────────────────────────────────────

/**
 * Test the Telegram connection by sending a brief message.
 * Returns true if the bot can successfully reach the API.
 */
export async function testTelegramConnection(): Promise<TelegramResult> {
  if (!isTelegramConfigured()) {
    return { ok: false, error: "Telegram not configured" };
  }

  return sendMessage("✅ *MESIRVE Bot* is online and connected\\.", {
    parseMode: "MarkdownV2",
    disableNotification: true,
  });
}
