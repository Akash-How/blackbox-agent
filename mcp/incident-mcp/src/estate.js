// In-memory model of the mock production estate.
// Pure state machine, no MCP wiring — see index.js for the server, test/ for unit tests.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DATA_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..", "..", "..", "demo-data", "estate.json"
);

export class Estate {
  constructor(seedData = JSON.parse(readFileSync(DATA_PATH, "utf8"))) {
    // Deep-copy so a rollback in one session never mutates the seed file's object.
    this.state = structuredClone(seedData);
  }

  listAlerts() {
    return this.state.alerts;
  }

  getServiceStatus(name) {
    const svc = this.state.services.find((s) => s.name === name);
    if (!svc) throw new Error(`Unknown service: ${name}. Known: ${this.serviceNames().join(", ")}`);
    return svc;
  }

  serviceNames() {
    return this.state.services.map((s) => s.name);
  }

  getRecentDeploys(service) {
    const deploys = service
      ? this.state.deploys.filter((d) => d.service === service)
      : this.state.deploys;
    return [...deploys].sort((a, b) => b.deployedAt.localeCompare(a.deployedAt));
  }

  getMetrics(service) {
    const m = this.state.metrics[service];
    if (!m) throw new Error(`No metrics for service: ${service}`);
    return m;
  }

  // Deterministic pseudo-random log stream. A degraded checkout-service emits an
  // escalating pattern of cache-driven OOM errors; healthy services emit routine noise.
  queryLogs(service, { limit = 200 } = {}) {
    const svc = this.getServiceStatus(service);
    const lines = [];
    let seed = 42;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;

    const base = Date.parse("2026-08-24T09:31:00Z");
    for (let i = 0; i < limit; i++) {
      const ts = new Date(base + i * 7000).toISOString();
      const r = rand();
      if (svc.status === "degraded") {
        const failing = i / limit; // errors escalate through the window
        if (r < failing * 0.55) {
          lines.push(`${ts} ERROR [PricingCache] allocation failed: heap near limit (cache entries=${100000 + i * 850}, no eviction policy configured)`);
        } else if (r < failing * 0.7) {
          lines.push(`${ts} ERROR [http] 502 POST /api/checkout — upstream pod OOMKilled, restarting`);
        } else if (r < failing * 0.75) {
          lines.push(`${ts} WARN  [runtime] GC pause ${Math.round(400 + r * 900)}ms, old gen 97% full`);
        } else {
          lines.push(`${ts} INFO  [http] 200 POST /api/checkout ${Math.round(80 + r * 60)}ms`);
        }
      } else {
        lines.push(`${ts} INFO  [http] 200 ${r < 0.5 ? "GET" : "POST"} /api/${svc.name.split("-")[0]} ${Math.round(20 + r * 90)}ms`);
      }
    }
    return lines.join("\n");
  }

  // --- Destructive operations (approval-gated at the harness level) ---

  rollbackDeploy(service, targetVersion) {
    const svc = this.getServiceStatus(service);
    const target = this.state.deploys.find(
      (d) => d.service === service && d.version === targetVersion
    );
    if (!target) throw new Error(`No deploy of ${service} at ${targetVersion} to roll back to.`);
    if (svc.version === targetVersion) throw new Error(`${service} is already on ${targetVersion}.`);

    const from = svc.version;
    svc.version = targetVersion;
    svc.status = "healthy";
    svc.healthyReplicas = svc.replicas;
    this.#resolveAlertsFor(service, `rolled back ${from} -> ${targetVersion}`);
    return { service, rolledBackFrom: from, nowRunning: targetVersion, status: svc.status };
  }

  restartService(service) {
    const svc = this.getServiceStatus(service);
    // A restart alone doesn't fix a bad deploy — the leak just starts over.
    const fixed = svc.status !== "degraded";
    svc.healthyReplicas = svc.replicas;
    return {
      service,
      restarted: true,
      status: svc.status,
      note: fixed
        ? "Service healthy."
        : "Replicas restarted, but the service is still running the same version; memory is climbing again.",
    };
  }

  resolveAlert(alertId, resolution) {
    const alert = this.state.alerts.find((a) => a.id === alertId);
    if (!alert) throw new Error(`Unknown alert: ${alertId}`);
    alert.status = "resolved";
    alert.resolution = resolution;
    return alert;
  }

  #resolveAlertsFor(service, resolution) {
    for (const a of this.state.alerts) {
      if (a.service === service && a.status === "firing") {
        a.status = "resolved";
        a.resolution = resolution;
      }
    }
  }
}
