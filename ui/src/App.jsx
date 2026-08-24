import { memo, useEffect, useState } from "react";
import { TrueForgeUI } from "@truefoundry/trueforge-ui";
import { fetchEstate } from "./estate.js";

// Module-level constants: TrueForgeUI must never see a new prop identity, or its
// stores re-initialize on every parent render.
const SERVER = { type: "trueforge", baseUrl: "" };
const AGENT = { mode: "SingleAgent", name: "blackbox" };
const THEME = { preset: "trueforge", mode: "dark", brand: { name: "BlackBox" } };

const Chat = memo(function Chat() {
  return <TrueForgeUI server={SERVER} layout="drawer" agentConfig={AGENT} theme={THEME} />;
});

function useEstate(intervalMs = 4000) {
  const [state, setState] = useState({ alerts: [], services: [], metrics: null, error: null });
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const e = await fetchEstate();
        if (alive) setState({ ...e, error: null });
      } catch (err) {
        if (alive) setState((s) => ({ ...s, error: err.message }));
      }
    };
    tick();
    const t = setInterval(tick, intervalMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [intervalMs]);
  return state;
}

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="clock">{now.toISOString().slice(11, 19)} UTC</span>;
}

function elapsed(sinceIso) {
  const ms = Date.now() - Date.parse(sinceIso);
  if (Number.isNaN(ms) || ms < 0) return null;
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

const STATUS = {
  healthy: { label: "Operational", cls: "ok" },
  degraded: { label: "Degraded", cls: "crit" },
};

function StatusPill({ status }) {
  const meta = STATUS[status] ?? { label: status, cls: "warn" };
  return (
    <span className={`pill ${meta.cls}`}>
      <span className="dot" />
      {meta.label}
    </span>
  );
}

function IncidentCard({ alerts }) {
  const firing = alerts.filter((a) => a.status === "firing");
  if (firing.length === 0) {
    return (
      <div className="incident-card calm">
        <span className="pill ok"><span className="dot" />No active incidents</span>
      </div>
    );
  }
  return firing.map((a) => {
    const age = elapsed(a.firedAt);
    return (
      <div key={a.id} className="incident-card firing">
        <div className="incident-head">
          <span className="sev-badge">{a.severity}</span>
          <span className="incident-id">{a.id}</span>
        </div>
        <div className="incident-title">{a.title}</div>
        <div className="incident-meta">
          <span className="svc">{a.service}</span>
          {age && <span>· firing for {age}</span>}
        </div>
      </div>
    );
  });
}

function ServiceRow({ svc }) {
  const meta = STATUS[svc.status] ?? { cls: "warn" };
  return (
    <div className={`service-row ${meta.cls}`}>
      <div className="service-info">
        <div className="service-name">{svc.name}</div>
        <div className="service-sub">
          <span>{svc.version}</span>
          <span>
            {svc.healthyReplicas}/{svc.replicas}
            <span className="replicas">
              {Array.from({ length: svc.replicas }, (_, i) => (
                <i key={i} className={i < svc.healthyReplicas ? "" : "down"} />
              ))}
            </span>
          </span>
        </div>
      </div>
      <div className="service-status">
        <StatusPill status={svc.status} />
      </div>
    </div>
  );
}

function MemoryMetric({ metrics }) {
  if (!metrics?.memory_mb?.length) return null;
  const cur = metrics.memory_mb[metrics.memory_mb.length - 1];
  const limit = metrics.memory_limit_mb;
  const pct = Math.min(100, Math.round((cur / limit) * 100));
  const oom = metrics.oom_kills?.reduce((a, b) => a + b, 0) ?? 0;
  return (
    <div className="metric-card">
      <div className="metric-head">
        <span className="metric-label">Memory · {metrics.service}</span>
        <span className="metric-value">
          <strong>{(cur / 1024).toFixed(1)}</strong> / {(limit / 1024).toFixed(1)} GB
        </span>
      </div>
      <div className="bar-track" role="img" aria-label={`Memory at ${pct}% of limit`}>
        <div className={`bar-fill ${pct > 85 ? "crit" : pct > 60 ? "warn" : "ok"}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="metric-foot">
        <span className={pct > 85 ? "crit-text" : ""}>{pct}% of limit</span>
        <span className={oom > 0 ? "crit-text" : ""}>{oom} OOM kills · 30m</span>
      </div>
    </div>
  );
}

function Sidebar() {
  const estate = useEstate();
  const firingCount = estate.alerts.filter((a) => a.status === "firing").length;

  useEffect(() => {
    document.title = firingCount > 0 ? `(${firingCount}) BlackBox — Incident` : "BlackBox";
  }, [firingCount]);

  return (
    <aside className="sidebar">
      <div className="section">
        <div className="section-title">
          Incidents
          {estate.error && <span className="link-state" style={{ color: "var(--red)" }}>telemetry offline</span>}
        </div>
        <IncidentCard alerts={estate.alerts} />
      </div>

      <div className="section">
        <div className="section-title">Services</div>
        <div className="service-list">
          {estate.services.map((s) => (
            <ServiceRow key={s.name} svc={s} />
          ))}
        </div>
      </div>

      {estate.metrics && (
        <div className="section">
          <div className="section-title">Resources</div>
          <MemoryMetric metrics={estate.metrics} />
        </div>
      )}

      <div className="sidebar-footer">
        <span>incident-mcp · live</span>
        <span className="env-chip">demo</span>
      </div>
    </aside>
  );
}

function TopStatus() {
  const estate = useEstate(5000);
  const firing = estate.alerts.filter((a) => a.status === "firing").length;
  return firing > 0 ? (
    <span className="pill crit"><span className="dot" />{firing} active incident{firing > 1 ? "s" : ""}</span>
  ) : (
    <span className="pill ok"><span className="dot" />All systems operational</span>
  );
}

export default function App() {
  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-left">
          <div className="logo-mark">B</div>
          <span className="product-name">BlackBox</span>
          <span className="crumb-sep">/</span>
          <span className="crumb">Incident response</span>
        </div>
        <div className="topbar-right">
          <TopStatus />
          <Clock />
        </div>
      </header>

      <div className="main">
        <Sidebar />
        <section className="chat">
          <Chat />
        </section>
      </div>
    </div>
  );
}
