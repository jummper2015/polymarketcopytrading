# Plan de Implementación — Polymarket Copy Trading Bot (Hermes)

> **Versión 1.0 — Solo simulación (Paper Trading). Sin claves privadas, sin ejecución real.**

---

## Arquitectura General

```
┌──────────────────────────────────────────────────────────────┐
│                    CAPA 1: Operador Agente Jumper             │
│  (Scripts CLI + SQLite local + Bucle operativo programado)    │
│                                                               │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐    │
│  │ Escáner     │  │ Perfilador   │  │ Monitor de         │    │
│  │ Leaderboard │──│ de Billeteras│──│ Operaciones        │    │
│  └─────────────┘  └──────────────┘  └────────┬──────────┘    │
│                                              │               │
│  ┌─────────────┐  ┌──────────────┐  ┌───────▼──────────┐    │
│  │ Actualizador│  │ Motor de     │  │ Calificador de   │    │
│  │ de Reglas   │──│ Simulación   │──│ Operaciones      │    │
│  └─────────────┘  └──────────────┘  └──────────────────┘    │
│                                                               │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐    │
│  │ Revisor de  │  │ Reportes     │  │ Motor de           │    │
│  │ Resultados  │  │ Diarios      │  │ Backtesting        │    │
│  └─────────────┘  └──────────────┘  └───────────────────┘    │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                 CAPA 2: Panel de Control Vercel               │
│  (Next.js + React + Tailwind + Desplegable en Vercel)        │
│                                                               │
│  9 Páginas: Overview | Rankings | Wallet | Signals |         │
│             Paper Trades | Journal | Performance |            │
│             Rules | Reports                                   │
└──────────────────────────────────────────────────────────────┘
```

---

## Stack Tecnológico

| Componente       | Tecnología                          |
|------------------|-------------------------------------|
| Lenguaje         | TypeScript                          |
| Framework Web    | Next.js (App Router)                |
| UI               | React + Tailwind CSS                |
| Base de Datos    | SQLite (local)                      |
| ORM              | Drizzle ORM                         |
| APIs             | APIs Públicas de Polymarket         |
| Alertas          | Telegram Bot API                    |
| Despliegue       | Vercel                              |
| Testing          | Vitest                              |
| Programación     | node-cron (scripts locales)         |

---

## Modelos de Base de Datos

```
LeaderboardScan        WalletProfile          ObservedTrade
─────────────────      ─────────────────      ─────────────────
id                     id                     id
source                 address                walletAddress
scannedAt              label                  marketId
walletCount            sourceRank             conditionId
lookbackDays           status                 marketQuestion
rawSummaryJson         roi30d                 marketCategory
                       consistencyScore       outcome
                       copyabilityScore       side
                       oneHitWonderPenalty    walletEntryPrice
                       globalScore            detectedPrice
                       bestCategory           size
                       categoryStrengthsJson  timestamp
                       averageTradeSize       rawTradeJson
                       tradeCount30d          createdAt
                       resolvedTradeCount30d
                       winRate30d             MarketSnapshot
                       averageLiquidity       ─────────────────
                       averageSpread          id
                       averageEntryTiming     marketId
                       copyabilityNotes       conditionId
                       riskNotes              question
                       lastScannedAt          category
                       createdAt / updatedAt  yesPrice / noPrice
                                              bestBid / bestAsk
DecisionJournal        PaperTrade             spread / liquidity
─────────────────      ─────────────────      volume
id                     id                     timeToResolution
observedTradeId        decisionJournalId      collectedAt
walletAddress          walletAddress          rawMarketJson
marketId               marketId
decision               outcome                PnlSnapshot
copyScore              side                   ─────────────────
confidence             entryPrice             id
reasonsJson            currentPrice           paperTradeId
risksJson              simulatedPositionSize  price
walletQualityScore     unrealizedPnl          pnl
roiScore               realizedPnl            collectedAt
consistencyScore       status
copyabilityScore       openedAt               OutcomeReview
categoryFitScore       closedAt               ─────────────────
entryTimingScore       resolvedAt             id
spreadScore                                   decisionJournalId
liquidityScore                                paperTradeId
thesisScore            RuleSet                reviewTime
simulatedPositionSize  ─────────────────      priceAfter1h/6h/24h
createdAt              id                     finalOutcome
                       version                simulatedPnl
                       active                 wasDecisionGood
                       rulesJson              lessonsJson
                       createdAt / updatedAt  createdAt

RuleChange             DailyReport
─────────────────      ─────────────────
id                     id
oldRuleSetId           date
newRuleSetId           paperPnl
changedBy              winRate
reason                 openPositions
evidenceSummary        newSignals
beforeJson             copiedSignals
afterJson              watchedSignals
createdAt              skippedSignals
                       bestWalletsJson
                       worstWalletsJson
                       ruleChangesJson
                       summary
                       sentToTelegram
                       createdAt
```

---

## Fases de Implementación

### Fase 0: Fundación del Proyecto
**Objetivo:** Estructura base, configuración, y esquema de datos.

| # | Tarea | Dependencias | Archivos Clave |
|---|-------|-------------|----------------|
| 0.1 | Inicializar proyecto Next.js + TypeScript + Tailwind | — | `package.json`, `tsconfig.json`, `tailwind.config.ts` |
| 0.2 | Configurar Drizzle ORM + SQLite | 0.1 | `drizzle.config.ts`, `db/schema.ts`, `db/index.ts` |
| 0.3 | Crear esquema completo de base de datos (todos los modelos) | 0.2 | `db/schema.ts` |
| 0.4 | Crear migraciones iniciales | 0.3 | `db/migrations/` |
| 0.5 | Configurar variables de entorno (.env.example) | 0.1 | `.env.example`, `.env.local` |
| 0.6 | Configurar estructura de carpetas | 0.1 | `lib/`, `scripts/`, `app/`, `components/` |
| 0.7 | Crear SAFETY.md | — | `SAFETY.md` |
| 0.8 | Actualizar README.md | 0.1 | `README.md` |

### Fase 1: Adaptadores de Polymarket
**Objetivo:** Capa de abstracción para interactuar con APIs públicas de Polymarket.

| # | Tarea | Dependencias | Archivos Clave |
|---|-------|-------------|----------------|
| 1.1 | Adaptador de Leaderboard (tabla de clasificación) | 0.6 | `lib/adapters/leaderboard.ts` |
| 1.2 | Adaptador de Mercados (datos de mercado, precios) | 0.6 | `lib/adapters/markets.ts` |
| 1.3 | Adaptador de Operaciones (trades de billeteras) | 0.6 | `lib/adapters/trades.ts` |
| 1.4 | Adaptador de Resultados (resolución de mercados) | 0.6 | `lib/adapters/outcomes.ts` |
| 1.5 | Tests unitarios para adaptadores | 1.1–1.4 | `tests/adapters/` |

### Fase 2: Escáner y Perfilador de Billeteras
**Objetivo:** Escanear las 500 top billeteras y generar perfiles calificados.

| # | Tarea | Dependencias | Archivos Clave |
|---|-------|-------------|----------------|
| 2.1 | Script: `scan:leaderboard` — Escanea top 500 billeteras | 1.1, 0.3 | `scripts/scan-leaderboard.ts` |
| 2.2 | Motor de puntuación de billeteras (ROI, consistencia, copyability, penalización one-hit-wonder) | 0.3 | `lib/scoring/wallet-scoring.ts` |
| 2.3 | Script: `scan:wallets` — Perfila y califica cada billetera | 2.1, 2.2 | `scripts/scan-wallets.ts` |
| 2.4 | Tests unitarios para puntuación de billeteras | 2.2 | `tests/scoring/wallet-scoring.test.ts` |
| 2.5 | Tests para penalización one-hit-wonder | 2.2 | `tests/scoring/one-hit-wonder.test.ts` |

### Fase 3: Monitoreo de Operaciones
**Objetivo:** Detectar nuevas operaciones de billeteras bajo seguimiento.

| # | Tarea | Dependencias | Archivos Clave |
|---|-------|-------------|----------------|
| 3.1 | Motor de puntuación de operaciones (trade scoring) | 2.2, 1.2 | `lib/scoring/trade-scoring.ts` |
| 3.2 | Script: `monitor:trades` — Detecta nuevas operaciones | 1.3, 2.3 | `scripts/monitor-trades.ts` |
| 3.3 | Script: `score:trades` — Califica cada operación detectada | 3.1, 3.2 | `scripts/score-trades.ts` |
| 3.4 | Tests para puntuación de operaciones | 3.1 | `tests/scoring/trade-scoring.test.ts` |

### Fase 4: Motor de Simulación (Paper Trading)
**Objetivo:** Ejecutar operaciones simuladas con tracking de PnL.

| # | Tarea | Dependencias | Archivos Clave |
|---|-------|-------------|----------------|
| 4.1 | Motor de simulación — Creación de PaperTrades | 3.3, 0.3 | `lib/simulation/paper-trader.ts` |
| 4.2 | Script: `paper:update-pnl` — Actualización horaria de PnL | 4.1, 1.2 | `scripts/update-pnl.ts` |
| 4.3 | Script: `review:outcomes` — Revisión de resultados finales | 4.1, 1.4 | `scripts/review-outcomes.ts` |
| 4.4 | Sistema de benchmarks (bot vs copia ciega) | 4.1 | `lib/simulation/benchmarks.ts` |
| 4.5 | Tests para motor de simulación | 4.1 | `tests/simulation/paper-trader.test.ts` |
| 4.6 | Tests para actualización horaria de PnL | 4.2 | `tests/simulation/update-pnl.test.ts` |

### Fase 5: Automejora (Reglas Automáticas)
**Objetivo:** Sistema que actualiza reglas automáticamente basado en rendimiento.

| # | Tarea | Dependencias | Archivos Clave |
|---|-------|-------------|----------------|
| 5.1 | Motor de reglas — Versionado y cambios automáticos | 0.3 | `lib/rules/rule-engine.ts` |
| 5.2 | Script: `update:rules` — Actualización automática de reglas | 5.1, 4.4 | `scripts/update-rules.ts` |
| 5.3 | Tests para control de versiones de reglas | 5.1 | `tests/rules/rule-versioning.test.ts` |
| 5.4 | Tests para cambios automáticos de reglas | 5.2 | `tests/rules/auto-update.test.ts` |

### Fase 6: Reportes y Alertas
**Objetivo:** Generar informes diarios y enviar alertas por Telegram.

| # | Tarea | Dependencias | Archivos Clave |
|---|-------|-------------|----------------|
| 6.1 | Generador de reportes diarios | 4.3, 5.2 | `lib/reports/daily-report.ts` |
| 6.2 | Integración con Telegram Bot API | 0.5 | `lib/notifications/telegram.ts` |
| 6.3 | Script: `report:daily` — Envía reporte de fin de día | 6.1, 6.2 | `scripts/report-daily.ts` |
| 6.4 | Resúmenes semanales | 6.1 | `lib/reports/weekly-report.ts` |

### Fase 7: Panel de Control (Dashboard)
**Objetivo:** Interfaz web pulida con las 9 páginas requeridas.

| # | Tarea | Dependencias | Archivos Clave |
|---|-------|-------------|----------------|
| 7.1 | Layout base + navegación + tema Max HQ | 0.6 | `app/layout.tsx`, `components/layout/` |
| 7.2 | Página: Overview (Resumen) | 7.1, 4.2, 5.1 | `app/page.tsx` |
| 7.3 | Página: Wallet Rankings | 7.1, 2.2 | `app/rankings/page.tsx` |
| 7.4 | Página: Wallet Profile [dinámica] | 7.1, 2.2 | `app/wallets/[address]/page.tsx` |
| 7.5 | Página: Trade Signals | 7.1, 3.3 | `app/signals/page.tsx` |
| 7.6 | Página: Paper Trades | 7.1, 4.1 | `app/paper-trades/page.tsx` |
| 7.7 | Página: Decision Journal | 7.1, 3.3, 4.3 | `app/journal/page.tsx` |
| 7.8 | Página: Performance | 7.1, 4.4 | `app/performance/page.tsx` |
| 7.9 | Página: Rules | 7.1, 5.1 | `app/rules/page.tsx` |
| 7.10 | Página: Reports | 7.1, 6.1 | `app/reports/page.tsx` |
| 7.11 | Componentes compartidos (gráficos, badges, scores) | 7.1 | `components/ui/`, `components/charts/` |

### Fase 8: Motor de Backtesting
**Objetivo:** Módulo para simular copia de billeteras históricas.

| # | Tarea | Dependencias | Archivos Clave |
|---|-------|-------------|----------------|
| 8.1 | Motor de backtesting | 2.2, 4.1 | `lib/backtesting/engine.ts` |
| 8.2 | Script CLI para backtesting | 8.1 | `scripts/backtest.ts` |
| 8.3 | UI de backtesting en el dashboard | 8.1, 7.1 | `app/backtesting/page.tsx` |

### Fase 9: Pruebas, Seguridad y Documentación
**Objetivo:** Cobertura de tests, validación de seguridad, docs finales.

| # | Tarea | Dependencias | Archivos Clave |
|---|-------|-------------|----------------|
| 9.1 | Tests de seguridad (solo lectura, no ejecución real) | Todas | `tests/security/` |
| 9.2 | Tests de benchmarks | 4.4 | `tests/simulation/benchmarks.test.ts` |
| 9.3 | Comando `npm run seed` para datos demo | 0.3 | `scripts/seed.ts` |
| 9.4 | Documentación final en README.md | Todas | `README.md` |
| 9.5 | Verificación de despliegue en Vercel | 7.x | — |

---

## Motores de Scoring

### Wallet Scoring (Puntuación de Billeteras)

```
globalScore = (
  roiScore          * 0.25 +
  consistencyScore  * 0.25 +
  copyabilityScore  * 0.20 +
  categoryStrength  * 0.10 +
  liquidityQuality  * 0.10 +
  entryTiming       * 0.05 +
  resolvedPerformance * 0.05
) - oneHitWonderPenalty
```

**Penalización One-Hit-Wonder:**
- Si >60% de la ganancia viene de 1 sola operación → penalty = 0.40
- Si >40% de la ganancia viene de 1 sola operación → penalty = 0.20
- Si >25% de la ganancia viene de 1 sola operación → penalty = 0.10

**Estados:** `track` (score > 0.7), `watch` (0.4–0.7), `ignore` (< 0.4 o penalizado)

### Trade Scoring (Puntuación de Operaciones)

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

**Decisiones:** `paper_copy` (score > 0.65), `watchlist` (0.35–0.65), `skip` (< 0.35)

---

## Comandos CLI

| Comando | Descripción | Frecuencia |
|---------|-------------|------------|
| `npm run dev` | Iniciar dashboard en modo desarrollo | — |
| `npm run db:migrate` | Ejecutar migraciones de base de datos | setup |
| `npm run seed` | Poblar base de datos con datos demo | setup |
| `npm run scan:leaderboard` | Escanear top 500 del leaderboard | diario |
| `npm run scan:wallets` | Perfilar y calificar billeteras | diario |
| `npm run monitor:trades` | Detectar nuevas operaciones | cada 15 min |
| `npm run score:trades` | Calificar operaciones detectadas | cada 15 min |
| `npm run paper:update-pnl` | Actualizar PnL simulado | cada hora |
| `npm run review:outcomes` | Revisar mercados resueltos | cada hora |
| `npm run update:rules` | Actualizar reglas automáticamente | diario |
| `npm run report:daily` | Generar y enviar reporte diario | diario |
| `npm run backtest` | Ejecutar backtesting | bajo demanda |
| `npm run test` | Ejecutar todos los tests | CI |

---

## Variables de Entorno

```env
# Base de datos
DATABASE_URL="file:./data/hermes.db"

# APIs de Polymarket
POLYMARKET_API_URL="https://clob.polymarket.com"
POLYMARKET_GAMMA_URL="https://gamma-api.polymarket.com"

# Telegram (opcional en v1)
TELEGRAM_BOT_TOKEN=""
TELEGRAM_CHAT_ID=""

# Modo
NODE_ENV="development"
SIMULATION_MODE="paper_only"  # Siempre paper_only en v1
```

---

## Principios de Seguridad (v1)

- ❌ No almacenar claves privadas
- ❌ No firmar transacciones
- ❌ No ejecutar operaciones reales
- ❌ No gastar dinero
- ✅ Solo simulación (paper trading)
- ✅ Redactar secretos en logs y UI
- ✅ Usar variables de entorno para keys
- ✅ APIs públicas únicamente
- ✅ Datos demo etiquetados como tales
- ✅ Si una API falla, mostrar error real y detener
