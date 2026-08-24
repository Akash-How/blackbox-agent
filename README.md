# 🛩️ BlackBox

**An incident-response agent with a license to investigate — but not to act.**

Built on [TrueForge](https://trueforge.dev) for The Agent Harness Hackathon (WeMakeDevs × TrueFoundry).

BlackBox receives a production alert, fans out subagents to gather evidence over MCP
tools, analyzes logs with code it writes and runs in the TrueForge sandbox, names a
root cause — and then **stops for human approval** before touching anything
irreversible. Rollbacks and restarts never happen without a human saying yes.

## Architecture

```
┌──────────────┐   Streamable HTTP    ┌──────────────────────┐
│  TrueForge   │ ───────────────────► │  incident-mcp :8791  │
│  harness     │      /mcp            │  mock prod estate    │
│  :8790       │                      │  8 tools, 2 gated    │
│              │                      └──────────────────────┘
│  blackbox    │   sandbox (Daytona)  — agent-written log analysis
│  agent       │   subagents          — parallel logs/metrics/deploys
│              │   approval gates     — rollback_deploy, restart_service
└──────────────┘
```

The "production environment" is `incident-mcp`, a Model Context Protocol server we
built that simulates services, alerts, logs, metrics, and deploys deterministically.
The two dangerous tools carry MCP `destructiveHint` annotations — TrueForge's default
policy pauses on destructive tools, and the agent manifest additionally pins them in
`require_approval_for_tools`. The gate is enforced by the harness, not by prompt hope.

## Quickstart

Prerequisites: Node 20+, one LLM API key (Anthropic / OpenAI / Gemini), and a free
[Daytona](https://www.daytona.io) API key for the sandbox.

```bash
# 1. Install and test the mock-infra MCP server
cd mcp/incident-mcp
npm ci
npm test

# 2. Start it (Streamable HTTP on :8791)
npm start
```

```bash
# 3. In a second terminal: launch TrueForge (local mode, :8790)
npx @truefoundry/trueforge
```

```bash
# 4. In a third terminal: provision everything in one shot
export ANTHROPIC_API_KEY=sk-...        # or OPENAI_API_KEY / GEMINI_API_KEY
export SKILL_REPO_URL=https://github.com/<you>/<this-repo>   # optional, enables the skill
node scripts/setup-trueforge.mjs
```

The script registers the model provider, the `incident-mcp` connector, the git-backed
`incident-runbook` skill, and the `blackbox` agent (approval gates, sandbox, subagents,
temperature 0.2). It's idempotent — rerun it any time.

5. In TrueForge **Settings → Sandbox providers**, add your Daytona API key
   (the only manual step; required for sandbox code execution and skills).
6. Open http://localhost:8790, pick the **blackbox** agent, and say:

> We just got paged. Investigate the active alert.

Watch it fan out subagents, crunch logs in the sandbox, blame the `v2.4.1` deploy —
and stop dead at the rollback, waiting for your **Allow**.

### Hardening knobs

- `MCP_AUTH_TOKEN=<token>` on `incident-mcp` enables bearer auth on `/mcp`
  (the setup script forwards it to the connector's header auth automatically).
- `PORT` changes the MCP port; pass `INCIDENT_MCP_URL` to the setup script to match.
- `GET /healthz` for liveness checks.
- `npm run start:stdio` runs the stdio transport for MCP Inspector debugging.

## Repo layout

```
agent/                  System prompt + git-backed incident-runbook skill
mcp/incident-mcp/       Mock production estate (MCP over Streamable HTTP)
  src/estate.js           Pure state machine (unit-tested)
  src/server.js           Tool definitions + annotations
  src/http.js             Streamable HTTP transport, auth, health
scripts/                One-shot TrueForge provisioning via REST API
demo-data/              Deterministic incident seed data
docs/SCOPE.md           Hackathon scope document
docs/DEMO_SCRIPT.md     The 3-minute demo, beat by beat
.github/workflows/      CI: lint + tests on Node 20/22
```

## Testing

15 tests, run in CI on every PR: unit tests for the estate state machine and
integration tests that speak real JSON-RPC over Streamable HTTP — the handshake,
tool annotations, the full incident arc, error surfacing, auth, and parse errors.

```bash
cd mcp/incident-mcp && npm test
```

## For the judges

BlackBox's premise is that agents are ready to *investigate* production incidents but
must never *act* on them unilaterally. TrueForge is the enabling layer: the MCP
connector gives the agent real reach into infra, the Daytona sandbox gives it real
analytical power over log data, subagents keep a long investigation's context
manageable, and the approval gate is the "license to act" that stays in human hands.
Remove TrueForge and there is no product — just a chatbot describing an outage it
can't see.

## License

MIT
