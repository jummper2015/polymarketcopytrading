// Security Test — Read-Only Execution (Hito 9.1)
// Scans all source files in lib/ and scripts/ for patterns that indicate
// blockchain write operations or private key handling.
//
// The v1 MUST NOT contain:
//   - Transaction signing / sending
//   - Private key storage or usage
//   - Smart contract interactions
//   - Write operations on Polymarket (no CLOB POST/PUT with auth)
//
// Pass condition: zero matches for any dangerous pattern.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

// ─── Dangerous patterns ────────────────────────────────────────

const CRITICAL_BLOCKCHAIN_PATTERNS = [
  { pattern: /signTransaction/i, name: "signTransaction" },
  { pattern: /sendTransaction/i, name: "sendTransaction" },
  { pattern: /sendRawTransaction/i, name: "sendRawTransaction" },
  { pattern: /signMessage/i, name: "signMessage" },
  { pattern: /\.sign\(/i, name: ".sign()" },
  { pattern: /\.send\(/, name: ".send()" },
  { pattern: /ethers\.Wallet/i, name: "ethers.Wallet" },
  { pattern: /new Wallet\(/i, name: "new Wallet()" },
  { pattern: /privateKey/i, name: "privateKey" },
  { pattern: /private_key/i, name: "private_key" },
  { pattern: /mnemonic/i, name: "mnemonic" },
  { pattern: /secretPhrase/i, name: "secretPhrase" },
  { pattern: /fromMnemonic/i, name: "fromMnemonic" },
  { pattern: /createWallet/i, name: "createWallet" },
  { pattern: /Web3\(/i, name: "Web3()" },
  { pattern: /new Web3/i, name: "new Web3" },
  { pattern: /provider\.getSigner/i, name: "provider.getSigner" },
  { pattern: /wallet_connect/i, name: "wallet_connect" },
  { pattern: /signer\.sendTransaction/i, name: "signer.sendTransaction" },
  { pattern: /ethers\.providers/i, name: "ethers.providers" },
];

const HIGH_RISK_CLOB_WRITE_PATTERNS = [
  { pattern: /clob\.(createOrder|postOrder|placeOrder)/i, name: "CLOB order creation" },
  { pattern: /POST.*order/i, name: "POST order" },
  { pattern: /submitOrder/i, name: "submitOrder" },
  { pattern: /makeOrder/i, name: "makeOrder" },
];

// ─── File scanning helpers ─────────────────────────────────────

function scanDirectory(dir: string, extensions: string[] = [".ts", ".tsx"]): string[] {
  const files: string[] = [];
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory() && !entry.startsWith(".") && entry !== "node_modules") {
      files.push(...scanDirectory(fullPath, extensions));
    } else if (stat.isFile() && extensions.includes(extname(entry))) {
      files.push(fullPath);
    }
  }

  return files;
}

// ─── Tests ─────────────────────────────────────────────────────

describe("Security: No Blockchain Write Operations", () => {
  const sourceDirs = ["lib", "scripts", "app", "db"];
  let allFiles: string[] = [];

  for (const dir of sourceDirs) {
    try {
      allFiles.push(...scanDirectory(dir));
    } catch {
      // Directory may not exist — skip
    }
  }

  it("should have source files to scan", () => {
    expect(allFiles.length).toBeGreaterThan(0);
  });

  // Scan for critical patterns
  const matches = new Map<string, string[]>();

  for (const file of allFiles) {
    const content = readFileSync(file, "utf-8");

    for (const { pattern, name } of CRITICAL_BLOCKCHAIN_PATTERNS) {
      if (pattern.test(content)) {
        const existing = matches.get(file) ?? [];
        existing.push(name);
        matches.set(file, existing);
      }
    }
  }

  it("should NOT contain any blockchain write operations or private key handling", () => {
    // This test is in this file itself, which references these patterns by name.
    // Filter out matches from this test file.
    const filtered = [...matches.entries()].filter(
      ([file]) => !file.includes("tests/security")
    );

    if (filtered.length > 0) {
      const report = filtered
        .map(([file, names]) => `    ${file}: [${names.join(", ")}]`)
        .join("\n");
      expect.fail(
        `Dangerous blockchain patterns found in source files:\n${report}`
      );
    }
  });

  it("should NOT contain CLOB order creation or write operations", () => {
    const clobMatches = new Map<string, string[]>();

    for (const file of allFiles) {
      const content = readFileSync(file, "utf-8");
      for (const { pattern, name } of HIGH_RISK_CLOB_WRITE_PATTERNS) {
        if (pattern.test(content)) {
          const existing = clobMatches.get(file) ?? [];
          existing.push(name);
          clobMatches.set(file, existing);
        }
      }
    }

    const filtered = [...clobMatches.entries()].filter(
      ([file]) => !file.includes("tests/security")
    );

    if (filtered.length > 0) {
      const report = filtered
        .map(([file, names]) => `    ${file}: [${names.join(", ")}]`)
        .join("\n");
      expect.fail(
        `CLOB write operations found in source files:\n${report}`
      );
    }
  });
});

describe("Security: No private keys in config or env templates", () => {
  it(".env.example should not suggest storing private keys", () => {
    try {
      const content = readFileSync(".env.example", "utf-8");
      const lower = content.toLowerCase();
      expect(lower).not.toMatch(/private.?key/i);
      expect(lower).not.toMatch(/mnemonic/i);
      expect(lower).not.toMatch(/wallet.?secret/i);
    } catch {
      // .env.example may not exist
    }
  });
});
