import { memo, useEffect, useState } from "react";
import { TrueForgeUI } from "@truefoundry/trueforge-ui";
import { fetchEstate } from "./estate.js";
import Sparkline from "./Sparkline.jsx";

// Module-level constants: TrueForgeUI must never see a new prop identity, or its
// stores re-initialize on every parent render.
const SERVER = { type: "trueforge", baseUrl: "" };
const AGENT = { mode: "SingleAgent", name: "blackbox" };
const THEME = { preset: "trueforge", mode: "dark", brand: { name: "BlackBox" } };

const Chat = memo(function Chat() {
  return <TrueForgeUI server={SERVER} layout="drawer" agentConfig={AGENT} theme={THEME} />;
});

function useEstate(intervalMs = 4000) {
  const [state, setState] = useState({ alerts: [], deploys: [], services: [], metrics: null, error: null, loaded: false });
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const e = await fetchEstate();
        if (alive) setState({ ...e, error: null, loaded: true });
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

function useNow(everyMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

function Clock() {
  const now = useNow(1000);
  return <span className="clock">{new Date(now).toISOString().slice(11, 19)} UTC</span>;
}

function fmtDuration(ms) {
  if (Number.isNaN(ms) || ms < 0) return null;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function relTime(iso, now) {
  const ms = now - Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
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

function IncidentCard({ alerts, metrics }) {
  const now = useNow(1000);
  const firing = alerts.filter((a) => a.status === "firing");
  if (firing.length === 0) {
    return (
      <div className="incident-card calm">
        <span className="pill ok"><span className="dot" />No active incidents</span>
      </div>
    );
  }
  return firing.map((a) => {
    const dur = fmtDuration(now - Date.parse(a.firedAt));
    const err = metrics?.error_rate_pct;
    return (
      <div key={a.id} className="incident-card firing">
        <div className="incident-head">
          <span className="sev-badge">{a.severity}</span>
          <span className="incident-id">{a.id}</span>
          {dur && <span className="incident-timer">{dur}</span>}
        </div>
        <div className="incident-title">{a.title}</div>
        <div className="incident-meta">
          <span className="svc">{a.service}</span>
        </div>
        {err?.length > 1 && (
          <div className="incident-trend">
            <div className="trend-readout">
              <span className="trend-value">{err[err.length - 1].toFixed(1)}%</span>
              <span className="trend-label">error rate · 30m</span>
            </div>
            <Sparkline data={err} width={110} height={30} color="--red" format={(v) => `${v}%`} />
          </div>
        )}
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

function ResourceCards({ metrics }) {
  if (!metrics?.memory_mb?.length) return null;
  const cur = metrics.memory_mb[metrics.memory_mb.length - 1];
  const limit = metrics.memory_limit_mb;
  const pct = Math.min(100, Math.round((cur / limit) * 100));
  const oom = metrics.oom_kills?.reduce((a, b) => a + b, 0) ?? 0;
  const sev = pct > 85 ? "crit" : pct > 60 ? "warn" : "ok";
  return (
    <div className="metric-card">
      <div className="metric-row">
        <div className="metric-copy">
          <span className="metric-label">Memory · {metrics.service}</span>
          <span className="metric-big">
            {(cur / 1024).toFixed(2)} <em>/ {(limit / 1024).toFixed(1)} GB</em>
          </span>
        </div>
        <Sparkline
          data={metrics.memory_mb}
          width={110}
          height={30}
          color={sev === "crit" ? "--red" : sev === "warn" ? "--amber" : "--green"}
          format={(v) => `${v} MB`}
        />
      </div>
      <div className="bar-track" role="img" aria-label={`Memory at ${pct}% of limit`}>
        <div className={`bar-fill ${sev}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="metric-foot">
        <span className={sev === "crit" ? "crit-text" : ""}>{pct}% of limit</span>
        <span className={oom > 0 ? "crit-text" : ""}>{oom} OOM kills · 30m</span>
      </div>
    </div>
  );
}

function DeployFeed({ deploys, services }) {
  const now = useNow(30000);
  if (!deploys?.length) return null;
  const degraded = services.find((s) => s.status !== "healthy");
  return (
    <div className="deploy-list">
      {deploys.slice(0, 4).map((d) => {
        const suspect = degraded && d.service === degraded.name && d.version === degraded.version;
        return (
          <div key={d.id} className={`deploy-row ${suspect ? "suspect" : ""}`}>
            <span className="avatar" aria-hidden="true">{d.author[0].toUpperCase()}</span>
            <div className="deploy-info">
              <div className="deploy-line">
                <span className="deploy-svc">{d.service}</span>
                <span className="deploy-ver">{d.version}</span>
                {suspect && <span className="suspect-chip">suspect</span>}
              </div>
              <div className="deploy-sub">
                {d.summary} · {d.author} · {relTime(d.deployedAt, now)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Sidebar() {
  const estate = useEstate();
  const firingCount = estate.alerts.filter((a) => a.status === "firing").length;

  useEffect(() => {
    document.title = firingCount > 0 ? `(${firingCount}) BlackBox — Incident` : "BlackBox";
  }, [firingCount]);

  if (!estate.loaded && !estate.error) {
    return (
      <aside className="sidebar">
        <div className="skeleton" style={{ height: 92 }} />
        <div className="skeleton" style={{ height: 128 }} />
        <div className="skeleton" style={{ height: 90 }} />
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      <div className="section" style={{ "--i": 0 }}>
        <div className="section-title">
          Incidents
          {estate.error && <span className="link-state" style={{ color: "var(--red)" }}>telemetry offline</span>}
        </div>
        <IncidentCard alerts={estate.alerts} metrics={estate.metrics} />
      </div>

      <div className="section" style={{ "--i": 1 }}>
        <div className="section-title">Services</div>
        <div className="service-list">
          {estate.services.map((s) => (
            <ServiceRow key={s.name} svc={s} />
          ))}
        </div>
      </div>

      {estate.metrics && (
        <div className="section" style={{ "--i": 2 }}>
          <div className="section-title">Resources</div>
          <ResourceCards metrics={estate.metrics} />
        </div>
      )}

      <div className="section" style={{ "--i": 3 }}>
        <div className="section-title">Recent deploys</div>
        <DeployFeed deploys={estate.deploys} services={estate.services} />
      </div>

      <div className="sidebar-footer">
        <span className="live-indicator"><span className="live-dot" />incident-mcp</span>
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
