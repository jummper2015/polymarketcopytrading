// Stub — Se implementará en Hito 9 (Fase 9)
// Script que popula la base de datos con datos demo etiquetados como [DEMO].
// Comando: npm run seed

import { db } from "../db";

async function main() {
  console.log("[seed] Stub — pendiente de implementación (Hito 9)");
  console.log("DB conectada:", !!db);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
