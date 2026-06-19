import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppHeader } from "../../../shared/ui/AppHeader";
import { HttpError } from "../../../shared/api/http-client";
import type {
  AgentMetrics,
  AgentMetricsResponse,
} from "../domain/ticket-repository";
import { HttpTicketRepository } from "../infrastructure/http-ticket-repository";
import styles from "./ManagerDashboardPage.module.css";

// Dashboard del gerente. Se monta solo para role=gerente (la ruta lo
// fuerza). Llama /metrics/agents al mount; el endpoint agrega ya los
// totales y el desgloce por agente, así que la page solo arma vistas.
//
// TODO(metrics-filter): pendiente filtro de período (últimos 7/30/90 días).
// El backend hoy devuelve la foto actual; cuando soporte ?period=... el
// dropdown se agrega arriba al lado del botón "Actualizar".

const repository = new HttpTicketRepository();

type State =
  | { kind: "loading" }
  | { kind: "ready"; data: AgentMetricsResponse }
  | { kind: "error"; message: string };

type SortKey =
  | "nombre"
  | "tickets_resueltos"
  | "tickets_en_progreso"
  | "tickets_vencidos"
  | "tiempo_promedio_resolucion_min";

type SortDir = "asc" | "desc";

// Paleta para el pie de estados: alineada con los colores de signal que
// el resto de la app usa por estado (open=primary, in_progress=mid,
// done=ok, overdue=high).
const STATUS_COLORS = {
  Cerrados: "var(--ok)",
  "En progreso": "var(--sev-mid)",
  Vencidos: "var(--sev-high)",
  Abiertos: "var(--primary)",
} as const;

export function ManagerDashboardPage() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [sortKey, setSortKey] = useState<SortKey>("tickets_resueltos");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const data = await repository.listAgentMetrics();
      setState({ kind: "ready", data });
    } catch (err) {
      setState({ kind: "error", message: humanize(err) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedAgents = useMemo<AgentMetrics[]>(() => {
    if (state.kind !== "ready") return [];
    const copy = [...state.data.agents];
    copy.sort((a, b) => {
      const va = pickSortValue(a, sortKey);
      const vb = pickSortValue(b, sortKey);
      if (va === vb) return 0;
      // null al final independientemente del sortDir — siempre debajo
      // de los agentes con datos.
      if (va === null) return 1;
      if (vb === null) return -1;
      if (typeof va === "string" && typeof vb === "string") {
        return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return sortDir === "asc"
        ? (va as number) - (vb as number)
        : (vb as number) - (va as number);
    });
    return copy;
  }, [state, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "nombre" ? "asc" : "desc");
    }
  };

  return (
    <div className={styles.shell}>
      <AppHeader />
      <main className={styles.main}>
        <section className={styles.hero}>
          <p className={styles.heroEyebrow}>Operación</p>
          <h1 className={styles.heroTitle}>Métricas del equipo</h1>
          <p className={styles.heroLead}>
            Resumen del desempeño operativo: SLA, tickets por estado y carga
            por agente. Datos en vivo desde la cola de soporte.
          </p>

          <div className={styles.headerRow}>
            <button
              type="button"
              className={styles.refresh}
              onClick={() => void load()}
              disabled={state.kind === "loading"}
            >
              {state.kind === "loading" ? "Cargando…" : "Actualizar"}
            </button>
          </div>
        </section>

        <div className={styles.content}>
          {state.kind === "loading" && (
            <p className={styles.note}>Cargando métricas…</p>
          )}

          {state.kind === "error" && (
            <p className={styles.errorBox} role="alert">
              {state.message}
            </p>
          )}

          {state.kind === "ready" && (
            <DashboardBody
              data={state.data}
              sortedAgents={sortedAgents}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function DashboardBody({
  data,
  sortedAgents,
  sortKey,
  sortDir,
  onSort,
}: {
  data: AgentMetricsResponse;
  sortedAgents: AgentMetrics[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const { totals } = data;
  const ariaSortFor = (key: SortKey): "ascending" | "descending" | "none" =>
    key === sortKey ? (sortDir === "asc" ? "ascending" : "descending") : "none";

  // Top N por resueltos para el bar chart — limitamos a 10 para mantener
  // las barras legibles aunque haya muchos agentes. El ranking sigue al
  // sort de la tabla solo si está ordenada por resueltos; sino usamos
  // un orden propio por resueltos desc.
  const barData = useMemo(
    () =>
      [...data.agents]
        .sort((a, b) => b.tickets_resueltos - a.tickets_resueltos)
        .slice(0, 10)
        .map((a) => ({
          name: a.nombre,
          Resueltos: a.tickets_resueltos,
        })),
    [data.agents],
  );

  const pieData = useMemo(
    () => [
      { name: "Cerrados", value: totals.cerrados },
      { name: "En progreso", value: totals.en_progreso },
      { name: "Vencidos", value: totals.vencidos },
      { name: "Abiertos", value: totals.abiertos },
    ],
    [totals],
  );
  const pieHasData = pieData.some((d) => d.value > 0);

  return (
    <>
      {/* --- KPIs --- */}
      <div className={styles.kpiGrid}>
        <KpiCard label="Total tickets" value={totals.tickets_totales} />
        <KpiCard
          label="Cerrados"
          value={totals.cerrados}
          accent={styles.kpiAccentDone}
        />
        <KpiCard
          label="En progreso"
          value={totals.en_progreso}
          accent={styles.kpiAccentProgress}
        />
        <KpiCard
          label="Vencidos"
          value={totals.vencidos}
          accent={styles.kpiAccentOverdue}
        />
      </div>

      {/* --- Tabla de agentes --- */}
      <article className={styles.card}>
        <header className={styles.cardHeader}>
          <span className={styles.cardTitle}>Agentes</span>
          <span className={styles.cardMeta}>
            {data.agents.length} total · {totals.escalados_a_n2} escalados a N2
          </span>
        </header>
        {data.agents.length === 0 ? (
          <p className={styles.note} style={{ padding: "var(--s-xl)" }}>
            Aún no hay agentes con tickets en el sistema.
          </p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th
                  className={styles.sortable}
                  onClick={() => onSort("nombre")}
                  aria-sort={ariaSortFor("nombre")}
                >
                  Nombre
                </th>
                <th
                  className={styles.sortable}
                  onClick={() => onSort("tickets_resueltos")}
                  aria-sort={ariaSortFor("tickets_resueltos")}
                  style={{ width: 120 }}
                >
                  Resueltos
                </th>
                <th
                  className={styles.sortable}
                  onClick={() => onSort("tickets_en_progreso")}
                  aria-sort={ariaSortFor("tickets_en_progreso")}
                  style={{ width: 130 }}
                >
                  En progreso
                </th>
                <th
                  className={styles.sortable}
                  onClick={() => onSort("tickets_vencidos")}
                  aria-sort={ariaSortFor("tickets_vencidos")}
                  style={{ width: 120 }}
                >
                  Vencidos
                </th>
                <th
                  className={styles.sortable}
                  onClick={() => onSort("tiempo_promedio_resolucion_min")}
                  aria-sort={ariaSortFor("tiempo_promedio_resolucion_min")}
                  style={{ width: 180 }}
                >
                  Tiempo prom. resolución
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedAgents.map((a) => (
                <tr key={a.sub}>
                  <td>{a.nombre}</td>
                  <td className={styles.numericCell}>{a.tickets_resueltos}</td>
                  <td className={styles.numericCell}>{a.tickets_en_progreso}</td>
                  <td className={styles.numericCell}>{a.tickets_vencidos}</td>
                  <td
                    className={`${styles.numericCell} ${a.tiempo_promedio_resolucion_min === null ? styles.cellMuted : ""}`}
                  >
                    {formatMinutes(a.tiempo_promedio_resolucion_min)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>

      {/* --- Charts --- */}
      <div className={styles.chartsRow}>
        <article className={styles.chartCard}>
          <header className={styles.cardHeader}>
            <span className={styles.cardTitle}>Tickets resueltos por agente</span>
            <span className={styles.cardMeta}>Top {barData.length}</span>
          </header>
          <div className={styles.chartBody}>
            {barData.length === 0 ? (
              <div className={styles.chartEmpty}>
                Sin datos para graficar.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--divider-soft)" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 12, fill: "var(--ink-muted-80)" }}
                    interval={0}
                    angle={barData.length > 5 ? -25 : 0}
                    textAnchor={barData.length > 5 ? "end" : "middle"}
                    height={barData.length > 5 ? 70 : 30}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 12, fill: "var(--ink-muted-80)" }}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(0, 102, 204, 0.06)" }}
                    contentStyle={{
                      background: "var(--canvas)",
                      border: "1px solid var(--hairline)",
                      borderRadius: 8,
                      fontFamily: "var(--type-text)",
                      fontSize: 13,
                    }}
                  />
                  <Bar dataKey="Resueltos" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </article>

        <article className={styles.chartCard}>
          <header className={styles.cardHeader}>
            <span className={styles.cardTitle}>Distribución por estado</span>
            <span className={styles.cardMeta}>
              {totals.tickets_totales} tickets totales
            </span>
          </header>
          <div className={styles.chartBody}>
            {!pieHasData ? (
              <div className={styles.chartEmpty}>
                Aún no hay tickets para distribuir.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {pieData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={STATUS_COLORS[entry.name as keyof typeof STATUS_COLORS]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--canvas)",
                      border: "1px solid var(--hairline)",
                      borderRadius: 8,
                      fontFamily: "var(--type-text)",
                      fontSize: 13,
                    }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    wrapperStyle={{
                      fontFamily: "var(--type-text)",
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </article>
      </div>
    </>
  );
}

function KpiCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className={styles.kpiCard}>
      <span className={styles.kpiLabel}>{label}</span>
      <span className={`${styles.kpiValue} ${accent ?? ""}`}>{value}</span>
    </div>
  );
}

function pickSortValue(a: AgentMetrics, key: SortKey): string | number | null {
  switch (key) {
    case "nombre":
      return a.nombre;
    case "tiempo_promedio_resolucion_min":
      return a.tiempo_promedio_resolucion_min;
    default:
      return a[key];
  }
}

function formatMinutes(min: number | null): string {
  if (min === null) return "—";
  if (min < 60) return `${Math.round(min)} min`;
  const hours = min / 60;
  if (hours < 24) return `${hours.toFixed(1)} h`;
  const days = hours / 24;
  return `${days.toFixed(1)} d`;
}

function humanize(err: unknown): string {
  if (err instanceof HttpError) {
    if (err.status === 401) return "Tu sesión expiró. Vuelve a iniciar sesión.";
    if (err.status === 403) return "Tu rol no permite ver las métricas.";
    return `Error del servidor (${err.status}): ${err.message}`;
  }
  if (err instanceof Error) return err.message;
  return "Error inesperado al cargar las métricas.";
}
