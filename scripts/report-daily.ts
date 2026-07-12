// Stub — Se implementará en Hito 6 (Fase 6)
// Script que genera el reporte diario y lo envía por Telegram.
// Comando: npm run report:daily

import { db } from "../db";

async function main() {
  console.log("[report:daily] Stub — pendiente de implementación (Hito 6)");
  console.log("DB conectada:", !!db);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
