# BlackBox — Scope Document

**Hackathon:** The Agent Harness Hackathon (WeMakeDevs × TrueFoundry), Aug 24–30, 2026
**Submission deadline:** Aug 30, 2026, 8:00 PM London time
**Primary track:** Double-O Track (Best Use of TrueForge) · Secondary: Q Branch (Code Quality via Qodo), Savile Row (Best UI)

---

## 1. One-liner

**BlackBox is an incident-response agent with a license to investigate — but not to act.**
It receives a production alert, dispatches subagents to gather evidence over MCP tools,
crunches logs in the TrueForge sandbox, names a root cause, and then **stops cold for a
human approval gate** before executing anything irreversible (rollback / restart).

## 2. Why this project

The judging criteria weight six factors equally. BlackBox is designed so each one is a
first-class feature, not an afterthought:

| Criterion | How BlackBox scores it |
|---|---|
| Potential impact | Incident triage is a real, expensive, on-call job worth handing to an agent |
| Creativity | Ships its own mock production environment as an MCP server — the demo is a self-contained "flight recorder" world |
| Technical excellence | Deterministic mock infra = reliable, repeatable demo; no flaky live APIs |
| Sponsor tools | Uses every core TrueForge capability (see §4); Qodo installed day one |
| Control & safety | Read-only tools are free; the two destructive tools are hard-gated behind human approval |
| Presentation | The incident arc (alert → investigation → verdict → approval → resolution) is a natural 3-minute story |

**Disqualifier check:** no pre-existing code (everything written this week), public repo,
and the project is meaningless without TrueForge — the approval gate, sandbox analysis,
and subagent fan-out *are* the product.

## 3. What the agent does (the demo arc)

1. **Alert lands.** A P1 alert fires in the mock infra: `checkout-service` error rate at 34%.
2. **Fan-out.** BlackBox delegates three parallel subagents:
   - *Logs analyst* — pulls logs via `query_logs`, ships them into the sandbox, runs a
     Python frequency analysis to find the dominant error signature.
   - *Deploy historian* — pulls `get_recent_deploys`, correlates alert onset with the
     `v2.4.1` deploy 11 minutes earlier.
   - *Metrics reader* — pulls `get_metrics`, confirms memory climb → OOM kills.
3. **Synthesis.** Main agent consolidates: root cause = memory leak introduced in v2.4.1.
4. **The gate.** Agent proposes `rollback_deploy(checkout-service, v2.4.0)` — TrueForge
   pauses and asks the human. **This is the money shot of the demo.**
5. **Resolution.** On approval, rollback executes, alert clears, agent posts a written
   incident summary. (Demo also shows a *rejected* restart earlier, proving the gate is real.)
6. **Persistence beat.** Mid-investigation, we kill and restart the TrueForge server;
   the session resumes intact.

## 4. TrueForge feature coverage (Double-O checklist)

- [x] **Real tools via MCP** — custom `incident-mcp` server (7 tools, stdio transport)
- [x] **Generated code in sandbox** — log-analysis Python written and executed by the agent
- [x] **Human approval gates** — `rollback_deploy` and `restart_service` always pause
- [x] **Subagents** — three-way parallel investigation fan-out
- [x] **Session persistence** — server restart mid-incident, session survives
- [x] **Skills** — `incident-runbook` skill pack encodes the triage procedure

## 5. Deliverables

1. **Public GitHub repo** with a README a stranger can run in <5 minutes
   (`npm install`, `npm run mcp`, `npx @truefoundry/trueforge`, attach connector, go).
2. **`incident-mcp`** — Node.js MCP server (Streamable HTTP, the transport TrueForge
   connectors require; optional bearer auth) simulating a small production estate:
   read-only tools (`list_alerts`, `get_service_status`, `query_logs`,
   `get_recent_deploys`, `get_metrics`) + destructive tools (`rollback_deploy`,
   `restart_service`, both carrying MCP `destructiveHint` annotations that trigger
   TrueForge's default approval policy) + `resolve_alert`.
   Plus `scripts/setup-trueforge.mjs`, which provisions provider/connector/skill/agent
   against the TrueForge REST API in one idempotent shot. Sandbox provider is Daytona
   (the only one TrueForge supports today; free API key).
3. **Agent config** — system prompt + `incident-runbook` skill.
4. **Demo video (~3 min)** following `docs/DEMO_SCRIPT.md`.
5. **Written description** (repo README §"For the judges").
6. **Qodo PR trail** — every feature lands via PR from the first commit.

## 6. Out of scope (ruthlessly)

- Real cloud integrations (AWS/K8s/PagerDuty) — the mock estate is the point
- Multi-incident queueing, paging/escalation policies
- Custom chat UI beyond TrueForge's bundled one (revisit only if time allows for Savile Row)
- Auth/multi-user hosted mode — local mode only

## 7. Milestones (7 days)

| Day | Date | Goal |
|---|---|---|
| 1 | Mon Aug 24 | Repo public, Qodo installed, scaffolding merged via first PR |
| 2 | Tue Aug 25 | `incident-mcp` complete with deterministic demo data; unit-testable state machine |
| 3 | Wed Aug 26 | TrueForge running locally, connector attached, read-only investigation working |
| 4 | Thu Aug 27 | Approval gates wired + verified; subagent fan-out prompt tuned |
| 5 | Fri Aug 28 | Sandbox log-analysis flow; session-persistence test; skill pack polished |
| 6 | Sat Aug 29 | Full dry runs; README hardened on a clean machine; blog post draft |
| 7 | Sun Aug 30 | Demo video recorded + edited; **submit well before 8 PM London** |

## 8. Risks

| Risk | Mitigation |
|---|---|
| TrueForge API/config differs from docs | Day-3 spike is dedicated integration day; Discord + GitHub issues for support |
| Approval gate config not obvious | It's the core judged feature — if config-level gating is weak, enforce in-tool via a confirmation token pattern as fallback |
| Demo overruns 3 minutes | Script it; pre-warm the session; cut the rejected-restart beat first if needed |
| Secrets leak in repo/video | `.env.example` only; `.gitignore` from day one; screen-record with clean profile |
