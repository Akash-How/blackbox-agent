# Demo Script (target: 3:00)

Judges must witness, explicitly: the agent reaching real tools, code executing in
the sandbox, and "the moment it stops and asks" for approval. Film against
**Mission Control** (http://localhost:5199) — the Best UI track judges the demo
video and the running project.

## Pre-flight (before recording)

- Restart `incident-mcp` so ALERT-4821 is firing fresh.
- TrueForge running; agent provisioned with your model key (`scripts/setup-trueforge.mjs`).
- Sandbox working (Daytona key recommended) — the sandbox beat is a hard judging
  requirement.
- Clean browser profile, no bookmarks/extensions, no keys anywhere on screen.
- Mission Control open; incident briefing visible ("checkout-service is failing.
  Where do we start?").

| Time | Beat | On screen |
|---|---|---|
| 0:00–0:15 | Hook | Mission Control in incident state: white-hot incident card, ticking timer, error sparkline, ribbon sweeping. "This is BlackBox. It can investigate production — it cannot act without a human." |
| 0:15–0:30 | The briefing | Click the suggestion chip **"We just got paged. Investigate the active alert."** → send. Point out the suspect flag already sitting on deploy v2.4.1 in the sidebar. |
| 0:30–1:10 | Real tools | Agent steps stream: runbook skill loads, MCP tool calls fan out (alerts, status, metrics, deploys, logs). Narrate: "every one of these is a real MCP call into the estate." |
| 1:10–1:40 | **Sandbox** | The log-analysis step: agent writes and runs code in the TrueForge sandbox to count error signatures. Zoom the output (dominant signature + rate). |
| 1:40–2:00 | Root cause | The consolidated report: deploy 09:31 → memory ramp → OOM kills → 34% errors. Root cause: unbounded cache in v2.4.1. |
| 2:00–2:35 | **THE GATE** | Agent proposes rollback; harness freezes `rollback_deploy` behind **Allow / Deny**. Hold the shot — say "this is the license to act, and it's mine." Click **Allow**. |
| 2:35–2:50 | Resolution | The entire console drains from white-hot to quiet gray: ribbon stills, timer vanishes, services read Operational, alert resolves. This visual is the payoff — let it breathe. |
| 2:50–3:00 | Close | "MCP tools, sandbox, subagents, approval gates, session persistence — all TrueForge. Repo is public and runs with one free API key." |

## Recording rules

- Judges must SEE: real tools ✓ sandbox code ✓ the approval pause ✓ — all three or
  the demo fails its brief.
- If over time: cut narration, never the gate or the sandbox beat.
- Session persistence (optional beat, verbal): "we killed the server mid-investigation
  earlier — the session survived."

## Optional extra beat (if under time)

Have the agent propose `restart_service` first and **Deny** it — the agent explains a
restart won't fix a bad deploy and pivots to rollback. Proves the gate is a decision,
not theater.
