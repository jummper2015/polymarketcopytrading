export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 gap-6">
      <div className="animate-fade-in text-center space-y-4">
        <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 text-sm font-medium">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500" />
          </span>
          SIMULATION MODE — Paper Trading Only
        </div>

        <h1 className="text-5xl font-bold tracking-tight">
          Hermes{" "}
          <span className="text-brand-500">Copy Trading Bot</span>
        </h1>

        <p className="text-surface-400 max-w-lg mx-auto text-lg">
          Panel de control del bot de copy trading para Polymarket.
          <br />
          Simulación únicamente — sin operaciones reales.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto mt-8">
          {[
            { label: "Billeteras Rastreadas", value: "—" },
            { label: "Paper Trades Activos", value: "—" },
            { label: "PnL Simulado", value: "—" },
          ].map((stat) => (
            <div key={stat.label} className="card text-center">
              <p className="stat-value text-brand-400">{stat.value}</p>
              <p className="stat-label mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        <p className="text-surface-500 text-sm mt-8">
          Dashboard en construcción — Hito 0 completado.{" "}
          <br />
          Próximo: Adaptadores de Polymarket (Hito 1).
        </p>
      </div>
    </div>
  );
}
