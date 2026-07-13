# Ruta de Implementación — Polymarket Copy Trading Bot (MESIRVE)

> **Orden secuencial de construcción, paso a paso. Cada paso es un hito verificable.**
>
> **Estado actual:** ✅ Todos los hitos 0–10 completados. 343 tests pasando. Dashboard + i18n + UI Polish finalizado.

---

## Hito 0: Fundación del Proyecto

### 0.1 Inicializar Proyecto
```bash
npx create-next-app@latest mesirve-copybot --typescript --tailwind --eslint --app --src-dir
cd mesirve-copybot
```
- [x] Proyecto Next.js con TypeScript, Tailwind, ESLint, App Router
- [x] Estructura de carpetas: `lib/`, `scripts/`, `db/`, `components/`, `tests/`

### 0.2 Instalar Dependencias Base
- [x] Drizzle ORM + SQLite para datos
- [x] Recharts para gráficos
- [x] date-fns para manejo de fechas
- [x] Vitest para testing

### 0.3 Configurar Base de Datos
- [x] `db/schema.ts` — Todos los modelos (11 tablas) + índices
- [x] `db/index.ts` — Conexión y cliente Drizzle (WAL mode + FK)
- [x] `drizzle.config.ts` — Configuración de migraciones
- [x] `db/migrations/` — Migraciones generadas

### 0.4 Variables de Entorno
- [x] `.env.example` con todas las variables documentadas
- [x] `.env.local` para desarrollo local (gitignored)

### 0.5 Documentación de Seguridad
- [x] `SAFETY.md` explicando limitaciones v1 y riesgos
- [x] `README.md` con setup, comandos y arquitectura

**Checkpoint:** `npm run dev` arranca sin errores. `npm run db:migrate` crea la DB.

---

## Hito 1: Adaptadores de Polymarket

### 1.1 Adaptador Leaderboard
- [x] `lib/adapters/leaderboard.ts`
- [x] Función `fetchLeaderboard(limit: 500)` → top wallets (proxyWallet, userName, vol)
- [x] Función `fetchWalletActivity(address, days: 30)` → historial

### 1.2 Adaptador Mercados
- [x] `lib/adapters/markets.ts`
- [x] Función `fetchMarketData(marketId)` → precios, spread, liquidez
- [x] Función `fetchMarketOutcome(marketId)` → resultado final
- [x] Función `fetchMarketsByCondition(conditionId)` → mercados relacionados

### 1.3 Adaptador Operaciones
- [x] `lib/adapters/trades.ts`
- [x] Función `fetchRecentTrades(walletAddress)` → últimas operaciones
- [x] Función `fetchTradeHistory(walletAddress, days)` → historial

### 1.4 Adaptador Resultados
- [x] `lib/adapters/outcomes.ts`
- [x] Función `fetchResolvedMarkets()` → mercados resueltos
- [x] Función `fetchMarketResolution(marketId)` → resultado específico

### 1.5 Tests de Adaptadores
- [x] `tests/adapters/leaderboard.test.ts` (14 tests)
- [x] `tests/adapters/markets.test.ts` (17 tests)
- [x] `tests/adapters/trades.test.ts` (12 tests)
- [x] `tests/adapters/outcomes.test.ts` (23 tests)

**Checkpoint:** ✅ Tests de adaptadores pasan. APIs de Polymarket responden correctamente.

---

## Hito 2: Escáner y Perfilador

### 2.1 Motor de Scoring de Wallets
- [x] `lib/scoring/wallet-scoring.ts`
- [x] `scoreROI(roi)` → 0–1 (normalización logarítmica)
- [x] `scoreConsistency(trades)` → 0–1 (win rate + count + dispersión)
- [x] `scoreCopyability(wallet)` → 0–1 (size, frecuencia, spread+liquidez)
- [x] `calculateOneHitWonderPenalty(trades)` → 0–0.4
- [x] `scoreLiquidityQuality(wallet)` → 0–1 (escala logarítmica)
- [x] `scoreEntryTiming(wallet)` → 0–1 (ventana de tiempo)
- [x] `scoreResolvedPerformance(count, wr)` → 0–1
- [x] `calculateGlobalScore(scores)` → score final ponderado

### 2.2 Script scan:leaderboard
- [x] `scripts/scan-leaderboard.ts`
- [x] Escanea top 500 del leaderboard
- [x] Guarda `LeaderboardScan` en DB con rawSummaryJson
- [x] Comando: `npm run scan:leaderboard`

### 2.3 Script scan:wallets
- [x] `scripts/scan-wallets.ts`
- [x] Para cada wallet del scan, obtiene actividad 30d
- [x] Calcula scores con wallet-scoring
- [x] Asigna estado (track/watch/ignore)
- [x] Guarda/actualiza `WalletProfile` en DB
- [x] **CLI args:** `--limit`, `--skip-recent`
- [x] Comando: `npm run scan:wallets`

### 2.4 Tests de Scoring
- [x] `tests/scoring/wallet-scoring.test.ts` (132 tests)

**Checkpoint:** ✅ `npm run scan:leaderboard && npm run scan:wallets` puebla la DB.

---

## Hito 3: Monitoreo de Operaciones

### 3.1 Motor de Scoring de Operaciones
- [x] `lib/scoring/trade-scoring.ts`
- [x] 8 funciones de scoring individual
- [x] `calculateCopyScore(scores)` → weighted sum * confidence
- [x] `determineDecision(copyScore)` → paper_copy | watchlist | skip

### 3.2 Script monitor:trades
- [x] `scripts/monitor-trades.ts`
- [x] Para wallets con status "track", detecta nuevas operaciones
- [x] Crea `ObservedTrade` y `MarketSnapshot` en DB
- [x] Comando: `npm run monitor:trades`

### 3.3 Script score:trades
- [x] `scripts/score-trades.ts`
- [x] Para cada `ObservedTrade` sin decisión, calcula score
- [x] Crea `DecisionJournal` con decisión: paper_copy | watchlist | skip
- [x] Comando: `npm run score:trades`

### 3.4 Tests
- [x] `tests/scoring/trade-scoring.test.ts` (85 tests)

**Checkpoint:** ✅ `npm run monitor:trades && npm run score:trades` genera decisiones.

---

## Hito 4: Motor de Simulación

### 4.1 Motor Paper Trading
- [x] `lib/simulation/paper-trader.ts`
- [x] `createPaperTrade(decision)` → PaperTrade con posición $5–$20
- [x] `updatePaperTradePnL(paperTrade)` → actualiza PnL
- [x] `closePaperTrade(paperTrade, reason)` → cierra posición
- [x] `resolvePaperTrade(paperTrade, outcome)` → resuelve contra resultado real

### 4.2 Script paper:update-pnl
- [x] `scripts/update-pnl.ts`
- [x] Itera sobre PaperTrades abiertos
- [x] Obtiene precio actual del mercado
- [x] Actualiza unrealized PnL + crea PnlSnapshot
- [x] Comando: `npm run paper:update-pnl`

### 4.3 Script review:outcomes
- [x] `scripts/review-outcomes.ts`
- [x] Busca PaperTrades cuyos mercados se resolvieron
- [x] Registra `OutcomeReview` con wasDecisionGood
- [x] Actualiza realized PnL
- [x] Comando: `npm run review:outcomes`

### 4.4 Sistema de Benchmarks
- [x] `lib/simulation/benchmarks.ts`
- [x] `compareBotVsBlindCopy()` → métricas comparativas
- [x] `trackMissedWinners()` → ganadores perdidos
- [x] `trackAvoidedLosers()` → perdedores evitados
- [x] `trackSpreadLossesAvoided()` → pérdidas por spread

### 4.5 Tests
- [x] `tests/simulation/paper-trader.test.ts`
- [x] `tests/simulation/update-pnl.test.ts`
- [x] `tests/simulation/benchmarks.test.ts`

**Checkpoint:** ✅ Paper trades se crean, actualizan y resuelven automáticamente.

---

## Hito 5: Automejora

### 5.1 Motor de Reglas
- [x] `lib/rules/rule-engine.ts`
- [x] `loadActiveRules()` → RuleSet activo
- [x] `proposeRuleChange(evidence)` → sugiere cambio
- [x] `applyRuleChange(change)` → crea nuevo RuleSet + RuleChange
- [x] `getRuleHistory()` → historial de versiones

### 5.2 Reglas Iniciales (Default Rules)
- [x] Thresholds: minGlobalScore, minLiquidity, maxSpread, etc.
- [x] Weights: walletQuality, categoryFit, entryTiming, etc.
- [x] Version `1.0.0`

### 5.3 Script update:rules
- [x] `scripts/update-rules.ts`
- [x] Analiza rendimiento reciente de reglas actuales
- [x] Propone cambios basados en evidencia
- [x] Aplica cambios automáticamente
- [x] Registra `RuleChange` con before/after
- [x] Comando: `npm run update:rules`

### 5.4 Tests
- [x] `tests/rules/rule-versioning.test.ts`
- [x] `tests/rules/auto-update.test.ts`

**Checkpoint:** ✅ Las reglas evolucionan automáticamente con registro de cambios.

---

## Hito 6: Reportes y Notificaciones

### 6.1 Generador de Reportes
- [x] `lib/reports/daily-report.ts`
- [x] `generateDailyReport()` → métricas del día
- [x] `formatReportForTelegram(report)` → texto formateado
- [x] `getDailyReport(dateStr)` / `getAllDailyReports()` / `markReportSent()`

### 6.2 Integración Telegram
- [x] `lib/notifications/telegram.ts`
- [x] `sendMessage(text)` → envía a Telegram
- [x] `sendDailyReport(report)` → envía reporte diario
- [x] `sendAlert(event)` → alerta importante
- [x] `sendOnlineStatus()` → heartbeat de conexión

### 6.3 Script report:daily
- [x] `scripts/report-daily.ts`
- [x] Genera reporte del día
- [x] Envía por Telegram si está configurado
- [x] Comando: `npm run report:daily`

### 6.4 Resúmenes Semanales
- [x] `lib/reports/weekly-report.ts`
- [x] `generateWeeklyReport()` → métricas semanales
- [x] `formatWeeklyReportForTelegram(report)` → formato Telegram

**Checkpoint:** ✅ Reportes diarios generados y enviados por Telegram.

---

## Hito 7: Panel de Control (Dashboard)

### 7.1 Layout Base
- [x] `app/layout.tsx` — Layout principal con next-intl + theme + fonts
- [x] `components/layout/Navbar.tsx` — Navegación superior (Brain icon, ThemeToggle, título)
- [x] `components/layout/Sidebar.tsx` — Sidebar con 9 páginas + tooltips + Lucide icons
- [x] `components/ui/` — Badge, ScoreBar, StatusDot, Card, Tooltip
- [x] `components/charts/` — PnlChart, WinRateChart

### 7.2 Páginas del Dashboard

#### Overview (`app/page.tsx`)
- [x] Tarjetas: PnL simulado, Win rate, Posiciones abiertas, Wallets trackeadas
- [x] Gráfico: PnL acumulado
- [x] Sección: Señales de hoy + Estado del sistema

#### Wallet Rankings (`app/rankings/page.tsx`)
- [x] Tabla: Top wallets con scores y estados
- [x] Columnas: Address, Label, Global Score, ROI, Consistency, Copyability, etc.

#### Wallet Profile (`app/wallets/[address]/page.tsx`)
- [x] Header con status badge + scores + métricas 30d
- [x] Score breakdown visual
- [x] Notas de copyability y riesgo
- [x] Rendimiento simulado
- [x] Trades recientes observados

#### Trade Signals (`app/signals/page.tsx`)
- [x] Tabla de decisiones con badges de color
- [x] Badges: paper_copy (verde), watchlist (amarillo), skip (rojo)

#### Paper Trades (`app/paper-trades/page.tsx`)
- [x] Tabla: Position, Entry, Current, PnL, Status
- [x] Indicador visual de PnL positivo/negativo

#### Decision Journal (`app/journal/page.tsx`)
- [x] Timeline de decisiones
- [x] Score breakdown, Reasons, Risks, Retrospectiva

#### Performance (`app/performance/page.tsx`)
- [x] Gráfico PnL acumulado + Win rate diario
- [x] Tabla performance por wallet
- [x] Métricas: wins/losses, realizados vs no realizados

#### Rules (`app/rules/page.tsx`)
- [x] Reglas activas con valores actuales
- [x] Timeline de cambios con before/after, razón, evidencia

#### Reports (`app/reports/page.tsx`)
- [x] Lista de reportes diarios
- [x] Métricas: PnL, Win rate, mejores/peores wallets, cambios de reglas

### 7.3 Features UI Adicionales
- [x] **🌓 Theme Toggle** — Modo claro/oscuro con persistencia localStorage + FOUC prevention
- [x] **💡 Tooltips** — En sidebar con CSS puro, delay 250ms, posicionamiento derecho
- [x] **🎨 Lucide Icons** — En todas las páginas, sidebar, navbar, badges, cards
- [x] **🖼️ Favicon** — SVG personalizado con "M" verde degradado
- [x] **🌐 i18n** — next-intl, español completo, arquitectura multi-idioma
- [x] **📱 Responsive** — Sidebar colapsable con menú hamburguesa en mobile

**Checkpoint:** ✅ Dashboard funcional localmente con datos reales de SQLite. Traducido al español.

---

## Hito 8: Motor de Backtesting

### 8.1 Motor de Backtesting
- [x] `lib/backtesting/engine.ts`
- [x] `runBacktest(walletAddress, startDate, endDate)` → simula copia histórica
- [x] `calculateBacktestPnL(wallet, period)` → PnL hipotético
- [x] `compareStrategies(wallets, period)` → comparativa

### 8.2 Script CLI
- [x] `scripts/backtest.ts`
- [x] Comando: `npm run backtest -- --wallet 0x... --days 30`
- [x] Comando: `npm run backtest -- --compare 0xA...,0xB... --days 60`

### 8.3 UI de Backtesting
- [x] `app/backtesting/page.tsx`
- [x] Selector de wallet + período (single y comparativa)
- [x] Gráfico de PnL hipotético
- [x] Métricas: ROI, Win rate, Max drawdown

**Checkpoint:** ✅ Backtesting funcional desde CLI y UI.

---

## Hito 9: Pruebas Finales y Despliegue

### 9.1 Tests de Seguridad
- [x] `tests/security/readonly.test.ts` — Verifica que no hay funciones de escritura en blockchain
- [x] `tests/security/no-real-execution.test.ts` — Verifica simulation_mode = paper_only
- [x] `tests/security/redaction.test.ts` — Verifica redacción de secrets

### 9.2 Tests de Integración
- [x] `tests/integration/full-pipeline.test.ts` — Pipeline completo

### 9.3 Datos Seed
- [x] `scripts/seed.ts`
- [x] Datos demo etiquetados como `[DEMO]`
- [x] Comando: `npm run seed`

### 9.4 Documentación Final
- [x] README completo con setup, comandos, arquitectura
- [x] SAFETY.md completo con riesgos y mitigaciones
- [x] Guía de despliegue en Vercel

### 9.5 Despliegue
- [x] Configurar Vercel.json
- [x] Desplegar dashboard
- [x] Verificar todas las páginas

**Checkpoint final:** ✅ `npm run test` pasa todo (343 tests, 0 fallos). Dashboard en Vercel.

---

## Hito 10: UI Polish & Internacionalización (COMPLETADO)

### 10.1 Tema Claro/Oscuro
- [x] Componente ThemeToggle con persistencia localStorage
- [x] Prevención FOUC con script inline en `<head>`
- [x] Light mode overrides en globals.css

### 10.2 Tooltips en Sidebar
- [x] Componente Tooltip CSS puro (sin dependencias)
- [x] Delay 250ms, posicionamiento derecho
- [x] Flecha decorativa CSS + accesibilidad por teclado

### 10.3 Iconos Lucide
- [x] Reemplazar todos los emojis por Lucide icons en el dashboard
- [x] Consistencia visual: sidebar, navbar, páginas, badges, cards

### 10.4 Favicon
- [x] SVG personalizado con "M" verde degradado
- [x] Link element en layout.tsx

### 10.5 Internacionalización (next-intl)
- [x] Configurar plugin next-intl en next.config.js
- [x] Crear routing + request config
- [x] messages/es.json con ~250 keys en 14 namespaces
- [x] Traducir 9 páginas + sidebar + navbar + theme toggle + 404

### 10.6 Mejoras Adicionales
- [x] Navbar: emoji 🧠 → Brain Lucide icon
- [x] Cleanup: eliminar clases CSS muertas (card-custom, card-custom-sm)
- [x] DB: añadir índices a todas las tablas para optimizar queries
- [x] Rendimiento: migrar de `force-dynamic` a `revalidate = 60` (ISR)

**Checkpoint:** ✅ Dashboard traducido al español, tema claro/oscuro, tooltips, iconos Lucide.

---

## Hito 11: Mejoras Futuras (PROPUESTO)

### Corto Plazo
- [ ] **Soporte multi-idioma (EN)** — Crear `messages/en.json` + añadir `"en"` a routing.locales
- [ ] **Autenticación** — Login con NextAuth para acceso seguro al dashboard
- [ ] **TradingView charts** — Integrar gráficos profesionales de velas
- [ ] **WebSockets** — Precios en vivo via WebSocket de Polymarket
- [ ] **Exportación CSV/JSON** — Exportar trades, PnL y rendimiento

### Medio Plazo
- [ ] **Ejecución real (v2)** — Integración con API3 / Safe wallet para trades on-chain
- [ ] **PostgreSQL / Supabase** — Migrar de SQLite para escalabilidad multi-usuario
- [ ] **API REST pública** — Endpoints para acceder a datos del bot
- [ ] **Notificaciones push** — Alertas en navegador para nuevas señales
- [ ] **ML trade scoring** — Modelo de machine learning para mejorar predicciones
- [ ] **Walk-forward backtesting** — Validación más robusta de estrategias

### Largo Plazo
- [ ] **App móvil (React Native)** — Companion app para monitoreo mobile
- [ ] **Multi-portafolio** — Varios portafolios con distintos perfiles de riesgo
- [ ] **Market making simulado** — Estrategias de provisión de liquidez
- [ ] **DeFi integrations** — Yield farming, staking y otras estrategias
- [ ] **Social trading** — Compartir estrategias con la comunidad
- [ ] **Auditoría de seguridad externa** — Antes de cualquier ejecución real

---

## Resumen de Dependencias entre Hitos

```
Hito 0 ──► Hito 1 ──► Hito 2 ──► Hito 3 ──► Hito 4 ──► Hito 5 ──► Hito 6
  │                                                       │
  ├──────────────────────────────────────────────────────┼──► Hito 7 (Dashboard)
  │                                                      │
  │                                                      └──► Hito 8 (Backtesting)
  │                                                      │
  │                                                      └──► Hito 9 (Tests + Deploy)
  │                                                      │
  │                                                      └──► Hito 10 (UI + i18n)
  │                                                      │
  │                                                      └──► Hito 11 (Futuro)
```

---

## Orden de Ejecución para Desarrollo

| Semana | Hitos | Estado |
|--------|-------|--------|
| **Semana 1** | Hito 0 + Hito 1 (Fundación + Adaptadores) | ✅ |
| **Semana 2** | Hito 2 (Scanner y Perfilador) | ✅ |
| **Semana 3** | Hito 3 + Hito 4 (Monitor + Simulación) | ✅ |
| **Semana 4** | Hito 5 + Hito 6 (Reglas + Reportes) | ✅ |
| **Semana 5** | Hito 7 (Dashboard — 9 páginas) | ✅ |
| **Semana 6** | Hito 8 + Hito 9 (Backtesting + Tests + Deploy) | ✅ |
| **Semana 7** | Hito 10 (UI Polish + i18n) | ✅ |
| **Futuro** | Hito 11 (Mejoras propuestas) | ⏳ |
