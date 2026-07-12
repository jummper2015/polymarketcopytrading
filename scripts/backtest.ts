// Stub — Se implementará en Hito 8 (Fase 8)
// Script que ejecuta backtesting para una billetera y período dados.
// Comando: npm run backtest

import { db } from "../db";

async function main() {
  console.log("[backtest] Stub — pendiente de implementación (Hito 8)");
  console.log("DB conectada:", !!db);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
