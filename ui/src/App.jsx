import { memo, useEffect, useState } from "react";
import { TrueForgeUI } from "@truefoundry/trueforge-ui";
import { estateSnapshot, subscribeEstate } from "./estate.js";
import Sparkline from "./Sparkline.jsx";

// Module-level constants: TrueForgeUI must never see a new prop identity, or its
// stores re-initialize on every parent render.
const SERVER = { type: "trueforge", baseUrl: "" };
const AGENT = { mode: "SingleAgent", name: "blackbox" };
const THEME = {
  preset: "trueforge",
  mode: "dark",
  brand: { name: "BlackBox" },
  tokens: {
    primaryBg: "#0a0a0a",
    secondaryBg: "#101010",
    sidebarBg: "#101010",
    topbarBg: "#0a0a0a",
    cardBg: "#161616",
    border: "rgba(255,255,255,0.08)",
    textPrimary: "#f5f5f5",
    textSecondary: "#a3a3a3",
    fontFamily: "'Space Grotesk', system-ui, sans-serif",
    inputBoxBg: "#161616",
    inputBorder: "rgba(255,255,255,0.14)",
    userMessageBg: "#1c1c1c",
    userMessageText: "#f5f5f5",
    primaryButtonBg: "#f5f5f5",
    primaryButtonHover: "#ffffff",
    primaryButtonText: "#0a0a0a",
    ghostButtonHover: "#1c1c1c",
    focusRing: "rgba(255,255,255,0.25)",
    radius: "8px",
    composerRadius: "12px",
    scrollbarThumb: "rgba(255,255,255,0.14)",
    shadowColor: "rgba(0,0,0,0.5)",
  },
};

const Chat = memo(function Chat() {
  return <TrueForgeUI server={SERVER} layout="drawer" agentConfig={AGENT} theme={THEME} />;
});

// All components share one polling loop (see estate.js): subscribing here never
// starts a second timer, and overlapping requests are impossible by construction.
function useEstate() {
  const [state, setState] = useState(estateSnapshot);
  useEffect(() => subscribeEstate(setState), []);
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
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function firingOf(estate) {
  return estate.alerts.filter((a) => a.status === "firing");
}

/* ── sidebar blocks ─────────────────────────────── */

function IncidentCard({ alerts, metrics }) {
  const now = useNow(1000);
  const firing = alerts.filter((a) => a.status === "firing");
  if (firing.length === 0) {
    return (
      <div className="incident-card calm">
        <span className="dot" />
        No active incidents
      </div>
    );
  }
  return firing.map((a) => {
    const dur = fmtDuration(now - Date.parse(a.firedAt));
    const err = metrics?.error_rate_pct;
    return (
      <div key={a.id} className="incident-card">
        <div className="incident-head">
          <span className="live-dot" />
          <span className="incident-id">{a.id}</span>
          <span className="sev-badge">{a.severity}</span>
          {dur && <span className="incident-timer">{dur}</span>}
        </div>
        <div className="incident-title">{a.title}</div>
        <div className="incident-meta">{a.service}</div>
        {err?.length > 1 && (
          <div className="incident-trend">
            <div className="trend-readout">
              <span className="trend-value">{err[err.length - 1].toFixed(1)}%</span>
              <span className="trend-label">error rate · 30m</span>
            </div>
            <Sparkline data={err} width={104} height={32} color="--signal" format={(v) => `${v}%`} />
          </div>
        )}
      </div>
    );
  });
}

function ServiceRow({ svc }) {
  const crit = svc.status !== "healthy";
  return (
    <div className={`service-row ${crit ? "crit" : ""}`}>
      <span className="sdot" />
      <span className="service-name">{svc.name}</span>
      <span className="service-detail">
        {svc.version} · {svc.healthyReplicas}/{svc.replicas}
      </span>
    </div>
  );
}

function MemoryStat({ metrics }) {
  if (!metrics?.memory_mb?.length) return null;
  const cur = metrics.memory_mb[metrics.memory_mb.length - 1];
  const limit = metrics.memory_limit_mb;
  const pct = Math.min(100, Math.round((cur / limit) * 100));
  const oom = metrics.oom_kills?.reduce((a, b) => a + b, 0) ?? 0;
  const hot = pct > 85;
  return (
    <div className="metric-card">
      <div className="metric-ghost">
        <Sparkline
          data={metrics.memory_mb}
          width={272}
          height={44}
          color={hot ? "--signal" : "--border-3"}
          format={(v) => `${v} MB`}
        />
      </div>
      <div className="metric-label">Memory · {metrics.service}</div>
      <div className={`metric-stat ${hot ? "hot" : ""}`}>
        {(cur / 1024).toFixed(2)} <em>/ {(limit / 1024).toFixed(1)} GB</em>
      </div>
      <div className="metric-sub">
        <span className={hot ? "hot" : ""}>{pct}% of limit</span>
        <span className={oom > 0 ? "hot" : ""}>{oom} OOM kills · 30m</span>
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
            <div className="deploy-l1">
              <span className="deploy-svc">{d.service}</span>
              <span className="deploy-ver">{d.version}</span>
              {suspect && <span className="suspect-tag">suspect</span>}
              <span className="deploy-time">{relTime(d.deployedAt, now)}</span>
            </div>
            <div className="deploy-l2">
              {d.summary} · {d.author}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Sidebar() {
  const estate = useEstate();
  const firingCount = firingOf(estate).length;

  useEffect(() => {
    document.title = firingCount > 0 ? `(${firingCount}) BlackBox — Incident` : "BlackBox";
    document.documentElement.dataset.status = firingCount > 0 ? "incident" : "calm";
  }, [firingCount]);

  if (!estate.loaded && !estate.error) {
    return (
      <aside className="sidebar">
        <div className="skeleton" style={{ height: 120 }} />
        <div className="skeleton" style={{ height: 128 }} />
        <div className="skeleton" style={{ height: 96 }} />
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      <div className="section">
        <div className="section-title">
          Incident
          {estate.error && <span style={{ color: "var(--signal)", textTransform: "none", letterSpacing: 0 }}>telemetry offline</span>}
        </div>
        <IncidentCard alerts={estate.alerts} metrics={estate.metrics} />
      </div>

      <div className="section">
        <div className="section-title">Services · {estate.services.length}</div>
        <div className="service-list">
          {estate.services.map((s) => (
            <ServiceRow key={s.name} svc={s} />
          ))}
        </div>
      </div>

      {estate.metrics && (
        <div className="section">
          <div className="section-title">Resources</div>
          <MemoryStat metrics={estate.metrics} />
        </div>
      )}

      <div className="section">
        <div className="section-title">Deploys</div>
        <DeployFeed deploys={estate.deploys} services={estate.services} />
      </div>

      <div className="sidebar-footer">
        <span>incident-mcp · live</span>
        <span className="env-chip">demo</span>
      </div>
    </aside>
  );
}

function TopStatus() {
  const estate = useEstate();
  const firing = firingOf(estate).length;
  return (
    <span className="top-status">
      <span className="dot" />
      {firing > 0 ? `${firing} active incident${firing > 1 ? "s" : ""}` : "All systems operational"}
    </span>
  );
}

/* ── incident briefing overlay (replaces SDK's default empty state) ── */

function useThreadEmpty() {
  const [empty, setEmpty] = useState(true);
  useEffect(() => {
    const check = () =>
      setEmpty(!!document.querySelector(".chat .aui-thread-welcome-root"));
    check();
    const t = setInterval(check, 700);
    return () => clearInterval(t);
  }, []);
  return empty;
}

function prefillComposer(text) {
  const ta = document.querySelector(".chat textarea");
  if (!ta) return;
  // Use the prototype's native setter so React's controlled input sees the
  // change; fall back to direct assignment if the descriptor is unavailable.
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  if (setter) setter.call(ta, text);
  else ta.value = text;
  ta.dispatchEvent(new Event("input", { bubbles: true }));
  ta.focus();
}

function WelcomeOverlay() {
  const estate = useEstate();
  const now = useNow(1000);
  const empty = useThreadEmpty();
  if (!empty || !estate.loaded) return null;

  const firing = firingOf(estate)[0];
  const degraded = estate.services.find((s) => s.status !== "healthy");
  const suspect = degraded
    ? estate.deploys.find((d) => d.service === degraded.name && d.version === degraded.version)
    : null;

  const chips = firing
    ? [
        "We just got paged. Investigate the active alert.",
        `Summarize the last 30 minutes of ${firing.service} logs.`,
        ...(suspect ? [`Correlate the errors with deploy ${suspect.version}.`] : []),
        "Draft a status-page update for this incident.",
      ]
    : [
        "Give me a health summary of the estate.",
        "Any anomalies in the last 30 minutes of logs?",
        "List recent deploys and their risk.",
        "Walk me through the incident runbook.",
      ];

  const dur = firing ? fmtDuration(now - Date.parse(firing.firedAt)) : null;

  return (
    <div className="welcome">
      <div className="welcome-inner">
        <div className="welcome-context">
          {firing ? (
            <>
              <span className="live-dot" />
              {firing.id} · {firing.severity} · {dur}
            </>
          ) : (
            <>monitoring · all clear</>
          )}
        </div>
        <div className="welcome-greeting">
          {firing ? (
            <>
              <span className="fail">{firing.service}</span> is failing.{" "}
              <span className="ask">Where do we start?</span>
            </>
          ) : (
            <>
              All clear. <span className="ask">What do you want to look at?</span>
            </>
          )}
        </div>
        <div className="chips">
          {chips.slice(0, 4).map((c) => (
            <button key={c} className="chip" onClick={() => prefillComposer(c)}>
              {c}
            </button>
          ))}
        </div>
        <div className="welcome-hint">
          <span><span className="kbd">Enter</span> send</span>
          <span><span className="kbd">Shift + Enter</span> newline</span>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <div className="shell">
      <div className="ribbon" />
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
          <WelcomeOverlay />
        </section>
      </div>
    </div>
  );
}
