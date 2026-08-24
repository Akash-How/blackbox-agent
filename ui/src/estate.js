// Thin JSON-RPC client for the incident-mcp estate. The server runs a stateless
// Streamable HTTP transport, so bare tools/call posts work without a session.
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
