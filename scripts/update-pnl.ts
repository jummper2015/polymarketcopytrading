// Stub — Se implementará en Hito 4 (Fase 4)
// Script que actualiza el PnL de operaciones simuladas abiertas cada hora.
// Comando: npm run paper:update-pnl

import { db } from "../db";

async function main() {
  console.log("[paper:update-pnl] Stub — pendiente de implementación (Hito 4)");
  console.log("DB conectada:", !!db);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
