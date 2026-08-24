import { memo, useEffect, useState } from "react";
import { TrueForgeUI } from "@truefoundry/trueforge-ui";
import { fetchEstate } from "./estate.js";

// Module-level constants: TrueForgeUI must never see a new prop identity, or its
// stores re-initialize on every parent render.
const SERVER = { type: "trueforge", baseUrl: "" };
const AGENT = { mode: "SingleAgent", name: "blackbox" };
const THEME = { preset: "trueforge", mode: "dark", brand: { name: "BLACKBOX" } };

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
  return <span className="clock">{now.toISOString().slice(0, 19).replace("T", " ")} UTC</span>;
}

const STATUS_META = {
  healthy: { label: "NOMINAL", cls: "ok", icon: "▮" },
  degraded: { label: "DEGRADED", cls: "crit", icon: "▲" },
};

function ServiceTile({ svc }) {
  const meta = STATUS_META[svc.status] ?? { label: svc.status.toUpperCase(), cls: "warn", icon: "◆" };
  return (
    <div className={`tile ${meta.cls}`}>
      <div className="tile-head">
        <span className={`led ${meta.cls}`} />
        <span className="tile-name">{svc.name}</span>
      </div>
      <div className="tile-row">
        <span className={`status-chip ${meta.cls}`}>
          {meta.icon} {meta.label}
        </span>
        <span className="tile-ver">{svc.version}</span>
      </div>
      <div className="tile-row dim">
        replicas {svc.healthyReplicas}/{svc.replicas}
        <span className="replica-dots">
          {Array.from({ length: svc.replicas }, (_, i) => (
            <span key={i} className={`rdot ${i < svc.healthyReplicas ? "up" : "down"}`} />
          ))}
        </span>
      </div>
    </div>
  );
}

function MemoryGauge({ metrics }) {
  if (!metrics?.memory_mb?.length) return null;
  const cur = metrics.memory_mb[metrics.memory_mb.length - 1];
  const limit = metrics.memory_limit_mb;
  const pct = Math.min(100, Math.round((cur / limit) * 100));
  const oom = metrics.oom_kills?.reduce((a, b) => a + b, 0) ?? 0;
  return (
    <div className="gauge-box">
      <div className="gauge-title">
        MEMORY — {metrics.service} <span className="dim">({cur} / {limit} MB)</span>
      </div>
      <div className="gauge-track" role="img" aria-label={`Memory ${pct}% of limit`}>
        <div className={`gauge-fill ${pct > 85 ? "crit" : pct > 60 ? "warn" : "ok"}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="gauge-foot">
        <span className={pct > 85 ? "crit-text" : "dim"}>{pct}% of limit</span>
        <span className={oom > 0 ? "crit-text" : "dim"}>▲ OOM kills: {oom}</span>
      </div>
    </div>
  );
}

function AlertBanner({ alerts }) {
  const firing = alerts.filter((a) => a.status === "firing");
  if (firing.length === 0) {
    return (
      <div className="alert-banner calm">
        <span className="led ok" /> ALL QUIET — no alerts firing
      </div>
    );
  }
  return firing.map((a) => (
    <div key={a.id} className="alert-banner firing">
      <div className="alert-top">
        <span className="sev">{a.severity}</span>
        <span className="alert-id">{a.id}</span>
        <span className="pulse-dot" />
      </div>
      <div className="alert-title">{a.title}</div>
      <div className="alert-svc">{a.service}</div>
    </div>
  ));
}

function EstatePanel() {
  const estate = useEstate();
  const firingCount = estate.alerts.filter((a) => a.status === "firing").length;

  useEffect(() => {
    document.title = firingCount > 0 ? `(${firingCount}) BLACKBOX // INCIDENT` : "BLACKBOX // Mission Control";
  }, [firingCount]);

  return (
    <>
      <div className="panel-label">
        ESTATE TELEMETRY {estate.error ? <span className="crit-text">(link down)</span> : <span className="scan" />}
      </div>
      <AlertBanner alerts={estate.alerts} />
      {estate.services.map((s) => (
        <ServiceTile key={s.name} svc={s} />
      ))}
      <MemoryGauge metrics={estate.metrics} />
      <div className="footer-note">
        license to investigate<span className="cursor">_</span>
      </div>
    </>
  );
}

function Defcon() {
  const estate = useEstate(5000);
  const firingCount = estate.alerts.filter((a) => a.status === "firing").length;
  return (
    <span className={`defcon ${firingCount > 0 ? "crit" : "ok"}`}>
      {firingCount > 0 ? `▲ ${firingCount} ALERT${firingCount > 1 ? "S" : ""} FIRING` : "▮ SYSTEMS NOMINAL"}
    </span>
  );
}

export default function App() {
  return (
    <div className="shell">
      <header className="topbar">
        <div className="wordmark">
          <span className="wm-block">⬛</span> BLACKBOX <span className="wm-sub">// MISSION CONTROL</span>
        </div>
        <div className="topbar-right">
          <Defcon />
          <Clock />
        </div>
      </header>

      <div className="main">
        <aside className="estate">
          <EstatePanel />
        </aside>
        <section className="chat">
          <Chat />
        </section>
      </div>
    </div>
  );
}
