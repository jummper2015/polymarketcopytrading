// Stub — Se implementará en Hito 4 (Fase 4)
// Script que revisa resultados de mercados resueltos y crea OutcomeReview.
// Comando: npm run review:outcomes

import { db } from "../db";

async function main() {
  console.log("[review:outcomes] Stub — pendiente de implementación (Hito 4)");
  console.log("DB conectada:", !!db);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
