# Ruta de Implementación — Polymarket Copy Trading Bot

> **Orden secuencial de construcción, paso a paso. Cada paso es un hito verificable.**

---

## Hito 0: Fundación del Proyecto

### 0.1 Inicializar Proyecto
```bash
npx create-next-app@latest hermes-copybot --typescript --tailwind --eslint --app --src-dir
cd hermes-copybot
```
- [ ] Proyecto Next.js con TypeScript, Tailwind, ESLint, App Router
- [ ] Estructura de carpetas: `lib/`, `scripts/`, `db/`, `components/`, `tests/`

### 0.2 Instalar Dependencias Base
```bash
npm install drizzle-orm better-sqlite3
npm install -D drizzle-kit @types/better-sqlite3 vitest
npm install recharts date-fns
```
- [ ] Drizzle ORM + SQLite para datos
- [ ] Recharts para gráficos
- [ ] date-fns para manejo de fechas
- [ ] Vitest para testing

### 0.3 Configurar Base de Datos
- [ ] `db/schema.ts` — Todos los modelos (12 tablas)
- [ ] `db/index.ts` — Conexión y cliente Drizzle
- [ ] `drizzle.config.ts` — Configuración de migraciones
- [ ] `db/migrations/` — Migraciones generadas

### 0.4 Variables de Entorno
- [ ] `.env.example` con todas las variables documentadas
- [ ] `.env.local` para desarrollo local (gitignored)

### 0.5 Documentación de Seguridad
- [ ] `SAFETY.md` explicando limitaciones v1 y riesgos
- [ ] `README.md` con setup, comandos y arquitectura

**Checkpoint:** `npm run dev` arranca sin errores. `npm run db:migrate` crea la DB.

---

## Hito 1: Adaptadores de Polymarket

### 1.1 Adaptador Leaderboard
- [ ] `lib/adapters/leaderboard.ts`
- [ ] Función `fetchLeaderboard(limit: 500)` → top wallets
- [ ] Función `fetchWalletActivity(address, days: 30)` → historial

### 1.2 Adaptador Mercados
- [ ] `lib/adapters/markets.ts`
- [ ] Función `fetchMarketData(marketId)` → precios, spread, liquidez
- [ ] Función `fetchMarketOutcome(marketId)` → resultado final
- [ ] Función `fetchMarketsByCondition(conditionId)` → mercados relacionados

### 1.3 Adaptador Operaciones
- [ ] `lib/adapters/trades.ts`
- [ ] Función `fetchRecentTrades(walletAddress)` → últimas operaciones
- [ ] Función `fetchTradeHistory(walletAddress, days)` → historial

### 1.4 Adaptador Resultados
- [ ] `lib/adapters/outcomes.ts`
- [ ] Función `fetchResolvedMarkets()` → mercados resueltos
- [ ] Función `fetchMarketResolution(marketId)` → resultado específico

### 1.5 Tests de Adaptadores
- [ ] `tests/adapters/leaderboard.test.ts`
- [ ] `tests/adapters/markets.test.ts`
- [ ] `tests/adapters/trades.test.ts`

**Checkpoint:** Tests de adaptadores pasan. APIs de Polymarket responden correctamente.

---

## Hito 2: Escáner y Perfilador

### 2.1 Motor de Scoring de Billeteras
- [ ] `lib/scoring/wallet-scoring.ts`
- [ ] `scoreROI(roi)` → 0–1
- [ ] `scoreConsistency(trades)` → 0–1
- [ ] `scoreCopyability(wallet)` → 0–1
- [ ] `calculateOneHitWonderPenalty(trades)` → 0–0.4
- [ ] `scoreLiquidityQuality(wallet)` → 0–1
- [ ] `scoreEntryTiming(wallet)` → 0–1
- [ ] `calculateGlobalScore(scores)` → score final

### 2.2 Script scan:leaderboard
- [ ] `scripts/scan-leaderboard.ts`
- [ ] Escanea top 500 del leaderboard
- [ ] Guarda `LeaderboardScan` en DB
- [ ] Comando: `npm run scan:leaderboard`

### 2.3 Script scan:wallets
- [ ] `scripts/scan-wallets.ts`
- [ ] Para cada wallet del scan, obtiene actividad 30d
- [ ] Calcula scores
- [ ] Asigna estado (track/watch/ignore)
- [ ] Guarda/actualiza `WalletProfile` en DB
- [ ] Comando: `npm run scan:wallets`

### 2.4 Tests de Scoring
- [ ] `tests/scoring/wallet-scoring.test.ts`
- [ ] `tests/scoring/one-hit-wonder.test.ts`
- [ ] `tests/scoring/copyability.test.ts`

**Checkpoint:** `npm run scan:leaderboard && npm run scan:wallets` puebla la DB.

---

## Hito 3: Monitoreo de Operaciones

### 3.1 Motor de Scoring de Operaciones
- [ ] `lib/scoring/trade-scoring.ts`
- [ ] `scoreWalletQuality(wallet)` → 0–1
- [ ] `scoreEntryTiming(trade, market)` → 0–1
- [ ] `scoreSpread(marketSnapshot)` → 0–1
- [ ] `scoreLiquidity(marketSnapshot)` → 0–1
- [ ] `scoreCategoryFit(wallet, category)` → 0–1
- [ ] `scoreThesis(trade)` → 0–1
- [ ] `calculateCopyScore(scores)` → decision + confidence

### 3.2 Script monitor:trades
- [ ] `scripts/monitor-trades.ts`
- [ ] Para wallets con status "track", detecta nuevas operaciones
- [ ] Crea `ObservedTrade` y `MarketSnapshot` en DB
- [ ] Comando: `npm run monitor:trades`

### 3.3 Script score:trades
- [ ] `scripts/score-trades.ts`
- [ ] Para cada `ObservedTrade` sin decisión, calcula score
- [ ] Crea `DecisionJournal` con decisión: paper_copy | watchlist | skip
- [ ] Comando: `npm run score:trades`

### 3.4 Tests
- [ ] `tests/scoring/trade-scoring.test.ts`

**Checkpoint:** `npm run monitor:trades && npm run score:trades` genera decisiones.

---

## Hito 4: Motor de Simulación

### 4.1 Motor Paper Trading
- [ ] `lib/simulation/paper-trader.ts`
- [ ] `createPaperTrade(decision)` → PaperTrade con posición $5–$20
- [ ] `updatePaperTradePnL(paperTrade)` → actualiza PnL
- [ ] `closePaperTrade(paperTrade, reason)` → cierra posición
- [ ] `resolvePaperTrade(paperTrade, outcome)` → resuelve contra resultado real

### 4.2 Script paper:update-pnl
- [ ] `scripts/update-pnl.ts`
- [ ] Itera sobre PaperTrades abiertos
- [ ] Obtiene precio actual del mercado
- [ ] Actualiza unrealized PnL
- [ ] Crea `PnlSnapshot`
- [ ] Comando: `npm run paper:update-pnl`

### 4.3 Script review:outcomes
- [ ] `scripts/review-outcomes.ts`
- [ ] Busca PaperTrades cuyos mercados se resolvieron
- [ ] Registra `OutcomeReview` con wasDecisionGood
- [ ] Actualiza realized PnL
- [ ] Comando: `npm run review:outcomes`

### 4.4 Sistema de Benchmarks
- [ ] `lib/simulation/benchmarks.ts`
- [ ] `compareBotVsBlindCopy()` → métricas comparativas
- [ ] `trackMissedWinners()` → ganadores perdidos
- [ ] `trackAvoidedLosers()` → perdedores evitados
- [ ] `trackSpreadLossesAvoided()` → pérdidas por spread

### 4.5 Tests
- [ ] `tests/simulation/paper-trader.test.ts`
- [ ] `tests/simulation/update-pnl.test.ts`

**Checkpoint:** Paper trades se crean, actualizan y resuelven automáticamente.

---

## Hito 5: Automejora

### 5.1 Motor de Reglas
- [ ] `lib/rules/rule-engine.ts`
- [ ] `loadActiveRules()` → RuleSet activo
- [ ] `proposeRuleChange(evidence)` → sugiere cambio
- [ ] `applyRuleChange(change)` → crea nuevo RuleSet + RuleChange
- [ ] `getRuleHistory()` → historial de versiones

### 5.2 Reglas Iniciales (Default Rules)
```json
{
  "version": "1.0.0",
  "thresholds": {
    "minGlobalScore": 0.65,
    "minLiquidity": 1000,
    "maxSpread": 0.05,
    "maxEntryDelayMinutes": 30,
    "minTimeToResolutionHours": 2,
    "minConsistencyScore": 0.4,
    "maxOneHitWonderRatio": 0.4,
    "minResolvedTrades": 5,
    "paperPositionMin": 5,
    "paperPositionMax": 20
  },
  "weights": {
    "walletQuality": 0.25,
    "categoryFit": 0.15,
    "entryTiming": 0.15,
    "spread": 0.10,
    "liquidity": 0.10,
    "roi": 0.10,
    "thesis": 0.10,
    "timeToResolution": 0.05
  }
}
```

### 5.3 Script update:rules
- [ ] `scripts/update-rules.ts`
- [ ] Analiza rendimiento reciente de reglas actuales
- [ ] Propone cambios basados en evidencia
- [ ] Aplica cambios automáticamente (sin aprobación)
- [ ] Registra `RuleChange` con before/after
- [ ] Comando: `npm run update:rules`

### 5.4 Tests
- [ ] `tests/rules/rule-versioning.test.ts`
- [ ] `tests/rules/auto-update.test.ts`

**Checkpoint:** Las reglas evolucionan automáticamente con registro de cambios.

---

## Hito 6: Reportes y Notificaciones

### 6.1 Generador de Reportes
- [ ] `lib/reports/daily-report.ts`
- [ ] `generateDailyReport()` → métricas del día
- [ ] `formatReportForTelegram(report)` → texto formateado

### 6.2 Integración Telegram
- [ ] `lib/notifications/telegram.ts`
- [ ] `sendMessage(text)` → envía a Telegram
- [ ] `sendDailyReport(report)` → envía reporte diario
- [ ] `sendAlert(event)` → alerta importante

### 6.3 Script report:daily
- [ ] `scripts/report-daily.ts`
- [ ] Genera reporte del día
- [ ] Envía por Telegram si está configurado
- [ ] Comando: `npm run report:daily`

**Checkpoint:** Reportes diarios generados y enviados por Telegram.

---

## Hito 7: Panel de Control (Dashboard)

### 7.1 Layout Base
- [ ] `app/layout.tsx` — Layout principal
- [ ] `components/layout/Navbar.tsx` — Navegación superior
- [ ] `components/layout/Sidebar.tsx` — Sidebar con 9 páginas
- [ ] `components/ui/` — Componentes reutilizables (Badge, ScoreBar, StatusDot, etc.)
- [ ] `components/charts/` — Wrappers de Recharts (PnlChart, WinRateChart, etc.)

### 7.2 Páginas del Dashboard

#### Overview (`app/page.tsx`)
- [ ] Tarjeta: PnL simulado total
- [ ] Tarjeta: Tasa de efectividad (win rate)
- [ ] Tarjeta: Posiciones abiertas
- [ ] Tarjeta: Billeteras activas
- [ ] Tarjeta: Candidatos de copia hoy
- [ ] Tarjeta: Estado del reporte diario
- [ ] Gráfico: PnL simulado a lo largo del tiempo

#### Wallet Rankings (`app/rankings/page.tsx`)
- [ ] Tabla: Top 500 billeteras
- [ ] Columnas: Address, Label, Rank, ROI, Consistency, Copyability, Penalty, Category, Status, Reason
- [ ] Filtros: Por status, por categoría, por score mínimo

#### Wallet Profile (`app/wallets/[address]/page.tsx`)
- [ ] Header: Address, Label, Status badge
- [ ] Métricas: ROI 30d, Trade count, Win rate, Avg size, Liquidity profile, Entry timing
- [ ] Notas de copyability
- [ ] Tabla: Operaciones recientes
- [ ] Rendimiento simulado si copiado

#### Trade Signals (`app/signals/page.tsx`)
- [ ] Tabla: Nuevas operaciones detectadas
- [ ] Columnas: Market, Entry Price, Current Price, Movement, Spread, Liquidity, Time left, Decision, Score, Reason
- [ ] Badges de decisión: paper_copy (verde), watchlist (amarillo), skip (rojo)

#### Paper Trades (`app/paper-trades/page.tsx`)
- [ ] Tabla: Operaciones simuladas activas y cerradas
- [ ] Columnas: Position size, Entry, Current, PnL, Status, Reason, Wallet, Market
- [ ] Indicador visual de PnL positivo/negativo

#### Decision Journal (`app/journal/page.tsx`)
- [ ] Timeline de decisiones tomadas
- [ ] Cada entrada: Decisión, Score breakdown, Reasons, Risks, Was it good? (retrospectiva)
- [ ] Lecciones aprendidas

#### Performance (`app/performance/page.tsx`)
- [ ] Gráfico: PnL acumulado
- [ ] Gráfico: Win rate
- [ ] Tabla: Performance por categoría
- [ ] Tabla: Performance por billetera
- [ ] Comparativa: Bot vs copia ciega
- [ ] Métricas: Ganadores perdidos, Perdedores evitados

#### Rules (`app/rules/page.tsx`)
- [ ] Reglas activas con valores actuales
- [ ] Timeline de cambios de reglas
- [ ] Cada cambio: Before → After, Razón, Evidencia, Timestamp

#### Reports (`app/reports/page.tsx`)
- [ ] Lista de reportes diarios
- [ ] Cada reporte: Fecha, PnL, Win rate, Mejores/Peores wallets, Cambios de reglas
- [ ] Vista detallada de reporte individual

### 7.3 Componentes de Gráficos
- [ ] `PnlChart` — Línea de PnL acumulado
- [ ] `WinRateChart` — Barras de win rate por día
- [ ] `CategoryPerformance` — Radar/barra por categoría
- [ ] `ScoreBreakdown` — Visualización de scores

**Checkpoint:** Dashboard funcional localmente con datos reales de SQLite.

---

## Hito 8: Motor de Backtesting

### 8.1 Motor de Backtesting
- [ ] `lib/backtesting/engine.ts`
- [ ] `runBacktest(walletAddress, startDate, endDate)` → simula copia histórica
- [ ] `calculateBacktestPnL(wallet, period)` → PnL hipotético
- [ ] `compareStrategies(wallets, period)` → comparativa

### 8.2 Script CLI
- [ ] `scripts/backtest.ts`
- [ ] Comando: `npm run backtest -- --wallet 0x... --days 30`

### 8.3 UI de Backtesting
- [ ] `app/backtesting/page.tsx`
- [ ] Selector de billetera + período
- [ ] Gráfico de PnL hipotético
- [ ] Métricas: ROI, Win rate, Max drawdown, Sharpe (simplificado)

**Checkpoint:** Backtesting funcional desde CLI y UI.

---

## Hito 9: Pruebas Finales y Despliegue

### 9.1 Tests de Seguridad
- [ ] `tests/security/readonly.test.ts` — Verifica que no hay funciones de escritura en blockchain
- [ ] `tests/security/no-real-execution.test.ts` — Verifica simulation_mode = paper_only
- [ ] `tests/security/redaction.test.ts` — Verifica redacción de secrets

### 9.2 Tests de Integración
- [ ] `tests/integration/full-pipeline.test.ts` — Pipeline completo: scan → score → simulate → report

### 9.3 Datos Seed
- [ ] `scripts/seed.ts`
- [ ] Datos demo claramente etiquetados como `[DEMO]`
- [ ] Wallets de ejemplo, trades, mercados
- [ ] Comando: `npm run seed`

### 9.4 Documentación Final
- [ ] README completo
- [ ] SAFETY.md completo
- [ ] Guía de despliegue en Vercel

### 9.5 Despliegue
- [ ] Configurar Vercel.json
- [ ] Desplegar dashboard
- [ ] Verificar todas las páginas

**Checkpoint final:** `npm run test` pasa todo. Dashboard en Vercel.

---

## Resumen de Dependencias entre Hitos

```
Hito 0 ──► Hito 1 ──► Hito 2 ──► Hito 3 ──► Hito 4 ──► Hito 5 ──► Hito 6
  │                                                       │
  └───────────────────────────────────────────────────────┼──► Hito 7 (Dashboard)
                                                          │
                                                          └──► Hito 8 (Backtesting)
                                                          │
                                                          └──► Hito 9 (Tests + Deploy)
```

---

## Orden de Ejecución para Desarrollo

1. **Semana 1:** Hito 0 + Hito 1 (Fundación + Adaptadores)
2. **Semana 2:** Hito 2 (Scanner y Perfilador)
3. **Semana 3:** Hito 3 + Hito 4 (Monitor + Simulación)
4. **Semana 4:** Hito 5 + Hito 6 (Reglas + Reportes)
5. **Semana 5:** Hito 7 (Dashboard — todas las páginas)
6. **Semana 6:** Hito 8 + Hito 9 (Backtesting + Tests + Deploy)
