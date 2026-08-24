// Integration tests: full JSON-RPC round-trips over the Streamable HTTP transport,
// exactly as a TrueForge connector would speak to us.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Estate } from "../src/estate.js";
import { startHttpServer } from "../src/http.js";

let server;
let base;
let nextId = 1;

async function rpc(method, params = {}, { token } = {}) {
  const res = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
  });
  return { status: res.status, body: await res.json() };
}

const init = () =>
  rpc("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "test", version: "0" },
  });

before(async () => {
  server = await startHttpServer(new Estate(), { port: 0, authToken: undefined });
  base = `http://localhost:${server.address().port}`;
});

after(() => server.close());

test("healthz responds ok", async () => {
  const res = await fetch(`${base}/healthz`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, service: "incident-mcp" });
});

test("initialize handshake succeeds", async () => {
  const { status, body } = await init();
  assert.equal(status, 200);
  assert.equal(body.result.serverInfo.name, "incident-mcp");
});

test("tools/list exposes 8 tools with correct destructive annotations", async () => {
  const { body } = await rpc("tools/list");
  const tools = Object.fromEntries(body.result.tools.map((t) => [t.name, t]));
  assert.equal(Object.keys(tools).length, 8);
  for (const name of ["list_alerts", "get_service_status", "query_logs", "get_recent_deploys", "get_metrics"]) {
    assert.equal(tools[name].annotations.readOnlyHint, true, `${name} should be read-only`);
  }
  for (const name of ["rollback_deploy", "restart_service"]) {
    assert.equal(tools[name].annotations.destructiveHint, true, `${name} should be destructive`);
  }
});

test("full incident arc over the wire: alert -> logs -> rollback -> resolved", async () => {
  const alerts = await rpc("tools/call", { name: "list_alerts", arguments: {} });
  const firing = JSON.parse(alerts.body.result.content[0].text).filter((a) => a.status === "firing");
  assert.equal(firing.length, 1);

  const logs = await rpc("tools/call", {
    name: "query_logs",
    arguments: { service: "checkout-service", limit: 300 },
  });
  assert.match(logs.body.result.content[0].text, /PricingCache/);

  const rollback = await rpc("tools/call", {
    name: "rollback_deploy",
    arguments: { service: "checkout-service", target_version: "v2.4.0" },
  });
  assert.equal(JSON.parse(rollback.body.result.content[0].text).nowRunning, "v2.4.0");

  const after = await rpc("tools/call", { name: "list_alerts", arguments: {} });
  const stillFiring = JSON.parse(after.body.result.content[0].text).filter((a) => a.status === "firing");
  assert.equal(stillFiring.length, 0, "estate state must persist across stateless HTTP requests");
});

test("tool errors surface as isError results, not protocol failures", async () => {
  const { status, body } = await rpc("tools/call", {
    name: "get_service_status",
    arguments: { service: "nonexistent-service" },
  });
  assert.equal(status, 200);
  assert.equal(body.result.isError, true);
  assert.match(body.result.content[0].text, /Unknown service/);
});

test("bearer auth rejects bad tokens and accepts good ones", async () => {
  const authed = await startHttpServer(new Estate(), { port: 0, authToken: "s3cret" });
  const authedBase = `http://localhost:${authed.address().port}`;
  try {
    const noToken = await fetch(`${authedBase}/mcp`, { method: "POST", body: "{}" });
    assert.equal(noToken.status, 401);

    const good = await fetch(`${authedBase}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: "Bearer s3cret",
      },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "initialize",
        params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "0" } },
      }),
    });
    assert.equal(good.status, 200);
  } finally {
    authed.close();
  }
});

test("malformed JSON gets a -32700 parse error", async () => {
  const res = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{not json",
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.code, -32700);
});
