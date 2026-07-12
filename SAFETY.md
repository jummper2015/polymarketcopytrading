# SAFETY.md — Polymarket Copy Trading Bot

> **Este documento explica las medidas de seguridad, limitaciones y riesgos del sistema.**

---

## Principio Fundamental: Simulación Únicamente (v1)

La versión 1 del bot de copy trading de Polymarket **no realiza operaciones reales bajo ninguna circunstancia**.

- ❌ No se almacenan claves privadas
- ❌ No se firman transacciones on-chain
- ❌ No se ejecutan operaciones reales
- ❌ No se gasta dinero real
- ❌ No se interactúa con smart contracts
- ✅ Solo simulación (paper trading)
- ✅ Solo APIs públicas de Polymarket
- ✅ Solo base de datos local (SQLite)

---

## Por Qué la Ejecución Real Está Deshabilitada

1. **Sin ventaja demostrada (edge):** La ejecución real solo se habilitaría después de que la simulación demuestre consistentemente rentabilidad positiva durante un período prolongado.

2. **Riesgos del copy trading:** Copiar billeteras de una tabla de clasificación pública es inherentemente riesgoso. Las billeteras pueden:
   - Ser operadores con información privilegiada que ya cerraron sus posiciones
   - Tener acceso a liquidez o mercados que el bot no puede replicar
   - Ser víctimas de sesgo de supervivencia (solo vemos a los ganadores)

3. **Riesgos de datos obsoletos (stale data):** Las APIs públicas de Polymarket pueden tener retrasos. Para cuando el bot detecta una operación, el precio puede haberse movido significativamente.

---

## Cómo se Podría Añadir Autonomía en el Futuro (v2+)

Si la versión de simulación demuestra una ventaja estadísticamente significativa:

1. Usar una wallet de prueba con fondos limitados ($50–$100 máximo)
2. Mantener el modo `SIMULATION_MODE` como un feature flag — siempre debe ser posible desactivar la ejecución real
3. Añadir límites estrictos: máximo por operación, máximo diario, máximo total
4. Implementar circuit breakers: pausar automáticamente si el drawdown supera un umbral
5. Añadir confirmación manual para operaciones por encima de cierto tamaño (firma humana requerida)
6. Auditoría de seguridad externa antes de activar ejecución real

---

## Riesgos Identificados

### Riesgos de Datos Obsoletos (Stale Data)

**Problema:** Las APIs de Polymarket pueden tener latencia. Entre que una billetera realiza una operación y el bot la detecta, pueden pasar minutos.

**Mitigación:**
- El scoring penaliza entradas tardías (entry timing score)
- Se registra la diferencia entre el precio de entrada de la billetera y el precio detectado
- Si el precio ya se movió >5%, la operación se marca como `skip` automáticamente

### Riesgos de Baja Liquidez

**Problema:** Mercados con poca liquidez tienen spreads amplios y slippage alto. Una operación que parece rentable en papel puede ser imposible de ejecutar en la práctica.

**Mitigación:**
- Se requiere liquidez mínima para considerar una operación
- El scoring penaliza mercados con baja liquidez
- El spread bid-ask se incluye en el scoring de operaciones

### Riesgos de Spreads Amplios

**Problema:** Incluso en mercados líquidos, el spread puede ser amplio en momentos de volatilidad. Comprar al ask y vender al bid puede eliminar ganancias pequeñas.

**Mitigación:**
- Umbral máximo de spread en las reglas
- El bot actualiza reglas automáticamente para reducir el umbral si las operaciones con spreads altos rinden mal

### Riesgos del Copy Trading

**Problema:** Copiar a ciegas es una estrategia perdedora a largo plazo. El sesgo de supervivencia en la tabla de clasificación muestra solo a los ganadores.

**Mitigación:**
- Penalización one-hit-wonder: si la mayoría de las ganancias vienen de una sola operación afortunada, la billetera baja de rango
- Se requiere un mínimo de operaciones resueltas para considerar una billetera
- El sistema compara constantemente la estrategia filtrada vs copia ciega para validar que el filtrado agrega valor
- Se rastrean ganadores perdidos y perdedores evitados

### Billeteras de Leaderboard Engañosas

**Problema:** Las billeteras en la cima pueden:
- Ser la misma entidad con múltiples wallets (Sybil)
- Haber tenido suerte en un mercado niche
- Haber operado en mercados que ya no existen
- Tener información privada

**Mitigación:**
- El scoring de consistencia penaliza ROI volátil
- El scoring de categoría detecta si la ventaja es específica de un mercado
- Se requieren operaciones resueltas recientes (últimos 30 días)
- El sistema monitorea rendimiento simulado de cada billetera y degrada las que pierden consistencia

### Nunca Almacenar Claves Privadas

**Problema:** Si la aplicación almacenara claves privadas, un compromiso de seguridad resultaría en pérdida de fondos.

**Mitigación:**
- La aplicación no tiene código para almacenar claves privadas
- No hay campos en la base de datos para claves privadas
- No hay endpoints o scripts que acepten claves privadas
- SIMULATION_MODE="paper_only" es forzado y no se puede cambiar sin modificar el código fuente
- Tests de seguridad verifican que no hay funciones de firma de transacciones

---

## Variables de Entorno y Secretos

- Todas las claves de API se almacenan en variables de entorno
- `.env.local` y `data/` están en `.gitignore`
- Los logs redactan automáticamente valores de variables de entorno
- La UI nunca muestra valores de variables de entorno

---

## Modo de Simulación Forzado

La variable `SIMULATION_MODE` solo puede ser `"paper_only"` en v1. El código debe verificar esto al inicio y fallar si se intenta cambiar:

```typescript
if (process.env.SIMULATION_MODE !== "paper_only") {
  throw new Error(
    "SAFETY: SIMULATION_MODE must be 'paper_only' in v1. " +
    "Real execution is not available in this version."
  );
}
```

---

## Reporte de Vulnerabilidades

Si encuentras un problema de seguridad, por favor:
1. No abras un issue público
2. Describe el problema en detalle
3. Contacta al maintainer del proyecto

---

*Última actualización: 2026-07-12*
