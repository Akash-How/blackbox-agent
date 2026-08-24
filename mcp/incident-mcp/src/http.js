// Streamable-HTTP front end for incident-mcp — the transport TrueForge connectors
// speak. Stateless mode: each POST gets a fresh transport wired to the shared estate,
// so the incident state persists across requests without session bookkeeping.
import http from "node:http";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createIncidentServer } from "./server.js";

const MCP_PATH = "/mcp";

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 4 * 1024 * 1024) reject(new Error("Body too large"));
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

export function startHttpServer(estate, { port = 8791, authToken = process.env.MCP_AUTH_TOKEN } = {}) {
  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

    if (req.method === "GET" && url.pathname === "/healthz") {
      return sendJson(res, 200, { ok: true, service: "incident-mcp" });
    }

    if (url.pathname !== MCP_PATH) {
      return sendJson(res, 404, { error: `Not found. MCP endpoint is ${MCP_PATH}` });
    }

    if (authToken) {
      const got = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
      if (got !== authToken) {
        return sendJson(res, 401, { error: "Unauthorized" });
      }
    }

    if (req.method !== "POST") {
      // Stateless mode: no server-push GET stream, no session DELETE.
      return sendJson(res, 405, {
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed. POST JSON-RPC to /mcp." },
        id: null,
      });
    }

    let parsedBody;
    try {
      parsedBody = JSON.parse(await readBody(req));
    } catch {
      return sendJson(res, 400, {
        jsonrpc: "2.0",
        error: { code: -32700, message: "Parse error" },
        id: null,
      });
    }

    const requestId = randomUUID().slice(0, 8);
    try {
      const server = createIncidentServer(estate);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless
        enableJsonResponse: true,
      });
      res.on("close", () => {
        transport.close();
        server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, parsedBody);
    } catch (err) {
      console.error(`[${requestId}] request failed:`, err);
      if (!res.headersSent) {
        sendJson(res, 500, {
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  return new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, () => {
      const actualPort = httpServer.address().port;
      console.error(
        `incident-mcp listening on http://localhost:${actualPort}${MCP_PATH}` +
          (authToken ? " (bearer auth enabled)" : " (no auth — local use only)")
      );
      resolve(httpServer);
    });
  });
}
