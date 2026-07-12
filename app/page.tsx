import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/ui/status-dot";

export default function Home() {
  return (
    <div className="animate-fade-in space-y-6">
      {/* Page header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-surface-50">
          Overview
        </h2>
        <p className="text-sm text-surface-400 mt-1">
          Panel de control del bot de copy trading para Polymarket.
          Simulación únicamente — sin operaciones reales.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card
          title="PnL Simulado"
          icon="💰"
          subtitle="Total unrealized + realized"
        >
          <p className="stat-value text-brand-400">—</p>
        </Card>

        <Card
          title="Win Rate"
          icon="🎯"
          subtitle="Sobre trades resueltos"
        >
          <p className="stat-value text-surface-50">—</p>
        </Card>

        <Card
          title="Posiciones Abiertas"
          icon="📊"
          subtitle="Paper trades activos"
        >
          <p className="stat-value text-amber-400">—</p>
        </Card>

        <Card
          title="Billeteras Track"
          icon="👥"
          subtitle="En seguimiento activo"
        >
          <p className="stat-value text-blue-400">—</p>
        </Card>
      </div>

      {/* Second row: Signals + Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card
          title="Señales de Hoy"
          icon="🔔"
          subtitle="Decisiones generadas hoy"
        >
          <div className="flex items-center gap-4">
            <Badge variant="success" icon="📋">
              Copy —
            </Badge>
            <Badge variant="warning" icon="👁️">
              Watch —
            </Badge>
            <Badge variant="danger" icon="⏭️">
              Skip —
            </Badge>
          </div>
        </Card>

        <Card
          title="Estado del Sistema"
          icon="⚙️"
          subtitle="Versión y modo de operación"
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <StatusDot variant="active" pulse size="sm" />
              <span className="text-sm text-surface-300">
                Simulation Mode
              </span>
              <Badge variant="warning">Paper Only</Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-surface-400">
                Hermes v1.0 — Dashboard en construcción
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
