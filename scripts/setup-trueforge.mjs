#!/usr/bin/env node
// One-shot provisioning of a running TrueForge instance for the BlackBox demo:
// model provider + incident-mcp connector + incident-runbook skill + the agent.
// Idempotent: existing resources (HTTP 409) are left in place.
//
// Usage:  node scripts/setup-trueforge.mjs
// Env:
//   TRUEFORGE_BASE_URL   default http://localhost:8790
//   OPENCODE_API_KEY | ANTHROPIC_API_KEY | OPENAI_API_KEY | GEMINI_API_KEY
//     (first one found wins; OPENCODE_API_KEY uses the free "Ox Alpha" stealth model)
//   INCIDENT_MCP_URL     default http://localhost:8791/mcp
//   MCP_AUTH_TOKEN       optional bearer token if incident-mcp runs with auth
//   SKILL_REPO_URL       public git repo containing this project (enables the skill)
//   SKILL_REPO_REF       default main
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BASE = (process.env.TRUEFORGE_BASE_URL ?? "http://localhost:8790").replace(/\/$/, "");
const MCP_URL = process.env.INCIDENT_MCP_URL ?? "http://localhost:8791/mcp";
const SKILL_REPO = process.env.SKILL_REPO_URL;
const SKILL_REF = process.env.SKILL_REPO_REF ?? "main";

const PROVIDERS = [
  {
    // OpenCode Zen gateway — "Ox Alpha" stealth model, free for a limited time.
    env: "OPENCODE_API_KEY", type: "custom", name: "opencode",
    base_url: "https://opencode.ai/zen/v1",
    model: { model_id: "x-preview-f-free", name: "ox-alpha", properties: {} },
  },
  {
    env: "ANTHROPIC_API_KEY", type: "anthropic",
    model: { model_id: "claude-sonnet-4-6", name: "claude-sonnet-4-6", properties: { context_length: 200000, max_output_tokens: 64000 } },
  },
  {
    env: "OPENAI_API_KEY", type: "openai",
    model: { model_id: "gpt-5.2", name: "gpt-5.2", properties: { context_length: 272000, max_output_tokens: 128000 } },
  },
  {
    env: "GEMINI_API_KEY", type: "google-gemini",
    model: { model_id: "gemini-3-pro", name: "gemini-3-pro", properties: { context_length: 1000000, max_output_tokens: 64000 } },
  },
];

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const instructions = readFileSync(path.join(repoRoot, "agent", "system-prompt.md"), "utf8");

async function api(method, route, body) {
  const res = await fetch(`${BASE}/api/v1${route}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return { status: res.status, data };
}

function report(step, { status, data }) {
  if (status >= 200 && status < 300) console.log(`  ✔ ${step}`);
  else if (status === 409) console.log(`  ✔ ${step} (already exists, left as-is)`);
  else {
    console.error(`  ✖ ${step} failed (HTTP ${status}):`, JSON.stringify(data, null, 2));
    process.exitCode = 1;
  }
  return status < 300 || status === 409;
}

console.log(`Provisioning TrueForge at ${BASE}\n`);

// 0. Reachability
try {
  await fetch(BASE);
} catch {
  console.error(`Cannot reach TrueForge at ${BASE}. Start it first: npx @truefoundry/trueforge`);
  process.exit(1);
}

// 1. Model provider
const provider = PROVIDERS.find((p) => process.env[p.env]);
if (!provider) {
  console.error(`No model API key found. Set one of: ${PROVIDERS.map((p) => p.env).join(", ")}`);
  process.exit(1);
}
const providerName = provider.name ?? provider.type;
report(
  `model provider "${providerName}" (${provider.model.model_id})`,
  await api("PUT", "/settings/model-providers", {
    manifest: {
      type: provider.type,
      ...(provider.type === "custom" ? { name: provider.name, base_url: provider.base_url } : {}),
      auth: { api_key: process.env[provider.env] },
      models: [provider.model],
    },
  })
);

// 2. incident-mcp connector
report(
  `MCP server "incident-mcp" at ${MCP_URL}`,
  await api("PUT", "/settings/mcp-servers", {
    manifest: {
      type: "remote",
      name: "incident-mcp",
      url: MCP_URL,
      description: "Mock production estate: alerts, logs, metrics, deploys, rollback/restart.",
      ...(process.env.MCP_AUTH_TOKEN
        ? { auth: { type: "header", headers: { authorization: `Bearer ${process.env.MCP_AUTH_TOKEN}` } } }
        : {}),
    },
  })
);

// 3. Sandbox — configure Daytona if a key was given, then check what the server reports.
if (process.env.DAYTONA_API_KEY) {
  report(
    `sandbox provider "daytona"`,
    await api("PUT", "/settings/sandbox-providers", {
      manifest: {
        type: "daytona",
        auth: { api_key: process.env.DAYTONA_API_KEY },
        exec_timeout_ms: 60000,
        auto_stop_interval_in_minutes: 5,
        auto_archive_interval_in_minutes: 60,
        auto_delete_interval_in_minutes: 7200,
      },
    })
  );
}
const capabilities = (await api("GET", "/capabilities")).data?.data ?? {};
const sandboxEnabled = capabilities.sandbox?.enabled === true;
if (!sandboxEnabled) {
  console.log(
    "  ! no sandbox available — creating the agent with sandbox and skills disabled.\n" +
      "    Enable one (DAYTONA_API_KEY, or install bwrap/socat/rg on Linux and restart\n" +
      "    TrueForge), then rerun this script to upgrade the agent."
  );
}

// 4. incident-runbook skill (git-backed — needs the public repo URL and a sandbox)
let skillConfigured = false;
if (SKILL_REPO && sandboxEnabled) {
  skillConfigured = report(
    `skill "incident-runbook" from ${SKILL_REPO}@${SKILL_REF}`,
    await api("PUT", "/settings/skills", {
      manifest: {
        type: "git",
        name: "incident-runbook",
        url: SKILL_REPO,
        ref: SKILL_REF,
        path: "agent/skills/incident-runbook",
        description: "Standard triage procedure for a firing production alert.",
      },
    })
  );
} else {
  console.log(
    `  – skill skipped (${SKILL_REPO ? "needs a sandbox" : "set SKILL_REPO_URL to your public repo"})`
  );
}

// 4. The BlackBox agent (upsert: replace by id if the name is already taken)
const agentManifest = {
  model: {
    name: `${providerName}/${provider.model.name}`,
    params: { temperature: 0.2 },
  },
  instructions,
  mcp_servers: [
    {
      name: "incident-mcp",
      enable_tools: ["@all"],
      // Belt and braces: the harness already gates destructive-annotated tools;
      // we also pin them by name so the policy survives annotation changes.
      require_approval_for_tools: ["rollback_deploy", "restart_service"],
    },
  ],
  ...(skillConfigured ? { skills: [{ name: "incident-runbook" }] } : {}),
  config: {
    sandbox: { enabled: sandboxEnabled },
    dynamic_sub_agents: { enabled: true },
    ask_user_questions: { enabled: true },
    iteration_limit: 60,
  },
};

const agents = (await api("GET", "/agents")).data;
const existing = (Array.isArray(agents) ? agents : agents?.data ?? []).find?.(
  (a) => a.name === "blackbox"
);
report(
  existing ? `agent "blackbox" (updated)` : `agent "blackbox" (created)`,
  existing
    ? await api("PUT", `/agents/${existing.id}`, { manifest: agentManifest })
    : await api("POST", "/agents", { name: "blackbox", manifest: agentManifest })
);

console.log(`
Done. Next:
  1. Ensure incident-mcp is running:   cd mcp/incident-mcp && npm start
  2. Sandbox (needed for the log-analysis step and skills), either:
     - Linux/macOS local fallback: install bwrap, socat, rg and restart TrueForge, or
     - Daytona: add your API key in Settings → Sandbox providers.
  3. Open ${BASE}, pick the "blackbox" agent, and say:
     "We just got paged. Investigate the active alert."
`);
