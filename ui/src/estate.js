// Thin JSON-RPC client for the incident-mcp estate, plus a shared polling store.
// The server runs a stateless Streamable HTTP transport, so bare tools/call posts
// work without a session.
let nextId = 1;

async function callTool(name, args = {}) {
  const res = await fetch("/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: nextId++,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  if (!res.ok) throw new Error(`incident-mcp HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(body.error.message);
  const text = body.result?.content?.[0]?.text ?? "null";
  // MCP surfaces tool failures as isError + plain-text content, not JSON.
  if (body.result?.isError) throw new Error(text);
  return JSON.parse(text);
}

export const SERVICES = ["checkout-service", "payments-service", "catalog-service"];

export async function fetchEstate() {
  const [alerts, deploys, ...services] = await Promise.all([
    callTool("list_alerts"),
    callTool("get_recent_deploys"),
    ...SERVICES.map((s) => callTool("get_service_status", { service: s })),
  ]);
  let metrics = null;
  const degraded = services.find((s) => s.status !== "healthy");
  if (degraded) {
    try {
      metrics = { service: degraded.name, ...(await callTool("get_metrics", { service: degraded.name })) };
    } catch {
      metrics = null;
    }
  }
  return { alerts, deploys, services, metrics, at: Date.now() };
}

// ── shared polling store ─────────────────────────────────────────────────────
// One poll loop for the whole app, no matter how many components subscribe.
// setTimeout is chained after each fetch completes, so requests can never
// overlap or land out of order.
const POLL_MS = 4000;
const listeners = new Set();
let snapshot = { alerts: [], deploys: [], services: [], metrics: null, error: null, loaded: false };
let timer = null;
let inFlight = false;

export function estateSnapshot() {
  return snapshot;
}

async function poll() {
  if (inFlight) return;
  inFlight = true;
  try {
    const e = await fetchEstate();
    snapshot = { ...e, error: null, loaded: true };
  } catch (err) {
    snapshot = { ...snapshot, error: err.message };
  } finally {
    inFlight = false;
    for (const fn of listeners) fn(snapshot);
    if (listeners.size > 0) timer = setTimeout(poll, POLL_MS);
  }
}

export function subscribeEstate(fn) {
  listeners.add(fn);
  fn(snapshot);
  if (listeners.size === 1) {
    clearTimeout(timer);
    poll();
  }
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) clearTimeout(timer);
  };
}
