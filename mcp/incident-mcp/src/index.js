#!/usr/bin/env node
// incident-mcp entrypoint.
//   node src/index.js            → Streamable HTTP on :8791 (what TrueForge connects to)
//   node src/index.js --stdio    → stdio transport (for MCP Inspector / local clients)
// Env: PORT, MCP_AUTH_TOKEN (optional bearer token for the HTTP endpoint).
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Estate } from "./estate.js";
import { createIncidentServer } from "./server.js";
import { startHttpServer } from "./http.js";

const estate = new Estate();

if (process.argv.includes("--stdio")) {
  const server = createIncidentServer(estate);
  await server.connect(new StdioServerTransport());
  console.error("incident-mcp ready (stdio)");
} else {
  const port = Number(process.env.PORT ?? 8791);
  const httpServer = await startHttpServer(estate, { port });
  const shutdown = () => {
    console.error("incident-mcp shutting down");
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
