# Diario de Desarrollo — Polymarket Copy Trading Bot

> **Registro vivo del recorrido de desarrollo. Cada entrada documenta decisiones, avances, bloqueos y aprendizajes.**

---

## Diagnóstico General: ¿Por qué el Bot NO está Operando?

### Resumen Ejecutivo

Tras una revisión exhaustiva del sistema, se identificaron **6 causas raíz** que impiden que el bot opere correctamente:

| # | Causa | Severidad | Estado |
|---|-------|-----------|--------|
| 1 | **Falta de automatización/scheduler** | 🔴 Crítica | Sin resolver |
| 2 | **Pipeline bloqueado en score:trades** (0 market snapshots) | 🔴 Crítica | Sin resolver |
| 3 | **Script faltante: paper:create** (processPendingDecisions sin invocar) | 🔴 Crítica | Sin resolver |
| 4 | **Market ID mismatch** entre APIs de Polymarket | 🟡 Alta | Sin resolver |
| 5 | **Base de datos con nombre antiguo** (hermes.db vs mesirve.db) | 🟢 Baja | Sin resolver |
| 6 | **Datos de seed/scan posiblemente obsoletos** (scan de 2025-05-15) | 🟡 Media | Sin resolver |

---

### 🔴 Causa 1: Falta de Automatización / Scheduler

**Problema:** Todos los scripts son comandos CLI que se ejecutan una vez y terminan. No existe:
- Cron job
- systemd timer
- Script daemon
- Gestor de procesos (PM2, forever, etc.)
- GitHub Actions / workflow programado

**Evidencia:**
```bash
# Los scripts deben ejecutarse MANUALMENTE en este orden:
npm run scan:leaderboard      # Diario
npm run scan:wallets          # Diario
npm run monitor:trades        # Cada 15 min
npm run score:trades          # Cada 15 min
npm run paper:update-pnl      # Cada hora
npm run review:outcomes       # Cada hora
npm run update:rules          # Diario
npm run report:daily          # Diario
```

**Impacto:** Sin automatización, el bot nunca opera de forma continua.

---

### 🔴 Causa 2: Pipeline Bloqueado en score:trades

**Problema:** El script `monitor:trades` no logra crear `market_snapshot` porque la API de Polymarket devuelve errores 422.

**Estado actual de la base de datos:**
```
observed_trade:   13 registros (trades detectados)
market_snapshot:  0  registros ← ¡CERO! Esto bloquea todo
wallet_profile:   ~250 wallets
paper_trade:      0  ← No hay trades porque no hay decisiones
```

**Causa raíz:**
- `fetchWalletActivity()` en `leaderboard.ts` usa `conditionId` como `marketId`
- `fetchMarketData()` en `markets.ts` llama a `gamma-api.polymarket.com/markets/{marketId}`
- Gamma API espera un **slug** o **ID de mercado**, no un `conditionId`
- Resultado: error 422 → `saveMarketSnapshotIfNew()` captura el error y retorna `false`
- Sin market snapshots → `score:trades` no puede cargar datos de mercado → skips ALL trades

**Flujo del error:**
```
1. monitor:trades detecta trade con conditionId = "0xabc..."
2. Intenta fetchMarketData("0xabc...")  ← USANDO conditionId COMO marketId
3. Gamma API: GET /markets/0xabc... → 422 Unprocessable Entity
4. saveMarketSnapshotIfNew captura error → return false
5. → market_snapshot queda vacía
6. score:trades LEFT JOIN → no encuentra market_snapshot → skips trade
7. → 0 decisiones, 0 paper trades
```

---

### 🔴 Causa 3: Script Faltante paper:create

**Problema:** `lib/simulation/paper-trader.ts` exporta `processPendingDecisions()` pero **NINGÚN SCRIPT LA INVOCA**.

**Pipeline actual:**
```
monitor:trades → score:trades → ??? → paper:update-pnl → review:outcomes
                                    ^
                          FALTA ESTE ESLABÓN
```

**Impacto:** Incluso si `score:trades` generara decisiones `paper_copy`, nunca se crearían los PaperTrades simulados.

---

### 🟡 Causa 4: Market ID Mismatch

**Problema:** La API de actividad de Polymarket (Data API) y la API de mercados (Gamma API) usan identificadores diferentes.

**Detalle técnico:**
- `leaderboard.ts` `fetchWalletActivity()` obtiene `conditionId` del campo `conditionId` en la respuesta
- Este `conditionId` se asigna a `marketId` en `ObservedTrade`
- `markets.ts` `fetchMarketData()` construye URL: `gamma-api.polymarket.com/markets/{marketId}`
- Gamma API espera un slug de mercado (ej: `"will-the-federal-reserve-cut-rate"`) o un ID numérico
- `conditionId` es un hash hexadecimal como `0xabc123...` → Gamma no lo reconoce → 422

**Solución necesaria:** Usar `conditionId` para buscar mercados via query parameter en Gamma: `gamma-api.polymarket.com/markets?condition_id=0xabc...` en vez de path parameter.

---

### 🟢 Causa 5: Base de Datos con Nombre Antiguo

**Problema:** El archivo se llama `data/hermes.db` cuando debería ser `data/mesirve.db` tras el renombre.

**Impacto:** Bajo. Solo afecta consistencia de nombres. El `.env.local` apunta correctamente a `hermes.db`.

---

### 🟡 Causa 6: Datos Obsoletos

**Problema:** El último scan del leaderboard es de **2025-05-15** (más de un año).

**Impacto:** Las wallets en `wallet_profile` pueden no reflejar el estado actual del mercado. Los datos seed demo están etiquetados como `[DEMO]`.

---

## Plan de Acción Inmediato (Prioridad Alta)

| Tarea | Prioridad | Esfuerzo | Dependencias |
|-------|-----------|----------|--------------|
| **A. Crear script paper:create** que invoque `processPendingDecisions()` | 🔴 Alta | Bajo (~30 líneas) | Causa 2 resuelta |
| **B. Fix Market ID mapping** en `saveMarketSnapshotIfNew()` | 🔴 Alta | Medio (~50 líneas) | — |
| **C. Crear script daemon/runner** que ejecute el pipeline completo | 🔴 Alta | Medio (~100 líneas) | A, B |
| **D. Añadir comando `npm run paper:create`** en package.json | 🟡 Media | Bajo (~1 línea) | A |
| **E. Renombrar DB** a mesirve.db | 🟢 Baja | Bajo (~1 línea) | — |
| **F. Re-scanear leaderboard y wallets** con datos fresh | 🟡 Media | Medio (tiempo API) | B |
| **G. Añadir logging y monitoreo de health** | 🟡 Media | Medio | — |

---

### Próximos Pasos Recomendados

1. **Fix Market ID mapping** — Prioridad #1: Sin esto, no se pueden crear market snapshots
2. **Crear script paper:create** — Prioridad #2: Cerrar el pipeline faltante
3. **Crear scheduler/daemon** — Prioridad #3: Automatizar la ejecución
4. **Re-scanear datos** — Prioridad #4: Tener datos frescos para operar


---

## Formato de Entrada

```markdown
### [YYYY-MM-DD] — Título del Hito o Tarea

**Estado:** ✅ Completado | 🚧 En progreso | ❌ Bloqueado | ⏳ Pendiente

**Resumen:**
Qué se hizo, qué funcionó, qué no.

**Archivos modificados/creados:**
- `ruta/archivo.ts`

**Decisiones tomadas:**
- Decisión 1 y por qué

**Problemas encontrados:**
- Problema → Solución aplicada

**Próximos pasos:**
- [ ] Paso 1
```

---

## Registro

### [2026-07-12] — Inicio del Proyecto: Planificación

**Estado:** ✅ Completado

**Resumen:**
Creación de los documentos fundacionales del proyecto: PLAN.md, ROADMAP.md, DEVLOG.md. Stack definido: TypeScript, Next.js, React, Tailwind, SQLite, Drizzle ORM, APIs públicas de Polymarket, Vercel.

**Archivos creados:**
- `PLAN.md`, `ROADMAP.md`, `DEVLOG.md`

### [2026-07-12] — Hito 0: Fundación del Proyecto

**Estado:** ✅ Completado

**Resumen:**
Proyecto Next.js inicializado manualmente. TypeScript estricto + Tailwind CSS + Drizzle ORM con SQLite. Esquema de 11 tablas. Vitest, Recharts. Tema oscuro personalizado (brand green + surface grays). Build y typecheck pasan.

**Archivos creados/modificados:**
- `package.json`, `tsconfig.json`, `next.config.js`, `tailwind.config.ts`, `postcss.config.js`
- `drizzle.config.ts`, `vitest.config.ts`, `.env.example`, `.gitignore`
- `db/schema.ts` (11 modelos), `db/index.ts`, `db/migrations/`
- `app/layout.tsx`, `app/globals.css`, `app/page.tsx`
- `lib/` stubs varios

**Problemas encontrados:**
- `drizzle-kit push` fallaba porque `data/` no existía → crear directorio antes del push
- Next.js build fallaba por `autoprefixer` no instalado → `npm install -D autoprefixer`

### [2026-07-12] — Correcciones post code-review

**Estado:** ✅ Completado

**Resumen:**
Fixes aplicados tras revisión: serverExternalPackages, Inter + JetBrains Mono fonts, SAFETY.md, README.md, 10 stubs de scripts CLI, parsing de DATABASE_URL, engines.node >= 20.

### [2026-07-12] — Hito 1: Adaptadores de Polymarket

**Estado:** ✅ Completado

**Resumen:**
4 adaptadores completos: leaderboard, markets, trades, outcomes. Cliente HTTP compartido con retry + rate limiting. Builder tipado para fetchMarketData. Tests: 66 tests unitarios con mocks.

**Corrección posterior:** Adaptador leaderboard actualizado para usar `proxyWallet` (address), `userName` (label), `vol` (volume) de la Polymarket Data API.

**Archivos creados:**
- `lib/adapters/client.ts`, `lib/adapters/leaderboard.ts`, `lib/adapters/markets.ts`
- `lib/adapters/trades.ts`, `lib/adapters/outcomes.ts`
- `tests/adapters/leaderboard.test.ts`, `tests/adapters/markets.test.ts`
- `tests/adapters/trades.test.ts`, `tests/adapters/outcomes.test.ts`

### [2026-07-12] — Hito 2: Scanner y Perfilador

**Estado:** ✅ Completado

**Resumen:**
- Motor de scoring de wallets: 8 componentes + penalización one-hit-wonder + 132 tests
- `scan:leaderboard` — Escanea top 500, stats, guarda snapshot
- `scan:wallets` — Perfila en batches con upsert, calcula scores
- Tests: 132 tests unitarios

**Mejora posterior:** `scan:wallets` ahora soporta `--limit` y `--skip-recent` para escaneo selectivo.

### [2026-07-12] — Hito 3: Monitoreo de Operaciones

**Estado:** ✅ Completado

**Resumen:**
- Motor de scoring de trades: 8 componentes + confidence multiplier + 85 tests
- `monitor:trades` — Detecta nuevas operaciones + market snapshots
- `score:trades` — Califica operaciones → DecisionJournal

### [2026-07-12] — Hito 4: Motor de Simulación

**Estado:** ✅ Completado

**Resumen:**
- Paper trader: create/update/close/resolve + batch processing (430 líneas)
- `update-pnl` — Actualización horaria de PnL desde precios reales
- `review:outcomes` — Revisión de resultados con OutcomeReview
- Benchmarks: bot vs copia ciega, winners/losers tracking

### [2026-07-12] — Hito 5: Automejora

**Estado:** ✅ Completado

**Resumen:**
- Rule engine: versionado, propuesta de cambios, aplicación automática
- `update:rules` — Auto-actualización basada en evidencia
- Tests: rule-versioning + auto-update

### [2026-07-12] — Hito 6: Reportes y Alertas

**Estado:** ✅ Completado

**Resumen:**
- Daily report generator con métricas de portafolio + wallets + reglas
- Weekly report generator
- Telegram integration: sendMessage, sendDailyReport, sendAlert, sendOnlineStatus
- `report:daily` — Orquesta generación + envío

**Fix posterior:** `between()` corregido para usar objetos Date en vez de Unix timestamps.

### [2026-07-12] — Hito 7: Panel de Control (Dashboard)

**Estado:** ✅ Completado

**Resumen:**
Layout base con sidebar + navbar + 9 páginas funcionando. Componentes compartidos (Badge, ScoreBar, StatusDot, Card). Gráficos Recharts (PnLChart, WinRateChart). Página dinámica de perfil de wallet.

**Cambios de rendimiento:** Todas las páginas migraron de `force-dynamic` a `revalidate = 60` para ISR.

### [2026-07-12] — Hito 8: Backtesting

**Estado:** ✅ Completado

**Resumen:**
Motor de backtesting con CLI (`--wallet`, `--days`, `--compare`) y UI en dashboard (selector de wallet, período, gráfico PnL, tabla de trades, modo comparativa).

### [2026-07-12] — Hito 9: Pruebas, Seguridad y Despliegue

**Estado:** ✅ Completado

**Resumen:**
- Tests de seguridad (readonly, no-real-execution, redaction): 3 archivos
- Tests de integración (full pipeline): scan → score → simulate → report
- Seed script con datos demo
- Vercel config + despliegue
- **Total: 343 tests, 15 archivos, 0 fallos**

---

### [2026-07-13] — Fase 10: UI Polish — Tema Claro/Oscuro

**Estado:** ✅ Completado

**Resumen:**
Implementado ThemeToggle con persistencia en localStorage, prevención de FOUC (flash of unstyled content) via inline script en `<head>`. Estilos light mode en `globals.css`. Iconos Sun/Moon de Lucide.

**Archivos creados/modificados:**
- `components/theme-toggle.tsx` — Nuevo componente
- `app/layout.tsx` — Inline script para FOUC prevention + ThemeToggle en navbar
- `app/globals.css` — Light mode overrides

**Decisiones tomadas:**
- **localStorage > prefers-color-scheme**: localStorage tiene prioridad. Si no hay stored, usa preferencia del SO.
- **FOUC prevention con script inline**: Se ejecuta antes del render para evitar flash de tema incorrecto.
- **size-8 placeholder durante SSR**: Evita layout shift mientras el componente monta.

---

### [2026-07-13] — Fase 10: UI Polish — Tooltips en Sidebar

**Estado:** ✅ Completado

**Resumen:**
Componente Tooltip ligero (CSS puro, sin dependencias) con posicionamiento a la derecha (ideal para sidebar), delay de 250ms, flecha decorativa CSS, y soporte para focus/blur (accesibilidad por teclado). Todos los items del sidebar tienen descripciones en español.

**Archivos creados/modificados:**
- `components/ui/tooltip.tsx` — Nuevo componente
- `components/layout/sidebar.tsx` — Tooltips envueltos en cada nav item

**Decisiones tomadas:**
- **CSS puro sobre librerías**: Evita añadir dependencias (no @radix-ui/tooltip, no @floating-ui). Suficiente para sidebar estático.
- **Delay 250ms**: Suficiente para evitar tooltips accidentales al pasar el mouse rápidamente, pero sin sentirse lento.
- **`pointer-events-none`**: Previene que el tooltip interfiera con clicks.

---

### [2026-07-13] — Fase 10: UI Polish — Iconos Lucide en Todo el Dashboard

**Estado:** ✅ Completado

**Resumen:**
Reemplazados todos los emojis e iconos inline por componentes Lucide React en las 9 páginas, sidebar, navbar, badges, cards y componentes. Consistencia visual total.

**Archivos modificados:**
- `components/layout/sidebar.tsx` — Emojis → Lucide icons (LayoutDashboard, Trophy, Bell, ClipboardList, etc.)
- `components/layout/navbar.tsx` — 🧠 → Brain icon
- `app/page.tsx`, `app/rankings/page.tsx`, `app/signals/page.tsx`
- `app/paper-trades/page.tsx`, `app/journal/page.tsx`, `app/performance/page.tsx`
- `app/rules/page.tsx`, `app/reports/page.tsx`, `app/backtesting/backtest-page.tsx`

**Problemas encontrados:**
- Icono `Eye` y `Brain` verificados como disponibles en lucide-react 0.468+

---

### [2026-07-13] — Fase 10: DB Indexes

**Estado:** ✅ Completado

**Resumen:**
Añadidos índices Drizzle a todas las tablas para optimizar queries frecuentes: búsqueda por wallet address, status, fecha de creación, market ID, etc. Cada tabla tiene índices compuestos simples en las columnas más consultadas.

**Archivos modificados:**
- `db/schema.ts` — 20+ índices añadidos via `index()` en el esquema Drizzle

---

### [2026-07-13] — Fase 10: Favicon Personalizado

**Estado:** ✅ Completado

**Resumen:**
Creado favicon SVG con fondo degradado verde (`#22c55e` → `#16a34a`) y letra "M" blanca. Referenciado en layout.tsx via `<link rel="icon">`.

**Archivos creados/modificados:**
- `public/favicon.svg` — Icono SVG
- `app/layout.tsx` — Favicon link element

---

### [2026-07-13] — Limpieza de Código Muerto

**Estado:** ✅ Completado

**Resumen:**
Eliminadas clases CSS `.card-custom` y `.card-custom-sm` de `globals.css` que ya no se usaban (el componente Card usa Tailwind inline).

**Archivos modificados:**
- `app/globals.css` — Eliminadas clases muertas

---

### [2026-07-13] — Cambio de Nombre: Hermes → MESIRVE

**Estado:** ✅ Completado

**Resumen:**
Renombrado el bot de "Hermes" a "MESIRVE" en 22 archivos. Dashboard, scripts CLI, reportes Telegram, documentación. `package.json` name → `mesirve-copybot`.

**Archivos modificados:**
- `package.json` — name: `mesirve-copybot`
- `public/favicon.svg` — Favicon con "M"
- `app/layout.tsx` — Metadata title
- Todas las páginas, componentes, scripts, tests y documentación

---

### [2026-07-13] — Fase 10: Internacionalización (next-intl)

**Estado:** ✅ Completado

**Resumen:**
Implementado sistema multi-idioma con next-intl v4. Configuración completa:

1. `i18n/routing.ts` — Router con locale español
2. `i18n/request.ts` — Request config con lazy loading de mensajes
3. `next.config.js` — Plugin createNextIntlPlugin
4. `messages/es.json` — ~250 keys en 14 namespaces (common, nav, overview, rankings, signals, paperTrades, backtesting, journal, performance, rules, reports, wallet, notFound, theme, status)

Traducidas las 9 páginas del dashboard + sidebar + navbar + ThemeToggle + not-found. Arquitectura lista para añadir inglés: crear `messages/en.json` + añadir `"en"` a `routing.locales`.

**Archivos creados/modificados:**
- `i18n/routing.ts` — Nuevo
- `i18n/request.ts` — Nuevo
- `messages/es.json` — Nuevo (~250 keys)
- `next.config.js` — Añadido plugin next-intl
- `app/layout.tsx` — NextIntlClientProvider
- Todas las páginas — useTranslations/getTranslations
- `components/layout/sidebar.tsx` — useTranslations
- `components/layout/navbar.tsx` — useTranslations
- `components/theme-toggle.tsx` — useTranslations

**Decisiones tomadas:**
- **next-intl sobre i18next**: Estándar para Next.js 15 App Router, tipado automático, soporte Server + Client Components
- **Single locale (es) por ahora**: Sin middleware de detección, sin `[locale]` dynamic segment. Fácil de extender.
- **Import directo de JSON en layout**: `getMessages()` requiere `i18n/request.ts` bien configurado con el plugin.

**Problemas encontrados:**
- `getMessages()` no funcionaba sin el plugin en next.config.js → Añadido `createNextIntlPlugin`
- Reports page usaba `t.rich()` para JSX interpolation → Simplificado a concatenación con hardcode
- Journal page tenía sintaxis duplicada → Corregido

---

### [2026-07-13] — Documentación Completa: README, PLAN, ROADMAP, DEVLOG

**Estado:** ✅ Completado

**Resumen:**
Actualización masiva de toda la documentación del proyecto:

**README.md:**
- Añadida Fase 10 (i18n, UI Polish) a la documentación
- Nuevas secciones: Internacionalización, UI/UX Features, Mejoras Futuras
- Stack actualizado con next-intl y Lucide
- Fix de referencias antiguas (hermes → MESIRVE, data/hermes.db → data/mesirve.db)
- Documentados nuevos CLI args (`--limit`, `--skip-recent`, `--compare`)

**PLAN.md:**
- Añadida Fase 10 completa con 10 sub-tareas
- Arquitectura actualizada con CAPA 3 (i18n)
- Tabla de fases ahora incluye estados (✅ completado)
- Documentados cambios técnicos (DB indexes, leaderboard adapter fix, revalidate)
- Sección de mejoras futuras con corto/medio/largo plazo

**DEVLOG.md:**
- Nuevas entradas para todas las sesiones faltantes:
  - Theme toggle (FOUC prevention, localStorage)
  - Tooltips en sidebar (CSS puro, delay 250ms)
  - Iconos Lucide en todo el dashboard
  - DB indexes
  - Favicon personalizado
  - Limpieza de CSS muerto
  - Cambio de nombre Hermes → MESIRVE
  - Internacionalización (next-intl)
  - Esta entrada de documentación

**ROADMAP.md:**
- Todas las fases 0-9 marcadas como completadas
- Añadido Hito 10: UI Polish & Internacionalización
- Añadido Hito 11: Mejoras Futuras (propuesto)
- Fix de referencias a hermes-copybot
- Semanas de desarrollo actualizadas

**Archivos modificados:**
- `README.md`, `PLAN.md`, `DEVLOG.md`, `ROADMAP.md`

---

### [2026-07-13] — Diagnóstico Completo del Bot

**Estado:** ✅ Completado

**Resumen:**
Diagnóstico exhaustivo para determinar por qué el bot no está operando. Se identificaron 6 causas raíz y se documentó un plan de acción con 7 tareas prioritarias.

**Causas raíz:**
1. 🔴 Falta de automatización/scheduler — todos los scripts son manuales
2. 🔴 Pipeline bloqueado en score:trades — 0 market snapshots por API 422
3. 🔴 Script faltante paper:create — processPendingDecisions() nunca se invoca
4. 🟡 Market ID mismatch entre Data API (conditionId) y Gamma API (slug)
5. 🟢 DB con nombre antiguo (hermes.db)
6. 🟡 Datos de scan obsoletos (2025-05-15)

**Archivos modificados/revisados:**
- `DEVLOG.md` — Diagnóstico completo agregado al inicio
- `ROADMAP.md` — Pendiente de actualizar con Hito 11 mejoras
- `PLAN.md` — Pendiente de actualizar con mejoras propuestas

---

## Lecciones Aprendidas

1. **next-intl plugin es obligatorio**: Sin `createNextIntlPlugin()` en next.config.js, `getMessages()` falla con "couldn't find config file"
2. **t.rich() vs JSX**: Para componentes que necesitan interpolar elementos JSX, `t.rich()` es la herramienta correcta. Para texto plano, `t()` simple basta
3. **FOUC prevention**: El script inline en `<head>` es la única forma fiable de evitar flash del tema incorrecto. CSS solo no es suficiente
4. **Tooltips con delay**: 250ms es el sweet spot entre evitar falsos positivos y no sentirse lento
5. **CSS puro para componentes simples**: No siempre se necesita una librería. El tooltip de sidebar es ~50 líneas de CSS+React vs ~200 líneas con @floating-ui
6. **DB indexes tempranos**: Mejor añadirlos en el schema desde el principio que tener que migrar después
7. **force-dynamic → revalidate**: ISR con `revalidate = 60` es mejor que `force-dynamic` para páginas que no necesitan datos fresh en cada request
8. **🧠 Market ID Mapping**: La API de actividad de Polymarket devuelve `conditionId`, pero Gamma API necesita query params `condition_id=`, no path param. **Siempre verificar los formatos de ID entre APIs.**
9. **Pipeline completo**: Diseñar pipelines como DAGs — verificar que cada paso tiene un script que lo ejecuta, y que el paso siguiente existe.
10. **Automatización desde el día 1**: Incluso scripts simples deberían tener un scheduler/cron desde el principio. Manual = olvidado.

---

## Deuda Técnica Registrada

| ID | Descripción | Prioridad | Fecha registro |
|----|-------------|-----------|----------------|
| DT-001 | Light mode no afecta completamente sidebar y cards (usan bg-surface) | Baja | 2026-07-13 |
| DT-002 | Tooltip puede overflowear en viewports muy angostos (<900px) | Baja | 2026-07-13 |
| DT-003 | Journal, Wallet y Backtesting pages tienen traducciones pendientes | Media | 2026-07-13 |
| DT-004 | Sin tests de integración para i18n | Baja | 2026-07-13 |
| DT-005 | **Pipeline bloqueado**: `monitor:trades` no crea market snapshots (422 API) | 🔴 Alta | 2026-07-13 |
| DT-006 | **Script faltante**: `paper:create` no existe → `processPendingDecisions()` nunca se invoca | 🔴 Alta | 2026-07-13 |
| DT-007 | **Sin scheduler**: Todos los scripts son manuales, no hay automatización | 🔴 Alta | 2026-07-13 |
| DT-008 | **DB con nombre antiguo**: `data/hermes.db` en vez de `data/mesirve.db` | 🟢 Baja | 2026-07-13 |
| DT-009 | **Datos de scan obsoletos**: Último scan: 2025-05-15 (>1 año) | 🟡 Media | 2026-07-13 |
| DT-010 | **Market ID mismatch**: `conditionId` usado como `marketId` en APIs de Gamma | 🔴 Alta | 2026-07-13 |

---

## Riesgos Activos

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| APIs de Polymarket pueden cambiar sin aviso | Media | Alto | Capa de adaptadores abstrae los detalles de API |
| Rate limiting en APIs públicas | Media | Medio | Backoff exponencial + caché + delay entre requests |
| SQLite no escala para datos históricos grandes | Baja (v1) | Bajo | Migrar a PostgreSQL en v2 si es necesario |
| Wallets del leaderboard pueden ser bots/sybils | Alta | Medio | Scoring penaliza one-hit-wonders + detecta patrones |
| next-intl breaking changes en future updates | Baja | Medio | next-intl v4 estable, API madura |
| **Pipeline bloqueado** impide cualquier operación del bot | 🔴 Alta | Alto | Fixear Market ID mapping + crear paper:create + scheduler |

---

## Métricas de Desarrollo

| Fecha | Hito | Tareas completadas | Tests pasando | Líneas de código |
|-------|------|--------------------|---------------|------------------|
| 2026-07-12 | Planificación | Documentos creados | N/A | N/A |
| 2026-07-12 | Hito 0: Fundación | Proyecto inicializado | N/A | ~800 |
| 2026-07-12 | Hito 1: Adaptadores | 4 adaptadores + cliente HTTP | N/A | ~950 |
| 2026-07-12 | Hito 1.5: Tests adaptadores | 66 tests | 66/66 ✅ | ~850 |
| 2026-07-12 | Hito 2.1: Wallet scoring | Motor scoring 8 componentes | N/A | ~350 |
| 2026-07-12 | Hito 2.4: Tests wallet scoring | 132 tests | 198/198 ✅ | ~400 |
| 2026-07-12 | Hito 2.2-2.3: Scanner scripts | scan:leaderboard + scan:wallets | N/A | ~480 |
| 2026-07-12 | Hito 3.1: Trade scoring | Motor scoring trades 8 componentes | N/A | ~380 |
| 2026-07-12 | Hito 3.4: Tests trade scoring | 85 tests | 217/217 ✅ | ~640 |
| 2026-07-12 | Hito 3.2-3.3: Monitor+Score | monitor:trades + score:trades | N/A | ~420 |
| 2026-07-12 | Hito 4.1: Paper trader | Motor simulación completo | N/A | ~430 |
| 2026-07-12 | Hito 4.2-4.3: Update+Review | update-pnl + review-outcomes | N/A | ~300 |
| 2026-07-12 | Hito 4.4: Benchmarks | Bot vs copia ciega | N/A | ~200 |
| 2026-07-12 | Hito 5.1-5.2: Rule engine | Motor reglas + update:rules | N/A | ~430 |
| 2026-07-12 | Hito 5.3-5.4: Tests rules | 2 test files | 343/343 ✅ | ~500 |
| 2026-07-12 | Hito 6: Reports+Telegram | daily, weekly, Telegram | N/A | ~600 |
| 2026-07-12 | Hito 7: Dashboard | 9 páginas + componentes | N/A | ~1500 |
| 2026-07-12 | Hito 8: Backtesting | Motor + CLI + UI | N/A | ~500 |
| 2026-07-12 | Hito 9: Tests+Seguridad | Security + integration + seed | 343/343 ✅ | ~800 |
| 2026-07-13 | Hito 10: UI Polish | Theme, tooltips, icons, favicon | 343/343 ✅ | ~300 |
| 2026-07-13 | Hito 10: i18n | next-intl, messages/es.json | 343/343 ✅ | ~600 |
| 2026-07-13 | Documentación | README, PLAN, DEVLOG, ROADMAP | 343/343 ✅ | ~400 |
| 2026-07-13 | **Diagnóstico completo del bot** | 6 causas raíz + plan de acción | 343/343 ✅ | — |

---

## Notas para el Futuro

- **v2 podría incluir:** Ejecución real con wallet de prueba, PostgreSQL en Supabase, autenticación de usuario, notificaciones push.
- **Integración Max HQ:** El dashboard está diseñado para encajar como un módulo dentro de Max HQ. Los estilos deben ser compatibles.
- **MESIRVE como operador:** En producción, MESIRVE ejecutaría los scripts programados vía cron. El dashboard es solo lectura.
- **Multi-idioma:** La arquitectura next-intl está lista para inglés. Solo falta crear `messages/en.json` y añadir `"en"` a `routing.locales`.
- **IA/ML:** El motor de scoring actual es basado en reglas. Un modelo ML podría mejorar significativamente la precisión de las decisiones.
- **⚠️ Pipeline actual está roto:** El bot NO puede operar aunque se ejecuten los scripts manualmente.
  - **Fix #1:** Market ID mapping en `monitor:trades` (usar `condition_id` query param en Gamma)
  - **Fix #2:** Crear script `paper:create` que invoque `processPendingDecisions()`
  - **Fix #3:** Crear scheduler/daemon que automatice el pipeline completo
