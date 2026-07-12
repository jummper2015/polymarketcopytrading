// Stub — Se implementará en Hito 3 (Fase 3)
// Script que califica operaciones detectadas y genera DecisionJournal.
// Comando: npm run score:trades

import { db } from "../db";

async function main() {
  console.log("[score:trades] Stub — pendiente de implementación (Hito 3)");
  console.log("DB conectada:", !!db);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
