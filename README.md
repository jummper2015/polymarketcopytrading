# Hermes — Polymarket Copy Trading Bot

> **Bot de copy trading para Polymarket con capacidad de automejora y panel de control.**
>
> ⚠️ **IMPORTANTE: Versión 1 — Solo simulación (paper trading). Sin claves privadas, sin ejecución real, sin operaciones reales.**

---

## Qué Hace el Bot

- Escanea la tabla de clasificación (leaderboard) de Polymarket (top 500 billeteras)
- Analiza la actividad de los últimos 30 días de cada billetera
- Califica cada billetera por ROI, consistencia, viabilidad de copia (copyability) y penalización one-hit-wonder
- Monitorea nuevas operaciones de billeteras bajo seguimiento
- Califica cada operación para decidir si copiarla (paper_copy), observarla (watchlist) u omitirla (skip)
- Ejecuta operaciones simuladas (paper trades) con posiciones de $5–$20
- Actualiza PnL simulado cada hora
- Revisa resultados cuando los mercados se resuelven
- Compara estrategia filtrada vs copia ciega
- Actualiza reglas automáticamente basado en rendimiento
- Genera reportes diarios
- Muestra rendimiento en un dashboard web

## Qué NO Hace el Bot (v1)

- ❌ No realiza operaciones reales
- ❌ No almacena claves privadas
- ❌ No firma transacciones
- ❌ No gasta dinero
- ❌ No interactúa con smart contracts

---

## Stack Tecnológico

| Componente | Tecnología |
|------------|------------|
| Lenguaje | TypeScript |
| Framework | Next.js 15 (App Router) |
| UI | React 19 + Tailwind CSS |
| Base de Datos | SQLite (better-sqlite3) |
| ORM | Drizzle ORM |
| Testing | Vitest |
| Gráficos | Recharts |
| APIs | APIs Públicas de Polymarket (CLOB + Gamma) |
| Alertas | Telegram Bot API (opcional) |
| Despliegue | Vercel |

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
cd hermes-copybot
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

Esto crea `data/hermes.db` con todas las tablas.

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
# Escaneo diario de leaderboard y billeteras
npm run scan:leaderboard
npm run scan:wallets

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
npm run backtest
```

### Tests

```bash
npm run test        # Ejecutar todos los tests
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
Scripts CLI que ejecutan el bucle operativo: escaneos programados, perfilado de billeteras, monitoreo de operaciones, simulación, actualización de reglas y reportes.

### Capa 2: Panel de Control Vercel
Dashboard web (Next.js) con 9 páginas que muestran el rendimiento, billeteras, operaciones, reglas y reportes.

---

## Cómo Funciona

### Escaneo de Leaderboard
`npm run scan:leaderboard` consulta la API pública de Polymarket para obtener las 500 billeteras con mejor rendimiento. Guarda un snapshot en `leaderboard_scan`.

### Puntuación de Billeteras
Cada billetera recibe un `globalScore` basado en:
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
2. ¿Qué billeteras vale la pena copiar?
3. ¿Qué aprendió el bot hoy?

---

## Variables de Entorno

| Variable | Descripción | Default |
|----------|-------------|---------|
| `DATABASE_URL` | Ruta a la DB SQLite | `file:./data/hermes.db` |
| `POLYMARKET_CLOB_URL` | API CLOB de Polymarket | `https://clob.polymarket.com` |
| `POLYMARKET_GAMMA_URL` | API Gamma de Polymarket | `https://gamma-api.polymarket.com` |
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

## Licencia

MIT
