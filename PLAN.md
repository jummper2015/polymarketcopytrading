# Plan de Implementación — Polymarket Copy Trading Bot (MESIRVE)

> **Versión 1.0 — Solo simulación (Paper Trading). Sin claves privadas, sin ejecución real.**
>
> **Idioma: Español (principal) · Arquitectura multi-idioma lista (next-intl)**

---

## Arquitectura General

```
┌─────────────────────────────────────────────────────────────────────┐
│                     CAPA 3: i18n (next-intl v4)                      │
│  messages/es.json → useTranslations → UI traducida                   │
│  Fácil extensión: crear messages/en.json + añadir locale            │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    CAPA 2: Panel de Control Vercel                    │
│  (Next.js + React + Tailwind + Lucide + Recharts)                    │
│                                                                      │
│  9 Páginas: Overview | Rankings | Wallet | Signals |                │
│             Paper Trades | Journal | Performance |                   │
│             Rules | Reports                                          │
│                                                                      │
│  UI Features: Theme toggle (🌓) · Tooltips · Favicon · Responsive    │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    CAPA 1: Operador Agente Jumper                     │
│  (Scripts CLI + SQLite local + Bucle operativo programado)           │
│                                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐           │
│  │ Escáner     │  │ Perfilador   │  │ Monitor de         │           │
│  │ Leaderboard │──│ de Wallets   │──│ Operaciones        │           │
│  └─────────────┘  └──────────────┘  └────────┬──────────┘           │
│                                              │                       │
│  ┌─────────────┐  ┌──────────────┐  ┌───────▼──────────┐           │
│  │ Actualizador│  │ Motor de     │  │ Calificador de   │           │
│  │ de Reglas   │──│ Simulación   │──│ Operaciones      │           │
│  └─────────────┘  └──────────────┘  └──────────────────┘           │
│                                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐           │
│  │ Revisor de  │  │ Reportes     │  │ Motor de           │           │
│  │ Resultados  │  │ Diarios      │  │ Backtesting        │           │
│  └─────────────┘  └──────────────┘  └───────────────────┘           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Stack Tecnológico

| Componente | Tecnología |
|------------|------------|
| Lenguaje | TypeScript 5.7+ |
| Framework Web | Next.js 15 (App Router) |
| UI | React 19 + Tailwind CSS 3.4 |
| Iconos | Lucide React 0.468+ |
| i18n | next-intl 4.13+ |
| Base de Datos | SQLite (better-sqlite3) |
| ORM | Drizzle ORM 0.38+ |
| APIs | APIs Públicas de Polymarket (CLOB + Gamma + Data) |
| Alertas | Telegram Bot API |
| Despliegue | Vercel |
| Testing | Vitest 2.1+ |
| Gráficos | Recharts 2.15+ |
| Programación | tsx (scripts locales) |

---

## Modelos de Base de Datos

```
LeaderboardScan        WalletProfile          ObservedTrade
─────────────────      ─────────────────      ─────────────────
id (PK)                id (PK)                id (PK)
source                 address (UQ)           walletAddress (IDX)
scannedAt (IDX)        label                  marketId (IDX)
walletCount            sourceRank             conditionId
lookbackDays           status (IDX)           marketQuestion
rawSummaryJson         roi30d                 marketCategory
                       consistencyScore       outcome
WalletProfile          copyabilityScore       side
─────────────────      oneHitWonderPenalty    walletEntryPrice
address (IDX)          globalScore (IDX)      detectedPrice
status (IDX)           bestCategory           size
globalScore (IDX)      categoryStrengthsJson  timestamp
                        ...más campos         rawTradeJson
                       createdAt / updatedAt  createdAt (IDX)

DecisionJournal        PaperTrade             PnlSnapshot
─────────────────      ─────────────────      ─────────────────
id (PK)                id (PK)                id (PK)
walletAddress (IDX)    walletAddress (IDX)    paperTradeId (IDX)
marketId (IDX)         marketId (IDX)         price
decision (IDX)         outcome                pnl
copyScore              side                   collectedAt (IDX)
confidence             entryPrice
reasonsJson            currentPrice           OutcomeReview
risksJson              simulatedPositionSize  ─────────────────
                        ...más campos         id (PK)
RuleSet                createdAt              paperTradeId (IDX)
─────────────────                           decisionJournalId (IDX)
id (PK)                RuleSet / RuleChange   reviewTime
version (IDX)          ────────────────       priceAfter1h/6h/24h
active (IDX)           Con índices en:        finalOutcome
rulesJson              oldRuleSetId (IDX)     simulatedPnl
createdAt              newRuleSetId (IDX)     wasDecisionGood
updatedAt              createdAt (IDX)        lessonsJson
                                                createdAt
RuleChange
─────────────────      DailyReport
id (PK)                ─────────────────
oldRuleSetId (IDX)     id (PK)
newRuleSetId (IDX)     date (IDX, UQ)
changedBy              paperPnl
reason                 winRate
evidenceSummary        openPositions
beforeJson             newSignals / copiedSignals
afterJson              watchedSignals / skippedSignals
createdAt (IDX)        bestWalletsJson / worstWalletsJson
                       ruleChangesJson
(Nota: IDX = índice  summary / sentToTelegram
para optimizar         createdAt
queries frecuentes)
```

---

## Fases de Implementación

### Fase 0: Fundación del Proyecto
**Objetivo:** Estructura base, configuración, y esquema de datos.

| # | Tarea | Dependencias | Estado |
|---|-------|-------------|--------|
| 0.1 | Inicializar proyecto Next.js + TypeScript + Tailwind | — | ✅ |
| 0.2 | Configurar Drizzle ORM + SQLite | 0.1 | ✅ |
| 0.3 | Crear esquema completo de base de datos (11 modelos + índices) | 0.2 | ✅ |
| 0.4 | Crear migraciones iniciales | 0.3 | ✅ |
| 0.5 | Configurar variables de entorno (.env.example) | 0.1 | ✅ |
| 0.6 | Configurar estructura de carpetas | 0.1 | ✅ |
| 0.7 | Crear SAFETY.md | — | ✅ |
| 0.8 | Actualizar README.md | 0.1 | ✅ |

### Fase 1: Adaptadores de Polymarket
**Objetivo:** Capa de abstracción para interactuar con APIs públicas de Polymarket.

| # | Tarea | Dependencias | Estado |
|---|-------|-------------|--------|
| 1.1 | Adaptador de Leaderboard (con proxyWallet, userName, vol fixes) | 0.6 | ✅ |
| 1.2 | Adaptador de Mercados (datos de mercado, precios) | 0.6 | ✅ |
| 1.3 | Adaptador de Operaciones (trades de wallets) | 0.6 | ✅ |
| 1.4 | Adaptador de Resultados (resolución de mercados) | 0.6 | ✅ |
| 1.5 | Tests unitarios para adaptadores (66 tests) | 1.1–1.4 | ✅ |

### Fase 2: Escáner y Perfilador de Wallets
**Objetivo:** Escanear las 500 top wallets y generar perfiles calificados.

| # | Tarea | Dependencias | Estado |
|---|-------|-------------|--------|
| 2.1 | Motor de scoring de wallets (ROI, consistencia, copyability, one-hit-wonder) | 0.3 | ✅ |
| 2.2 | Script: `scan:leaderboard` — Escanea top 500 wallets | 1.1, 0.3 | ✅ |
| 2.3 | Script: `scan:wallets` — Perfila y califica (CLI args: --limit, --skip-recent) | 2.1, 2.2 | ✅ |
| 2.4 | Tests unitarios para scoring de wallets (132 tests) | 2.1 | ✅ |

### Fase 3: Monitoreo de Operaciones
**Objetivo:** Detectar nuevas operaciones de wallets bajo seguimiento.

| # | Tarea | Dependencias | Estado |
|---|-------|-------------|--------|
| 3.1 | Motor de scoring de operaciones (trade scoring) | 2.2, 1.2 | ✅ |
| 3.2 | Script: `monitor:trades` — Detecta nuevas operaciones | 1.3, 2.3 | ✅ |
| 3.3 | Script: `score:trades` — Califica cada operación detectada | 3.1, 3.2 | ✅ |
| 3.4 | Tests para scoring de operaciones (85 tests) | 3.1 | ✅ |

### Fase 4: Motor de Simulación (Paper Trading)
**Objetivo:** Ejecutar operaciones simuladas con tracking de PnL.

| # | Tarea | Dependencias | Estado |
|---|-------|-------------|--------|
| 4.1 | Motor de simulación — Creación de PaperTrades | 3.3, 0.3 | ✅ |
| 4.2 | Script: `paper:update-pnl` — Actualización horaria de PnL | 4.1, 1.2 | ✅ |
| 4.3 | Script: `review:outcomes` — Revisión de resultados finales | 4.1, 1.4 | ✅ |
| 4.4 | Sistema de benchmarks (bot vs copia ciega) | 4.1 | ✅ |
| 4.5 | Tests para motor de simulación | 4.1 | ✅ |
| 4.6 | Tests para actualización horaria de PnL | 4.2 | ✅ |

### Fase 5: Automejora (Reglas Automáticas)
**Objetivo:** Sistema que actualiza reglas automáticamente basado en rendimiento.

| # | Tarea | Dependencias | Estado |
|---|-------|-------------|--------|
| 5.1 | Motor de reglas — Versionado y cambios automáticos | 0.3 | ✅ |
| 5.2 | Script: `update:rules` — Actualización automática de reglas | 5.1, 4.4 | ✅ |
| 5.3 | Tests para control de versiones de reglas | 5.1 | ✅ |
| 5.4 | Tests para cambios automáticos de reglas | 5.2 | ✅ |

### Fase 6: Reportes y Alertas
**Objetivo:** Generar informes diarios y enviar alertas por Telegram.

| # | Tarea | Dependencias | Estado |
|---|-------|-------------|--------|
| 6.1 | Generador de reportes diarios (fix: between con Date objects) | 4.3, 5.2 | ✅ |
| 6.2 | Integración con Telegram Bot API | 0.5 | ✅ |
| 6.3 | Script: `report:daily` — Envía reporte de fin de día | 6.1, 6.2 | ✅ |
| 6.4 | Resúmenes semanales | 6.1 | ✅ |

### Fase 7: Panel de Control (Dashboard)
**Objetivo:** Interfaz web pulida con 9 páginas.

| # | Tarea | Dependencias | Estado |
|---|-------|-------------|--------|
| 7.1 | Layout base + navegación + sidebar (con tooltips) | 0.6 | ✅ |
| 7.2 | Página: Overview (Resumen) — con iconos Lucide | 7.1, 4.2, 5.1 | ✅ |
| 7.3 | Página: Wallet Rankings | 7.1, 2.2 | ✅ |
| 7.4 | Página: Wallet Profile [dinámica] | 7.1, 2.2 | ✅ |
| 7.5 | Página: Trade Signals | 7.1, 3.3 | ✅ |
| 7.6 | Página: Paper Trades | 7.1, 4.1 | ✅ |
| 7.7 | Página: Decision Journal | 7.1, 3.3, 4.3 | ✅ |
| 7.8 | Página: Performance | 7.1, 4.4 | ✅ |
| 7.9 | Página: Rules | 7.1, 5.1 | ✅ |
| 7.10 | Página: Reports | 7.1, 6.1 | ✅ |
| 7.11 | Componentes compartidos (gráficos, badges, scores) | 7.1 | ✅ |

### Fase 8: Motor de Backtesting
**Objetivo:** Módulo para simular copia de wallets históricas.

| # | Tarea | Dependencias | Estado |
|---|-------|-------------|--------|
| 8.1 | Motor de backtesting | 2.2, 4.1 | ✅ |
| 8.2 | Script CLI para backtesting (con --compare) | 8.1 | ✅ |
| 8.3 | UI de backtesting en el dashboard | 8.1, 7.1 | ✅ |

### Fase 9: Pruebas, Seguridad y Documentación
**Objetivo:** Cobertura de tests, validación de seguridad, docs finales.

| # | Tarea | Dependencias | Estado |
|---|-------|-------------|--------|
| 9.1 | Tests de seguridad (solo lectura, no ejecución real) | Todas | ✅ |
| 9.2 | Tests de benchmarks | 4.4 | ✅ |
| 9.3 | Comando `npm run seed` para datos demo | 0.3 | ✅ |
| 9.4 | Documentación final en README.md | Todas | ✅ |
| 9.5 | Verificación de despliegue en Vercel | 7.x | ✅ |
| 9.6 | Tests de integración (full pipeline) | Todas | ✅ |

### Fase 10: UI Polish & Internacionalización (NUEVA)
**Objetivo:** Mejorar la experiencia visual y añadir soporte multi-idioma.

| # | Tarea | Dependencias | Estado |
|---|-------|-------------|--------|
| 10.1 | Tema claro/oscuro con persistencia (localStorage) y FOUC prevention | 7.1 | ✅ |
| 10.2 | Tooltips en sidebar con CSS puro y delay 250ms | 7.1 | ✅ |
| 10.3 | Reemplazar emojis por iconos Lucide en todas las páginas | 7.x | ✅ |
| 10.4 | Favicon SVG personalizado ("M" verde degradado) | 7.1 | ✅ |
| 10.5 | Instalar y configurar next-intl (i18n) con plugin Next.js | 7.1 | ✅ |
| 10.6 | Crear `messages/es.json` con todas las traducciones del sistema | 10.5 | ✅ |
| 10.7 | Traducir las 9 páginas, sidebar, navbar y componentes | 10.6 | ✅ |
| 10.8 | Reemplazar emoji 🧠 por icono Brain en navbar | 10.3 | ✅ |
| 10.9 | Limpiar clases CSS muertas (card-custom, card-custom-sm) | 7.1 | ✅ |
| 10.10 | Añadir índices DB para optimizar queries frecuentes | 0.3 | ✅ |

---

## Motores de Scoring

### Wallet Scoring (Puntuación de Wallets)

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
| `npm run build` | Build de producción (unset NODE_ENV) | deploy |
| `npm run db:migrate` | Ejecutar migraciones de base de datos | setup |
| `npm run seed` | Poblar base de datos con datos demo | setup |
| `npm run scan:leaderboard` | Escanear top 500 del leaderboard | diario |
| `npm run scan:wallets` | Perfilar y calificar wallets | diario |
| `npm run scan:wallets -- --limit 200 --skip-recent` | Perfilado selectivo | diario |
| `npm run monitor:trades` | Detectar nuevas operaciones | cada 15 min |
| `npm run score:trades` | Calificar operaciones detectadas | cada 15 min |
| `npm run paper:update-pnl` | Actualizar PnL simulado | cada hora |
| `npm run review:outcomes` | Revisar mercados resueltos | cada hora |
| `npm run update:rules` | Actualizar reglas automáticamente | diario |
| `npm run report:daily` | Generar y enviar reporte diario | diario |
| `npm run backtest` | Ejecutar backtesting | bajo demanda |
| `npm run backtest -- --wallet 0x... --days 30` | Backtest específico | bajo demanda |
| `npm run backtest -- --compare 0xA...,0xB... --days 60` | Comparativa | bajo demanda |
| `npm run test` | Ejecutar todos los tests (343+) | CI |

---

## Variables de Entorno

```env
# Base de datos
DATABASE_URL="file:./data/mesirve.db"

# APIs de Polymarket
POLYMARKET_CLOB_URL="https://clob.polymarket.com"
POLYMARKET_GAMMA_URL="https://gamma-api.polymarket.com"
POLYMARKET_DATA_URL="https://data-api.polymarket.com"

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
- ✅ `SIMULATION_MODE` forzado a `paper_only` en runtime
- ✅ Tests de seguridad automatizados
- ✅ Si una API falla, mostrar error real y detener

---

## Mejoras Futuras Propuestas

### Corto Plazo
- [ ] Soporte multi-idioma (EN) — Crear messages/en.json
- [ ] Autenticación de usuarios (NextAuth)
- [ ] TradingView chart integration
- [ ] WebSockets en tiempo real
- [ ] Exportación de datos (CSV/JSON)

### Medio Plazo
- [ ] Ejecución real v2 (API3 / Safe wallet)
- [ ] PostgreSQL / Supabase migration
- [ ] API REST pública
- [ ] Notificaciones push en navegador
- [ ] ML para trade scoring
- [ ] Walk-forward backtesting

### Largo Plazo
- [ ] App móvil (React Native)
- [ ] Multi-portafolio
- [ ] Market making simulado
- [ ] DeFi integrations
- [ ] Social trading
- [ ] Auditoría de seguridad externa
