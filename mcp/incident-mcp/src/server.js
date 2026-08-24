// MCP server definition for the mock production estate.
// Tool annotations matter: TrueForge's default approval policy gates tools the
// server marks destructive, so rollback_deploy/restart_service pause for a human
// even before any per-agent override is applied.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const json = (value) => ({
  content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
});
const text = (value) => ({ content: [{ type: "text", text: value }] });
const toolError = (err) => ({
  content: [{ type: "text", text: `Error: ${err.message}` }],
  isError: true,
});

const guarded = (fn) => async (args) => {
  try {
    return await fn(args);
  } catch (err) {
    return toolError(err);
  }
};

export function createIncidentServer(estate) {
  const server = new McpServer({ name: "incident-mcp", version: "0.1.0" });

  const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
  const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };

  server.registerTool(
    "list_alerts",
    {
      description: "List all alerts in the monitoring system, firing and resolved.",
      inputSchema: {},
      annotations: { title: "List alerts", ...READ_ONLY },
    },
    guarded(async () => json(estate.listAlerts()))
  );

  server.registerTool(
    "get_service_status",
    {
      description: "Get the current status, version, and replica health of a service.",
      inputSchema: { service: z.string().describe("Service name, e.g. checkout-service") },
      annotations: { title: "Get service status", ...READ_ONLY },
    },
    guarded(async ({ service }) => json(estate.getServiceStatus(service)))
  );

  server.registerTool(
    "query_logs",
    {
      description:
        "Fetch recent raw log lines for a service (newline-delimited text, suitable for programmatic analysis).",
      inputSchema: {
        service: z.string(),
        limit: z.number().int().min(1).max(1000).default(200).describe("Max log lines"),
      },
      annotations: { title: "Query logs", ...READ_ONLY },
    },
    guarded(async ({ service, limit }) => text(estate.queryLogs(service, { limit })))
  );

  server.registerTool(
    "get_recent_deploys",
    {
      description: "List recent deploys, newest first. Optionally filter by service.",
      inputSchema: { service: z.string().optional() },
      annotations: { title: "Get recent deploys", ...READ_ONLY },
    },
    guarded(async ({ service }) => json(estate.getRecentDeploys(service)))
  );

  server.registerTool(
    "get_metrics",
    {
      description:
        "Get time-series metrics (memory, error rate, OOM kills) for a service over the last 30 minutes.",
      inputSchema: { service: z.string() },
      annotations: { title: "Get metrics", ...READ_ONLY },
    },
    guarded(async ({ service }) => json(estate.getMetrics(service)))
  );

  server.registerTool(
    "rollback_deploy",
    {
      description:
        "DESTRUCTIVE: Roll a service back to a previously deployed version. Requires human approval.",
      inputSchema: {
        service: z.string(),
        target_version: z.string().describe("Version to roll back to, e.g. v2.4.0"),
      },
      annotations: { title: "Rollback deploy", ...DESTRUCTIVE },
    },
    guarded(async ({ service, target_version }) =>
      json(estate.rollbackDeploy(service, target_version))
    )
  );

  server.registerTool(
    "restart_service",
    {
      description: "DESTRUCTIVE: Restart all replicas of a service. Requires human approval.",
      inputSchema: { service: z.string() },
      annotations: { title: "Restart service", ...DESTRUCTIVE },
    },
    guarded(async ({ service }) => json(estate.restartService(service)))
  );

  server.registerTool(
    "resolve_alert",
    {
      description: "Mark an alert as resolved with a written resolution.",
      inputSchema: { alert_id: z.string(), resolution: z.string() },
      // Writes state, but is reversible bookkeeping — not gated by default policy.
      annotations: { title: "Resolve alert", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    guarded(async ({ alert_id, resolution }) => json(estate.resolveAlert(alert_id, resolution)))
  );

  return server;
}
