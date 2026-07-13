# MESIRVE — Polymarket Copy Trading Bot

> **Bot de copy trading para Polymarket con capacidad de automejora, panel de control multi-idioma y tema claro/oscuro.**
>
> ⚠️ **IMPORTANTE: Versión 1 — Solo simulación (paper trading). Sin claves privadas, sin ejecución real, sin operaciones reales.**

---

## Stack Tecnológico

| Componente | Tecnología |
|------------|------------|
| Lenguaje | TypeScript |
| Framework | Next.js 15 (App Router) |
| UI | React 19 + Tailwind CSS |
| Iconos | Lucide React |
| Internacionalización | next-intl (español listo, extensible a más idiomas) |
| Base de Datos | SQLite (better-sqlite3) |
| ORM | Drizzle ORM |
| Testing | Vitest |
| Gráficos | Recharts |
| APIs | APIs Públicas de Polymarket (CLOB + Gamma + Data) |
| Alertas | Telegram Bot API (opcional) |
| Despliegue | Vercel |

---

## Funcionalidades

### Core del Bot

- Escanea la tabla de clasificación (leaderboard) de Polymarket (top 500 wallets)
- Analiza la actividad de los últimos 30 días de cada wallet
- Califica cada wallet por ROI, consistencia, viabilidad de copia (copyability) y penalización one-hit-wonder
- Monitorea nuevas operaciones de wallets bajo seguimiento
- Califica cada operación para decidir si copiarla (paper_copy), observarla (watchlist) u omitirla (skip)
- Ejecuta operaciones simuladas (paper trades) con posiciones de $5–$20
- Actualiza PnL simulado cada hora
- Revisa resultados cuando los mercados se resuelven
- Compara estrategia filtrada vs copia ciega
- Actualiza reglas automáticamente basado en rendimiento
- Genera reportes diarios
- Backtesting histórico por wallet
- **Nuevo:** Escaneo selectivo con `--limit` y `--skip-recent` para wallets recién perfiladas

### Dashboard Web (9 páginas)

| Página | Descripción |
|--------|-------------|
| **Overview** | Panel principal con PnL, win rate, posiciones abiertas, wallets trackeadas |
| **Rankings** | Top wallets por global score con filtros |
| **Signals** | Señales de copy trading generadas por el motor de scoring |
| **Paper Trades** | Operaciones simuladas activas y resueltas |
| **Backtesting** | Simulación histórica por wallet con comparativa |
| **Journal** | Bitácora de decisiones, resultados y lecciones aprendidas |
| **Performance** | Rendimiento del portafolio simulado con gráficos |
| **Rules** | Reglas activas y timeline de cambios automáticos |
| **Reports** | Reportes diarios generados por MESIRVE |

### UI / UX

- **🌓 Tema claro/oscuro** con persistencia en localStorage y sin flash (FOUC prevention)
- **🌐 Internacionalización** con next-intl — actualmente en español, arquitectura lista para más idiomas
- **💡 Tooltips** en sidebar con delay de 250ms y posicionamiento inteligente
- **🎨 Iconos Lucide** en todas las páginas, sidebar, navbar y componentes — consistencia visual total
- **📱 Sidebar responsive** con menú hamburguesa en mobile
- **🖼️ Favicon personalizado** con "M" verde degradado
- **📊 Gráficos Recharts** para PnL acumulado y win rate

### Seguridad

- ❌ No realiza operaciones reales
- ❌ No almacena claves privadas
- ❌ No firma transacciones
- ❌ No gasta dinero
- ❌ No interactúa con smart contracts
- ✅ `SIMULATION_MODE="paper_only"` forzado en código
- ✅ APIs públicas únicamente
- ✅ Tests de seguridad automatizados
- ✅ Datos demo etiquetados como `[DEMO]`

---

## Requisitos Previos

- **Node.js** >= 20
- **npm** >= 9
- Git

---

## Configuración

### 1. Clonar e instalar

```bash
git clone <repo-url>
cd mesirve-copybot
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env.local
```

Editar `.env.local` si es necesario. Las APIs de Polymarket son públicas y no requieren autenticación.

### 3. Inicializar la base de datos

```bash
npm run db:migrate
```

Esto crea `data/mesirve.db` con todas las tablas (11 modelos + índices).

### 4. (Opcional) Poblar con datos demo

```bash
npm run seed
```

Los datos demo están claramente etiquetados como `[DEMO]`.

### 5. Iniciar el dashboard

```bash
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000).

---

## Cómo Ejecutarlo Localmente

### Dashboard

```bash
npm run dev
```

### Scripts de Operación (Agente Jumper)

```bash
# Escaneo diario de leaderboard y wallets
npm run scan:leaderboard
npm run scan:wallets             # Procesa top 100 wallets
npm run scan:wallets -- --limit 500 --skip-recent  # Personalizado

# Monitoreo de operaciones (cada 15 min)
npm run monitor:trades
npm run score:trades

# Actualización de PnL simulado (cada hora)
npm run paper:update-pnl
npm run review:outcomes

# Actualización de reglas (diario)
npm run update:rules

# Reporte diario
npm run report:daily

# Backtesting
npm run backtest -- --wallet 0x... --days 30
npm run backtest -- --compare 0xA...,0xB... --days 60
```

### Tests

```bash
npm run test        # 343+ tests, 15 archivos
npm run test:watch  # Modo watch
```

---

## Cómo Desplegar en Vercel

1. Conectar el repositorio a Vercel
2. Configurar las variables de entorno desde `.env.example`
3. El dashboard se despliega automáticamente
4. Los scripts CLI se ejecutan localmente (no en Vercel)

---

## Arquitectura

El sistema tiene dos capas:

### Capa 1: Operador Agente Jumper
Scripts CLI que ejecutan el bucle operativo: escaneos programados, perfilado de wallets, monitoreo de operaciones, simulación, actualización de reglas y reportes.

### Capa 2: Panel de Control Vercel
Dashboard web (Next.js) con 9 páginas que muestran el rendimiento, wallets, operaciones, reglas y reportes.

### Capa 3: Internacionalización (Nueva)
- next-intl v4 con plugin de Next.js
- Archivos de mensajes en `messages/es.json` (español)
- Arquitectura preparada para añadir `messages/en.json` (inglés) y más idiomas
- `useTranslations()` hook para componentes cliente y servidor
- Sin cambios en rutas — locale fijo `es` por ahora

```
┌──────────────────────────────────────────────────────────────┐
│                     CAPA 3: i18n (next-intl)                  │
│  messages/es.json → useTranslations → UI traducida            │
│  Fácil extensión: crear messages/en.json + añadir locale     │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                    CAPA 2: Panel de Control Vercel             │
│  Next.js + React 19 + Tailwind + Lucide + Recharts            │
│  9 páginas · Tema claro/oscuro · Tooltips · Favicon           │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│               CAPA 1: Operador Agente Jumper                   │
│  Scripts CLI · SQLite · Bucle operativo programado            │
│  Escáner → Perfilador → Monitor → Scoring → Simulación       │
│  Automejora · Reportes · Backtesting                          │
└──────────────────────────────────────────────────────────────┘
```

---

## Cómo Funciona

### Escaneo de Leaderboard
`npm run scan:leaderboard` consulta la API pública de Polymarket para obtener las 500 wallets con mejor rendimiento. Guarda un snapshot en `leaderboard_scan`.

### Puntuación de Wallets
Cada wallet recibe un `globalScore` basado en:
- ROI (25%)
- Consistencia (25%)
- Viabilidad de copia (20%)
- Fortaleza por categoría (10%)
- Calidad de liquidez (10%)
- Timing de entrada (5%)
- Rendimiento en resueltas (5%)

Menos penalización one-hit-wonder si la ganancia proviene de una sola operación.

**Estados:** `track` (>0.7), `watch` (0.4–0.7), `ignore` (<0.4)

### Simulación (Paper Trading)
Las operaciones con score >0.65 se simulan con posiciones de $5–$20. El PnL se actualiza cada hora. Se comparan resultados contra copia ciega.

### Automejora
El sistema actualiza reglas automáticamente basado en evidencia de rendimiento. Cada cambio se registra con: qué cambió, por qué, evidencia, before/after, timestamp y nueva versión.

### Panel de Control
Responde tres preguntas:
1. ¿Somos rentables en simulación?
2. ¿Qué wallets vale la pena copiar?
3. ¿Qué aprendió el bot hoy?

---

## Variables de Entorno

| Variable | Descripción | Default |
|----------|-------------|---------|
| `DATABASE_URL` | Ruta a la DB SQLite | `file:./data/mesirve.db` |
| `POLYMARKET_CLOB_URL` | API CLOB de Polymarket | `https://clob.polymarket.com` |
| `POLYMARKET_GAMMA_URL` | API Gamma de Polymarket | `https://gamma-api.polymarket.com` |
| `POLYMARKET_DATA_URL` | API Data de Polymarket | `https://data-api.polymarket.com` |
| `TELEGRAM_BOT_TOKEN` | Token del bot de Telegram (opcional) | — |
| `TELEGRAM_CHAT_ID` | Chat ID para alertas (opcional) | — |
| `NODE_ENV` | Entorno | `development` |
| `SIMULATION_MODE` | Modo de ejecución | `paper_only` |

---

## Seguridad

Ver [SAFETY.md](./SAFETY.md) para detalles completos sobre:
- Por qué la v1 es solo simulación
- Riesgos del copy trading
- Por qué nunca almacenar claves privadas
- Plan para autonomía futura

---

## Mejoras Futuras Propuestas

### Corto Plazo

- [ ] **Soporte multi-idioma (EN)** — Crear `messages/en.json` y añadir `"en"` a los locales del router
- [ ] **Autenticación de usuarios** — Login con NextAuth para acceso seguro al dashboard
- [ ] **TradingView charts** — Integrar gráficos profesionales de velas/profundidad
- [ ] **WebSockets en tiempo real** — Precios y trades en vivo via WebSocket de Polymarket
- [ ] **Exportación de datos** — CSV/JSON export de trades, PnL y rendimiento

### Medio Plazo

- [ ] **Ejecución real (v2)** — Integración con API3 / Safe wallet para ejecutar trades on-chain
- [ ] **PostgreSQL / Supabase** — Migrar de SQLite para escalabilidad y multi-usuario
- [ ] **API REST pública** — Endpoints para acceder a datos del bot desde otras aplicaciones
- [ ] **Alertas push en navegador** — Notificaciones para nuevas señales y cambios de reglas
- [ ] **ML para trade scoring** — Modelo de machine learning para mejorar predicciones
- [ ] **Walk-forward backtesting** — Validación más robusta de estrategias

### Largo Plazo

- [ ] **App móvil (React Native)** — Companion app para monitoreo en mobile
- [ ] **Multi-portafolio** — Gestionar múltiples portafolios simulados con distintos perfiles de riesgo
- [ ] **Market making simulado** — Estrategias de provisión de liquidez
- [ ] **DeFi integrations** — Yield farming, staking, y otras estrategias DeFi
- [ ] **Social trading** — Compartir estrategias y rendimiento con la comunidad
- [ ] **Auditoría de seguridad externa** — Antes de cualquier ejecución real

---

## Licencia

MIT
