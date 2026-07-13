import { db } from "@/db";
import { walletProfiles } from "@/db/schema";
import { desc } from "drizzle-orm";
import { BacktestPage } from "./backtest-page";

export const dynamic = "force-dynamic";

export default async function BacktestingRoute() {
  // Fetch known wallets for the dropdown
  const wallets = await db
    .select({
      address: walletProfiles.address,
      label: walletProfiles.label,
      status: walletProfiles.status,
      globalScore: walletProfiles.globalScore,
    })
    .from(walletProfiles)
    .orderBy(desc(walletProfiles.globalScore))
    .limit(100);

  return (
    <BacktestPage
      knownWallets={wallets.map((w) => ({
        address: w.address,
        label: w.label ?? undefined,
        status: w.status,
        globalScore: w.globalScore ?? 0,
      }))}
    />
  );
}
