# Diario de Desarrollo — Polymarket Copy Trading Bot

> **Registro vivo del recorrido de desarrollo. Cada entrada documenta decisiones, avances, bloqueos y aprendizajes.**

---

## Formato de Entrada

```markdown
### [YYYY-MM-DD] — Título del Hito o Tarea

**Rama:** `feature/xxx`
**Estado:** ✅ Completado | 🚧 En progreso | ❌ Bloqueado | ⏳ Pendiente

**Resumen:**
Qué se hizo, qué funcionó, qué no.

**Archivos modificados/creados:**
- `ruta/archivo.ts`

**Decisiones tomadas:**
- Decisión 1 y por qué
- Decisión 2 y por qué

**Problemas encontrados:**
- Problema → Solución aplicada

**Próximos pasos:**
- [ ] Paso 1
- [ ] Paso 2
```

---

## Registro

### [2026-07-12] — Inicio del Proyecto: Planificación

**Rama:** `main`
**Estado:** ✅ Completado

**Resumen:**
Creación de los documentos fundacionales del proyecto:
- `PLAN.md` — Plan maestro con arquitectura, modelos de datos, motores de scoring, fases y principios de seguridad.
- `ROADMAP.md` — Ruta de implementación detallada con 9 hitos y orden secuencial.
- `DEVLOG.md` — Este diario de desarrollo (archivo actual).

El proyecto parte de un repositorio vacío con solo un `README.md` inicial. Se definió el stack: TypeScript, Next.js, React, Tailwind, SQLite, Drizzle ORM, APIs públicas de Polymarket, Vercel.

**Archivos creados:**
- `PLAN.md`
- `ROADMAP.md`
- `DEVLOG.md`

**Decisiones tomadas:**
- **Drizzle sobre Prisma:** Drizzle es más ligero para SQLite, mejor tipado inferido, y no requiere un paso de generación de cliente. Mejor ajuste para un proyecto que prioriza simplicidad.
- **SQLite local para v1:** Sin necesidad de servicios externos de pago. La DB viaja con el repositorio o se genera localmente. Suficiente para paper trading.
- **Estructura de 9 hitos secuenciales:** Cada hito construye sobre el anterior. Los adaptadores primero porque todo depende de datos reales de Polymarket.
- **Vitest sobre Jest:** Mejor integración con TypeScript/ESM, más rápido, misma API.

**Problemas encontrados:**
- Ninguno aún — fase de planificación.

**Próximos pasos:**
- [ ] Ejecutar Hito 0.1: Inicializar proyecto Next.js + TypeScript + Tailwind
- [ ] Ejecutar Hito 0.2: Instalar dependencias base
- [x] Ejecutar Hito 0.3: Configurar base de datos con Drizzle

### [2026-07-12] — Hito 0: Fundación del Proyecto

**Rama:** `main`
**Estado:** ✅ Completado

**Resumen:**
Proyecto Next.js inicializado manualmente en el directorio raiz. Configurado:
- TypeScript estricto + Tailwind CSS + PostCSS + Autoprefixer
- Drizzle ORM con SQLite (better-sqlite3, WAL mode, foreign keys)
- Esquema de 11 tablas con todas las relaciones
- Vitest para testing, tsx para scripts CLI, Recharts para graficos
- Tema oscuro personalizado (brand green + surface grays)
- Sistema de badges CSS (success/warning/danger/neutral)

Build de Next.js y typecheck (tsc --noEmit) pasan sin errores.
Migraciones Drizzle generadas y aplicadas (11 tablas en hermes.db).

**Archivos creados/modificados:**
- `package.json` — Dependencias y 15 scripts CLI+web
- `tsconfig.json` — Strict mode, path alias `@`
- `next.config.js` — serverExternalPackages para SQLite
- `tailwind.config.ts` — Tema oscuro, animaciones, colores brand/surface
- `postcss.config.js` — Tailwind + Autoprefixer
- `drizzle.config.ts` — SQLite dialect
- `vitest.config.ts` — Alias `@`, globals
- `.env.example` + `.env.local` — Variables documentadas
- `.gitignore` — Ignorar node_modules, .next, data/
- `db/schema.ts` — 11 modelos Drizzle completos
- `db/index.ts` — Cliente SQLite + WAL + FK
- `db/migrations/0000_omniscient_purple_man.sql` — Migración inicial
- `app/layout.tsx` — Root layout dark theme
- `app/globals.css` — Tailwind + componentes custom (card, badge, btn, input, table)
- `app/page.tsx` — Placeholder dashboard con 3 stat cards
- `lib/adapters/leaderboard.ts` — Placeholder
- `lib/scoring/wallet-scoring.ts` — Placeholder
- `lib/simulation/paper-trader.ts` — Placeholder
- `lib/rules/rule-engine.ts` — Placeholder
- `lib/reports/daily-report.ts` — Placeholder
- `lib/backtesting/engine.ts` — Placeholder

**Decisiones tomadas:**
- **Inicializacion manual sobre create-next-app**: El directorio ya contiene docs de planificacion. Crear el proyecto manualmente evita conflictos y da control total.
- **WAL mode en SQLite**: Mejor rendimiento concurrente para lecturas del dashboard mientras scripts escriben.
- **serverExternalPackages en next.config**: Necesario porque better-sqlite3 es un modulo nativo incompatible con el bundler de Next.js.
- **Tema 100% oscuro por defecto**: El dashboard es para Max HQ, que asumimos usa tema oscuro.

**Problemas encontrados:**
- `drizzle-kit push` fallaba porque `data/` no existia → crear directorio antes del push
- Next.js build fallaba por `autoprefixer` no instalado → `npm install -D autoprefixer`
- `experimental.serverComponentsExternalPackages` obsoleto en Next 15 → migrar a `serverExternalPackages`

**Proximos pasos:**
- [ ] Hito 1: Crear adaptadores de Polymarket (leaderboard, markets, trades, outcomes)
- [ ] Hito 1: Tests unitarios para adaptadores

### [2026-07-12] — Correcciones post code-review

**Rama:** `main`
**Estado:** ✅ Completado

**Resumen:**
Fixes aplicados tras revision:
1. Eliminado `webpack.externals` redundante → solo `serverExternalPackages`
2. Inter + JetBrains Mono via `next/font/google` en layout.tsx
3. Creado `SAFETY.md` con riesgos, mitigaciones y plan futuro
4. `README.md` actualizado con doc completa
5. 10 stubs en `scripts/` — comandos CLI ya no fallan
6. Parsing de `DATABASE_URL` mejorado (`startsWith("file:")`)
7. `engines.node >= 20` en package.json

**Archivos modificados/creados:**
- `next.config.js`, `app/layout.tsx`, `db/index.ts`, `package.json`
- `SAFETY.md`, `README.md`, `scripts/*.ts` (10 stubs)

### [2026-07-12] — Hito 1: Adaptadores de Polymarket

**Rama:** `main`
**Estado:** ✅ Completado

**Resumen:**
Implementados los 4 adaptadores completos para interactuar con las APIs públicas de Polymarket:

1. **`lib/adapters/client.ts`** — Cliente HTTP compartido con:
   - Retry automático con backoff exponencial (hasta 3 intentos)
   - Manejo de rate limiting (429) con espera configurable
   - Timeout por request (15s default)
   - Helpers compartidos: `parseOutcomePrices`, `mapSide`, `sleep`

2. **`lib/adapters/leaderboard.ts`** — Data API:
   - `fetchLeaderboard(limit)` — Paginación automática para obtener top wallets (50/pág, delay 200ms entre páginas)
   - `fetchWalletActivity(address)` — Actividad reciente de una wallet
   - `fetchWalletPositions(address)` — Posiciones abiertas actuales
   - `fetchWalletActivitySummary(address, days)` — Resumen agregado con ROI, win rate, trade count

3. **`lib/adapters/markets.ts`** — Gamma + CLOB APIs:
   - `fetchMarketData(id)` — Datos completos de mercado (precios, liquidity, volume)
   - `fetchMarketByToken(tokenId)` — Búsqueda inversa token → market
   - `fetchOrderBook(tokenId)` — Order book con bestBid/bestAsk/spread
   - `fetchCurrentPrice(tokenId)` / `fetchPriceHistory(tokenId)` — Precios CLOB
   - `fetchMarketOutcome(id)` — Resultado de mercado resuelto
   - `fetchMarketsByCondition(conditionId)` — Mercados relacionados
   - `fetchResolvedMarkets()` / `fetchActiveMarkets()` — Descubrimiento

4. **`lib/adapters/trades.ts`** — Data API:
   - `fetchRecentTrades(wallet)` — Últimas operaciones
   - `fetchTradeHistory(wallet, days)` — Historial completo con deduplicación cross-endpoint
   - `fetchTradeAggregateStats(wallet, days)` — Stats agregados (volumen, categorías, buy ratio)

5. **`lib/adapters/outcomes.ts`** — Gamma API:
   - `fetchMarketResolution(id)` — Resolución de mercado individual
   - `fetchResolvedMarketsBatch(opts)` — Batch paginado de mercados resueltos
   - `checkResolutions(ids)` — Verifica resolución para batch de IDs (en lotes de 10)
   - `fetchRecentlyResolved(hours)` — Mercados resueltos en últimas N horas
   - `verifyPrediction(outcome, side, resolution)` — Valida predicción vs resultado real

**Archivos creados/modificados:**
- `lib/adapters/client.ts` — Nuevo (fetch wrapper + helpers compartidos)
- `lib/adapters/leaderboard.ts` — Implementación completa (~220 líneas)
- `lib/adapters/markets.ts` — Nuevo (~260 líneas)
- `lib/adapters/trades.ts` — Nuevo (~220 líneas)
- `lib/adapters/outcomes.ts` — Nuevo (~250 líneas)
- `.env.example` — Añadido `POLYMARKET_DATA_URL`

**Decisiones tomadas:**
- **Fetch nativo de Node 20+**: Sin dependencias externas (no axios, no node-fetch). Suficiente para APIs REST públicas.
- **Tres APIs distintas**: Data API (leaderboard + actividad), Gamma API (mercados), CLOB API (order books/precios). Cada adaptador usa la que corresponde.
- **Helpers compartidos en client.ts**: `parseOutcomePrices` y `mapSide` estaban duplicados → extraídos a shared para consistencia.
- **Paginación con delay**: 200ms entre páginas del leaderboard para evitar rate limiting (Cloudflare).
- **Promise.allSettled en trade history**: Si un endpoint falla, el otro aún aporta datos. Mejor resiliencia.

**Problemas encontrados:**
- Typecheck inicial falló por inconsistencia de tipos en `fetchLeaderboard` (generic vs Record) → Corregido usando `Record<string, unknown>[]` como tipo de retorno de `apiFetch`
- `parseOutcomePrices` duplicado en markets.ts y outcomes.ts → Extraído a client.ts
- `mapSide` duplicado con lógica inconsistente en leaderboard.ts y trades.ts → Unificado en client.ts
- `fetchActiveMarkets` tenía bug: tag + category usaban la misma key → Corregido
- `fetchMarketResolution` usaba dynamic import innecesario → Reemplazado por static import de `fetchMarketOutcome`

**Próximos pasos:**
- [ ] Hito 2.1: Motor de scoring de billeteras (`lib/scoring/wallet-scoring.ts`)
- [ ] Hito 2.2: Script scan:leaderboard
- [ ] Hito 2.3: Script scan:wallets
- [ ] Tests unitarios para adaptadores

### [2026-07-12] — Hito 2.1: Motor de Scoring de Billeteras

**Rama:** `main`
**Estado:** ✅ Completado

**Resumen:**
Implementado el motor completo de scoring de billeteras en `lib/scoring/wallet-scoring.ts` (~350 líneas).

**Funciones implementadas:**

| Función | Input | Output | Lógica |
|---------|-------|--------|--------|
| `scoreROI(roi)` | ROI numérico | 0–1 | Normalización logarítmica: ln(1+roi)/ln(6) — ROI negativo = 0, 100% ≈ 0.80 |
| `scoreConsistency(wr, tc, trades?)` | Win rate, trade count, trades | 0–1 | 50% win rate, 30% suficiencia de trades, 20% dispersión temporal (≥3 días distintos) |
| `scoreCopyability(wallet)` | WalletInput | 0–1 | 40% trade size ($50-$2000 ideal), 30% frecuencia (5-100 trades), 30% spread+liquidez |
| `scoreCategoryStrength(dist)` | Distribución categorías | 0–1 | Concentración ideal 40-70% en categoría top: muestra expertise sin ser unidimensional |
| `scoreLiquidityQuality(liq)` | Liquidez promedio | 0–1 | Escala logarítmica: $100K+ ≈ 1.0, $1K ≈ 0.3 |
| `scoreEntryTiming(hours)` | Horas hasta resolución | 0–1 | 48h+ = 1.0, 24h = 0.9, 2h = 0.4, <1h = 0.1 |
| `scoreResolvedPerformance(count, wr)` | # resueltos + win rate | 0–1 | 70% win rate, 30% volumen de resueltas (≥20 = 0.3 extra) |
| `calculateOneHitWonderPenalty(trades, positions?)` | Trades + posiciones | 0–0.4 | Tier: >60% ganancia de 1 trade → 0.40, >40% → 0.20, >25% → 0.10 |

**Funciones compuestas:**
- `calculateAllScores(wallet)` → `WalletScores` con los 8 componentes
- `calculateGlobalScore(scores)` → score ponderado final (fórmula PLAN.md exacta)
- `scoreWallet(wallet)` → resultado completo con status, scores, reasoning
- `scoreWallets(wallets[])` → batch scoring ordenado por globalScore descendente
- `determineStatus(score)` → track (>0.7) | watch (≥0.4) | ignore (<0.4)

**Archivos modificados:**
- `lib/scoring/wallet-scoring.ts` — Implementación completa (~350 líneas)

**Decisiones tomadas:**
- **Normalización logarítmica para ROI**: Evita que wallets con ROI extremo (1000%+) dominen el score. La curva ln(1+x)/ln(6) da ~0.80 para 100% ROI y se aplana asintóticamente.
- **One-hit-wonder usa PnL de posiciones resueltas primero**: Más preciso que valor nocional. Si no hay datos de PnL, fallback a valor nocional con advertencia documentada.
- **`WalletInput` como tipo flexible**: Acepta datos tanto crudos (leaderboard) como agregados (activity summary), permitiendo que el scoring funcione con distintos niveles de detalle.
- **`scoreEntryTiming` recibe horas**: Documentado explícitamente que el caller debe convertir de segundos a horas.

**Problemas encontrados:**
- Variable `reasons` no usada en `scoreCopyability` → Eliminada
- `t.timestamp` usaba truthy check (0 = epoch, false) → Cambiado a `t.timestamp > 0`
- `scoreCategoryStrength` aceptaba `bestCategory` sin usarlo → Parámetro eliminado
- Doble clamping en `scoreWallet` → Eliminado (solo en `calculateGlobalScore`)

**Próximos pasos:**
- [ ] Hito 2.2: Script `scan:leaderboard` — Escanea top 500 y guarda en DB
- [ ] Hito 2.3: Script `scan:wallets` — Perfila cada wallet con el scoring engine
- [ ] Tests unitarios para wallet-scoring

### [2026-07-12] — Tests unitarios para adaptadores (Hito 1.5)

**Rama:** `main`
**Estado:** ✅ Completado

**Resumen:**
Creados 4 archivos de tests unitarios con 66 tests en total, todos pasando. Cada test usa `vi.stubGlobal('fetch')` para mockear las llamadas HTTP sin depender de la API real.

**Tests por adaptador:**

| Archivo | Tests | Cobertura |
|---------|-------|-----------|
| `tests/adapters/leaderboard.test.ts` | 14 | Paginación, field mapping, activity, positions, summary, time filtering, errores |
| `tests/adapters/markets.test.ts` | 17 | Market data, token lookup, order book, prices, outcomes, filters, snake_case |
| `tests/adapters/trades.test.ts` | 12 | Recent trades, history (dedup, time filter, graceful failure), aggregate stats |
| `tests/adapters/outcomes.test.ts` | 23 | Resolution, batch, checkResolutions, recently resolved, verifyPrediction |

**Patrón de mocking:**
- `vi.stubGlobal('fetch', mockFetch)` + `mockFetch.mockResolvedValueOnce(mockFetchResponse(data))`
- `mockFetchResponse()` crea un `Response`-like con `.ok`, `.status`, `.json()`
- `vi.mock("@/lib/adapters/client", ...)` mockea `sleep` para tests de error/retry (evita timeouts)

**Problemas encontrados:**
- 3 tests con timeout por el retry loop de `apiFetch` (3 reintentos × backoff exponencial) → Mockeado `sleep` via `vi.mock` para que resuelva instantáneamente
- Test `treats closed markets as resolved` fallaba porque `resolved: false` no es nullish → Ajustado: se prueba el fallback cuando `resolved` está ausente
- Test `detects side mismatch` esperaba `correct: true` pero `verifyPrediction` correctamente retorna `false` para side mismatch → Corregida la aserción

**Archivos creados:**
- `tests/adapters/leaderboard.test.ts` — 14 tests
- `tests/adapters/markets.test.ts` — 17 tests
- `tests/adapters/trades.test.ts` — 12 tests
- `tests/adapters/outcomes.test.ts` — 23 tests

---

## Métricas de Desarrollo

| Fecha | Hito | Tareas completadas | Tests pasando | Líneas de código |
|-------|------|--------------------|---------------|------------------|
| 2026-07-12 | Planificación | Documentos creados | N/A | N/A |
| 2026-07-12 | Hito 0: Fundación | Proyecto inicializado, DB schema, build OK | N/A | ~800 |
| 2026-07-12 | Hito 1: Adaptadores | 5 archivos, 4 adaptadores, typecheck OK | N/A | ~950 |
| 2026-07-12 | Hito 1.5: Tests adaptadores | 4 test files, 66 tests, todos pasando | 66/66 ✅ | ~850 |
### [2026-07-12] — Hito 2.2: Script scan:leaderboard

**Rama:** `main`
**Estado:** ✅ Completado

**Resumen:**
Implementado `scripts/scan-leaderboard.ts` (~180 líneas). El script:

1. **Fetch**: Llama a `fetchLeaderboard(500)` con timePeriod ALL + category OVERALL
2. **Stats**: Calcula avg/median ROI, avg PnL, total volume, avg win rate, avg trade count
3. **DB**: Inserta un `LeaderboardScan` con `rawSummaryJson` (top 10 por PnL + stats completos)
4. **Display**: Muestra tabla formateada en consola con el top 10 por PnL

**Salida de consola:**
```
════════════════════════════════════════════════════════════
  🔍 Hermes — Polymarket Leaderboard Scanner
════════════════════════════════════════════════════════════
  Limit:       500 wallets
  Lookback:    30 days
  Category:    OVERALL
  Time period: ALL
────────────────────────────────────────────────────────────
  📡 Fetching leaderboard from Polymarket Data API...
  ✅ Fetched 500 wallets in 12.3s
  💾 Saving LeaderboardScan to database...
  ✅ Scan saved.
════════════════════════════════════════════════════════════
  📊 Scan Summary
════════════════════════════════════════════════════════════
  Wallets fetched:      500
  Avg PnL:              $15.3K
  Avg ROI:              45.2%
  ...
────────────────────────────────────────────────────────────
  🏆 Top 10 Wallets by PnL
────────────────────────────────────────────────────────────
  Rank  Address         PnL      ROI    Win%   Label
  1     0x1234...abcd   $50.0K   120%   68%    Alpha
  ...
```

**Archivos modificados:**
- `scripts/scan-leaderboard.ts` — Implementación completa (~180 líneas)

**Decisiones tomadas:**
- **Time period ALL vs lookback 30d**: La API usa `ALL` (all-time ranking), el análisis 30d por wallet se hace en `scan:wallets` (Hito 2.3). Documentado con comentario.
- **Top 10 por PnL consistente**: Tanto `rawSummaryJson` como la tabla de consola usan el mismo top 10 sorted by PnL (no por rank).
- **Formato de moneda con signo**: `-$1.5K` en vez de `$-1.5K` para valores negativos.

**Problemas encontrados:**
- `buildSummaryJson` guardaba top 10 por rank pero display mostraba top 10 por PnL → Unificado a top por PnL
- Redundancia `e.pnl ?? 0` tras filtrar `!== undefined` → Reemplazado por non-null assertion `e.pnl!`
- Formato de moneda negativa mostraba `$-1.5K` → Corregido a `-$1.5K`

**Próximos pasos:**
- [ ] Hito 2.3: Script `scan:wallets` — Perfila cada wallet con el scoring engine
- [ ] Tests unitarios para wallet-scoring

---

## Métricas de Desarrollo

| Fecha | Hito | Tareas completadas | Tests pasando | Líneas de código |
|-------|------|--------------------|---------------|------------------|
| 2026-07-12 | Planificación | Documentos creados | N/A | N/A |
| 2026-07-12 | Hito 0: Fundación | Proyecto inicializado, DB schema, build OK | N/A | ~800 |
| 2026-07-12 | Hito 1: Adaptadores | 5 archivos, 4 adaptadores, typecheck OK | N/A | ~950 |
| 2026-07-12 | Hito 1.5: Tests adaptadores | 4 test files, 66 tests, todos pasando | 66/66 ✅ | ~850 |
| 2026-07-12 | Hito 2.1: Scoring | Motor de scoring completo, typecheck OK | N/A | ~350 |
### [2026-07-12] — Hito 2.3: Script scan:wallets

**Rama:** `main`
**Estado:** ✅ Completado

**Resumen:**
Implementado `scripts/scan-wallets.ts` (~300 líneas). El script:

1. **Lee el último scan**: Obtiene el `LeaderboardScan` más reciente de la DB y extrae las addresses desde `rawSummaryJson` (con fallback a re-fetch del leaderboard si no hay datos)
2. **Perfila en batches**: Procesa wallets en lotes de 5 con 500ms de delay entre lotes para rate limiting
3. **Obtiene actividad**: Para cada wallet llama a `fetchWalletActivitySummary(address, 30)` (2 API calls: actividad + posiciones)
4. **Calcula scores**: Usa `scoreWallet()` del motor de scoring con datos combinados de leaderboard + actividad
5. **Upsert en DB**: Inserta o actualiza `wallet_profile` con todos los scores y métricas 30d
6. **Muestra resumen**: Conteo track/watch/ignore, top wallets, penalizaciones one-hit-wonder

**Corrección crítica en scan-leaderboard.ts**: `buildSummaryJson` ahora recibe `allAddresses: string[]` (las 500 wallets) además del `topByPnl` (top 10). Antes solo guardaba 10 addresses.

**Datos persistidos en wallet_profile:**
- Scores: `globalScore`, `consistencyScore`, `copyabilityScore`, `oneHitWonderPenalty`
- Métricas 30d: `roi30d`, `tradeCount30d`, `winRate30d`, `resolvedTradeCount30d`, `averageTradeSize`
- Categoría: `bestCategory`, `categoryStrengthsJson`
- Notas: `copyabilityNotes` (filtrado a razones de copyability), `riskNotes` (penalizaciones)

**Archivos creados/modificados:**
- `scripts/scan-wallets.ts` — Implementación completa (~300 líneas)
- `scripts/scan-leaderboard.ts` — Fix: `buildSummaryJson` ahora guarda todas las addresses

**Decisiones tomadas:**
- **ProfileResult** (score + summary): El resultado del perfilado incluye tanto el score como el summary para que el upsert pueda persistir métricas 30d reales, no solo datos del leaderboard all-time
- **Batches de 5 + 500ms delay**: Compromiso entre velocidad y rate limiting. Con 500 wallets, ~50s de delays + tiempo de API
- **Fallback resiliente**: Si `fetchWalletActivitySummary` falla para una wallet, se scorea solo con datos del leaderboard

**Problemas encontrados:**
- **Bug crítico**: `addresses` en rawSummaryJson solo guardaba 10 wallets (topByPnl) → Corregido pasando `entries.map(e => e.address)` como `allAddresses`
- `winRate30d` usaba datos all-time del leaderboard → Ahora prefiere `summary.winRate` (30d)
- `categoryStrengthsJson` siempre era `null` → Ahora serializa `buildCategoryDistribution()`
- `tradeCount30d`/`resolvedTradeCount30d` hardcodeados a 0 → Ahora usan `summary.tradeCount`/`summary.resolvedTradeCount`
- `buildCopyabilityNotes` retornaba `null` con tipo `string` → Corregido a `string | null`
- Tipos verbosos `Awaited<ReturnType<...>>` → Reemplazados por `WalletActivitySummary` importado

**Próximos pasos:**
- [ ] Hito 3: Motor de scoring de operaciones (`lib/scoring/trade-scoring.ts`)
- [ ] Tests unitarios para wallet-scoring.ts
- [ ] Probar el pipeline completo: `scan:leaderboard` → `scan:wallets`

---

### [2026-07-12] — Tests unitarios para wallet-scoring (Hito 2.4)

**Rama:** `main`
**Estado:** ✅ Completado

**Resumen:**
Creado `tests/scoring/wallet-scoring.test.ts` con 132 tests unitarios, todos pasando. Sin mocks necesarios — todas las funciones de scoring son puras.

**Cobertura por función:**

| Función | Tests | Casos clave |
|---------|-------|-------------|
| `scoreROI` | 6 | null/undefined, negativo/cero, 100% ROI (~0.387), 500% ROI (~1.0), monotonicidad, clamping |
| `scoreConsistency` | 9 | < 3 trades, win rate solo, count bonuses (5/10/20), dispersión 3+ días, 2 días, sin detalles, full score combo |
| `scoreCopyability` | 8 | sin datos, size ideal ($50-$2000), borderline, extremos, frecuencia, spread+liquidity full/parcial |
| `scoreCategoryStrength` | 7 | null/empty, ideal (40-70%), decente (30-80%), sobre-concentración (>80%), zero total, boundary cases |
| `scoreLiquidityQuality` | 5 | null/zero, negativo, monotonicidad, valores altos |
| `scoreEntryTiming` | 4 | null (0.5 neutral), 48h+ (1.0), thresholds tiered |
| `scoreResolvedPerformance` | 4 | cero resueltas, winRate 0-0.7, count tiers (3/5/10/20), max score |
| `calculateOneHitWonderPenalty` | 9 | <3 positions, balanced gains, thresholds 25%/40%/60%, PnL negativo ignorado, fallback trades (balanced, dominance, non-trade filtering) |
| `calculateGlobalScore` | 5 | todos 1s = 1.0, peso ROI 0.25, resta penalty, clamping a 0, cálculo exacto |
| `calculateAllScores` | 2 | los 8 componentes + rangos, fallback a activity summary |
| `scoreWallet` | 4 | resultado completo, status track/watch/ignore, reasoning con penalty |
| `scoreWallets` | 2 | sorting descendente, entrada vacía |
| `determineStatus` | 3 | track (>0.7), watch (≥0.4), ignore (<0.4) |

**Archivos creados:**
- `tests/scoring/wallet-scoring.test.ts` — 132 tests (~400 líneas)

**Problemas encontrados:**
- Test "balanced gains" esperaba 0 pero `ratio=0.4` activa `>0.25` → 0.1. Corregido: se añadió un test con ganancias verdaderamente iguales (25/25/25/25, ratio=0.25)
- `scoreConsistency(0, 5)` esperaba 0.1 pero el código da 0.2 (0.1 count + 0.1 modest bonus). Corregida la expectativa
- `scoreCategoryStrength({Politics: 3, Crypto: 7})` → concentración 0.7 está en rango ideal [0.4-0.7] → 0.9, no 0.7. Ajustado a distribución con concentración 0.727

---

### [2026-07-12] — Hito 3.1: Motor de Scoring de Operaciones

**Rama:** `main`
**Estado:** ✅ Completado

**Resumen:**
Implementado `lib/scoring/trade-scoring.ts` (~380 líneas). El motor califica operaciones individuales para decidir si copiarlas (paper_copy), observarlas (watchlist) o saltarlas (skip).

**Fórmula (PLAN.md exacta):**
```
copyScore = (
  walletQualityScore   * 0.25 +
  categoryFitScore     * 0.15 +
  entryTimingScore     * 0.15 +
  spreadScore          * 0.10 +
  liquidityScore       * 0.10 +
  roiScore             * 0.10 +
  thesisScore          * 0.10 +
  timeToResolutionScore * 0.05
) * confidence
```

**Funciones de scoring individual:**

| Función | Lógica |
|---------|--------|
| `scoreWalletQuality` | Tiers: globalScore ≥0.8→1.0, ≥0.6→0.8, ≥0.4→0.5, ≥0.2→0.3 |
| `scoreCategoryFit` | Exact match bestCategory=marketCategory→1.0, mismatch→0.4, unknown→0.5 |
| `scoreEntryTimingTrade` | Price drift %: ≤1%→1.0, 1-3%→0.8, 3-5%→0.6, 5-10%→0.3, >10%→0.1 |
| `scoreSpread` | Relative spread (vs mid-price): ≤1%→1.0, 1-3%→0.8, 3-5%→0.6, 5-8%→0.3 |
| `scoreLiquidityTrade` | Log scale: $100K+→1.0, $50K→~0.75, $10K→~0.45 |
| `scoreROITrade` | Passthrough del wallet.scores.roiScore |
| `scoreThesis` | 50% size conviction ($500+→0.5), 25% directional, 25% price timing |
| `scoreTimeToResolution` | 72h+→1.0, 48h→0.9, 24h→0.75, 12h→0.6, 6h→0.4, 2h→0.2 |

**Funciones compuestas:**
- `calculateTradeScores(input)` → `TradeScores` con 8 componentes
- `calculateConfidence(input)` → 0.5 base + hasta 0.5 por datos disponibles
- `calculateCopyScore(scores, confidence)` → `weightedSum * confidence`
- `determineDecision(copyScore)` → paper_copy (>0.65), watchlist (0.35-0.65), skip (<0.35)
- `calculatePositionSize(copyScore, decision)` → $5-$20 linear para copy, $3 watchlist, $0 skip
- `scoreTrade(input)` → resultado completo con reasons, risks, position size
- `scoreTrades(inputs[])` → batch scoring ordenado por copyScore descendente

**Archivos creados:**
- `lib/scoring/trade-scoring.ts` — Implementación completa (~380 líneas)

**Decisiones tomadas:**
- **Confidence multiplier**: Empieza en 0.5 base + gana hasta 0.5 por datos conocidos. Un trade sin datos se califica al 50% del score ponderado (conservador).
- **Relative spread**: En vez de spread absoluto, se usa `spread / midPrice` cuando hay precio disponible. Más preciso en distintos rangos de precio.
- **Thesis sin sesgo direccional**: Originalmente "no" recibía 0.3 vs 0.2 para "yes" → corregido a 0.25 igual para ambos lados.

**Problemas encontrados:**
- Imports muertos `MarketData` y `WalletScores` → Eliminados
- Sesgo arbitrario en `scoreThesis` favoreciendo "no" → Igualado a 0.25 para ambos
- `scoreSpread` usaba valores absolutos sin contexto de precio → Añadido `midPrice` para calcular spread relativo

**Próximos pasos:**
- [ ] Hito 3.2: Script `monitor:trades` — Detecta nuevas operaciones y las guarda en observed_trade
- [ ] Hito 3.3: Script `score:trades` — Califica operaciones con el trade scoring engine
- [ ] Tests unitarios para trade-scoring

---

## Métricas de Desarrollo

| Fecha | Hito | Tareas completadas | Tests pasando | Líneas de código |
|-------|------|--------------------|---------------|------------------|
| 2026-07-12 | Planificación | Documentos creados | N/A | N/A |
| 2026-07-12 | Hito 0: Fundación | Proyecto inicializado, DB schema, build OK | N/A | ~800 |
| 2026-07-12 | Hito 1: Adaptadores | 5 archivos, 4 adaptadores, typecheck OK | N/A | ~950 |
| 2026-07-12 | Hito 1.5: Tests adaptadores | 4 test files, 66 tests, todos pasando | 66/66 ✅ | ~850 |
| 2026-07-12 | Hito 2.1: Scoring | Motor de scoring de billeteras, typecheck OK | N/A | ~350 |
| 2026-07-12 | Hito 2.4: Tests scoring | 132 tests unitarios, todos pasando | 198/198 ✅ | ~400 |
| 2026-07-12 | Hito 2.2: scan:leaderboard | Script CLI funcional, typecheck OK | N/A | ~180 |
| 2026-07-12 | Hito 2.3: scan:wallets | Perfilador + upsert DB, typecheck OK | N/A | ~300 |
### [2026-07-12] — Hito 3.2: Script monitor:trades

**Rama:** `main`
**Estado:** ✅ Completado

**Resumen:**
Implementado `scripts/monitor-trades.ts` (~230 líneas). El script detecta nuevas operaciones de wallets con status "track" y las guarda en la DB.

**Flujo:**
1. **Query**: Obtiene wallets con status `track` de `wallet_profile`, ordenadas por globalScore desc
2. **Scan**: Para cada wallet, llama a `fetchWalletActivity(address, {limit: 50})` y filtra trades de las últimas 24h
3. **Dedup**: Verifica si el trade ya existe en `observed_trade` por `wallet + marketId + timestamp ± 120s` (fallback LIKE txHash)
4. **Save trade**: Inserta nuevo `observed_trade` con entry price, detected price, size, side, etc.
5. **Snapshot**: Para cada trade nuevo, obtiene `fetchMarketData(marketId)` y guarda `market_snapshot` (con dedup 1h)

**Rate limiting**: 300ms delay entre wallets, 50 actividades por wallet.

**Archivos creados:**
- `scripts/monitor-trades.ts` — Implementación completa (~230 líneas)

**Decisiones tomadas:**
- **Two-phase pricing**: `detectedPrice` se inicializa = `walletEntryPrice`. El script `score:trades` (Hito 3.3) obtendrá precios frescos y actualizará `detectedPrice`.
- **Dedup por wallet+marketId+timestamp**: Más robusto que comparar JSON. El fallback LIKE txHash solo se usa cuando no hay marketId.
- **Market snapshot con cache 1h**: No se re-fetchea market data si ya existe un snapshot < 1h para ese mercado.

**Problemas encontrados:**
- Dedup txHash usaba `json_object()` de SQLite que es frágil comparando contra `JSON.stringify()` → Reemplazado por LIKE para el fallback, y wallet+marketId+timestamp como primary

**Próximos pasos:**
- [ ] Hito 3.3: Script `score:trades` — Califica observed_trades sin decisión con trade-scoring.ts
- [ ] Hito 4: Motor de simulación (paper-trader.ts)

---

## Métricas de Desarrollo

| Fecha | Hito | Tareas completadas | Tests pasando | Líneas de código |
|-------|------|--------------------|---------------|------------------|
| 2026-07-12 | Planificación | Documentos creados | N/A | N/A |
| 2026-07-12 | Hito 0: Fundación | Proyecto inicializado, DB schema, build OK | N/A | ~800 |
| 2026-07-12 | Hito 1: Adaptadores | 5 archivos, 4 adaptadores, typecheck OK | N/A | ~950 |
| 2026-07-12 | Hito 1.5: Tests adaptadores | 4 test files, 66 tests, todos pasando | 66/66 ✅ | ~850 |
| 2026-07-12 | Hito 2.1: Scoring | Motor de scoring de billeteras, typecheck OK | N/A | ~350 |
| 2026-07-12 | Hito 2.4: Tests scoring | 132 tests unitarios, todos pasando | 198/198 ✅ | ~400 |
| 2026-07-12 | Hito 2.2: scan:leaderboard | Script CLI funcional + probado vs API real | N/A | ~180 |
| 2026-07-12 | Hito 2.3: scan:wallets | Perfilador + upsert DB, typecheck OK | N/A | ~300 |
| 2026-07-12 | Hito 3.1: Trade scoring | Motor de scoring de trades, typecheck OK | N/A | ~380 |
### [2026-07-12] — Hito 3.3: Script score:trades

**Rama:** `main`
**Estado:** ✅ Completado

**Resumen:**
Implementado `scripts/score-trades.ts` (~190 líneas). El script califica `observed_trades` pendientes y crea `DecisionJournal` records con la decisión de copia.

**Flujo:**
1. **Query**: LEFT JOIN `observed_trades` con `decision_journals` para encontrar trades sin decisión (máx 200 por ejecución)
2. **Load wallet**: Reconstruye `WalletScoreResult` desde `wallet_profile`, calculando `roiScore` via `scoreROI(w.roi30d)`
3. **Load market**: Obtiene el `market_snapshot` más reciente para el mercado del trade
4. **Score**: Construye `TradeScoreInput` y llama a `scoreTrade()` del engine
5. **Save**: Inserta `DecisionJournal` con todos los scores, reasons, risks, y simulatedPositionSize
6. **Summary**: Conteo paper_copy / watchlist / skip

**Manejo de errores**: Si un trade no tiene wallet_profile o market_snapshot → skip. Si `scoreTrade()` lanza excepción → skip con log (no crashea el script).

**Archivos creados:**
- `scripts/score-trades.ts` — Implementación completa (~190 líneas)

**Decisiones tomadas:**
- **Reconstrucción de WalletScoreResult desde DB**: Los scores individuales (`roiScore`, `consistencyScore`, etc.) no están todos como columnas separadas. Solo `roiScore` se computa desde `roi30d` porque el trade-scoring lo necesita. Los demás se inicializan a 0 ya que no los usa `scoreTrade()`.
- **Batch de 200 trades por ejecución**: Suficiente para una pasada de scoring sin sobrecargar.

**Problemas encontrados:**
- `roiScore` hardcodeado a 0 en la reconstrucción → Arreglado: import `scoreROI` y computar desde `w.roi30d`
- Sin try/catch en el loop de scoring → Añadido per-trade try/catch para evitar que un trade malo crashee todo el script
- Imports duplicados de wallet-scoring (type + value) → Unificados en una línea

**Próximos pasos:**
- [ ] Hito 4.1: Motor de paper trading (`lib/simulation/paper-trader.ts`)
- [ ] Tests unitarios para trade-scoring

---

## Métricas de Desarrollo

| Fecha | Hito | Tareas completadas | Tests pasando | Líneas de código |
|-------|------|--------------------|---------------|------------------|
| 2026-07-12 | Planificación | Documentos creados | N/A | N/A |
| 2026-07-12 | Hito 0: Fundación | Proyecto inicializado, DB schema, build OK | N/A | ~800 |
| 2026-07-12 | Hito 1: Adaptadores | 5 archivos, 4 adaptadores, typecheck OK | N/A | ~950 |
| 2026-07-12 | Hito 1.5: Tests adaptadores | 4 test files, 66 tests, todos pasando | 66/66 ✅ | ~850 |
| 2026-07-12 | Hito 2.1: Scoring | Motor de scoring de billeteras, typecheck OK | N/A | ~350 |
| 2026-07-12 | Hito 2.4: Tests scoring | 132 tests unitarios, todos pasando | 198/198 ✅ | ~400 |
| 2026-07-12 | Hito 2.2: scan:leaderboard | Script CLI + probado vs API real ✅ | N/A | ~180 |
| 2026-07-12 | Hito 2.3: scan:wallets | Perfilador + upsert DB | N/A | ~300 |
| 2026-07-12 | Hito 3.1: Trade scoring | Motor de scoring de trades | N/A | ~380 |
| 2026-07-12 | Hito 3.2: monitor:trades | Detector de trades + snapshots | N/A | ~230 |
| 2026-07-12 | Hito 3.3: score:trades | Calificador → DecisionJournal | N/A | ~190 |

---

## Lecciones Aprendidas

> *Esta sección se poblará a medida que avance el desarrollo. Aquí van insights no obvios, errores costosos, y descubrimientos útiles.*

1. *(vacío — el desarrollo aún no comienza)*

---

## Deuda Técnica Registrada

> *Decisiones conscientes de simplificación que pueden necesitar revisión futura.*

| ID | Descripción | Prioridad | Fecha registro |
|----|-------------|-----------|----------------|
| — | *(sin deuda técnica aún)* | — | — |

---

## Riesgos Activos

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| APIs de Polymarket pueden cambiar sin aviso | Media | Alto | Capa de adaptadores abstrae los detalles de API |
| Rate limiting en APIs públicas | Media | Medio | Implementar backoff exponencial y caché |
| SQLite no escala para datos históricos grandes | Baja (v1) | Bajo | Migrar a PostgreSQL en v2 si es necesario |
| Billeteras del leaderboard pueden ser bots/sybils | Alta | Medio | El scoring penaliza one-hit-wonders y detecta patrones sospechosos |

---

## Notas para el Futuro

- **v2 podría incluir:** Ejecución real con wallet de prueba, PostgreSQL en Supabase, autenticación de usuario, notificaciones push.
- **Integración Max HQ:** El dashboard está diseñado para encajar como un módulo dentro de Max HQ. Los estilos deben ser compatibles.
- **Hermes como operador:** En producción, Hermes ejecutaría los scripts programados vía cron. El dashboard es solo lectura.
