# Demo Script (target: 3:00)

Judges must see: real tools via MCP, code executing in the sandbox, and the approval
gate moment. Persistence and subagents are bonus beats.

| Time | Beat | On screen |
|---|---|---|
| 0:00–0:20 | Hook | "This is BlackBox. It has a license to investigate production — but not to act." Show the firing P1 alert in chat: *"We just got paged. Investigate."* |
| 0:20–0:50 | Subagent fan-out | TrueForge UI showing three subagents running in parallel (logs / metrics / deploys). Narrate what each is fetching over MCP. |
| 0:50–1:20 | **Sandbox** | Logs analyst writes a Python script in the sandbox, runs it, prints error-signature counts. Zoom on the output: `PricingCache allocation failed — 61%` |
| 1:20–1:45 | Root cause | Agent's synthesis: v2.4.1 deploy at 09:31 → memory inflection 09:35 → OOM kills. Root cause: unbounded cache. |
| 1:45–2:20 | **THE GATE** | Agent proposes `rollback_deploy(checkout-service, v2.4.0)`. TrueForge pauses. Hold the shot. Click **Approve**. Rollback executes, alert auto-resolves. |
| 2:20–2:40 | Persistence beat | (Pre-recorded or live) kill the TrueForge process mid-investigation earlier, restart, session resumes. One sentence. |
| 2:40–3:00 | Close | Incident summary message; "Everything you saw — tools, sandbox, subagents, the approval gate — is the TrueForge harness. Repo is public, runs with zero cloud accounts." |

## Recording rules

- Clean browser profile, no bookmarks/extensions visible, no API keys on screen.
- Pre-warm: model configured, connector attached, chat open. Start recording at the prompt.
- If over time, cut the persistence beat first (mention it verbally instead).

## Optional extra beat (if under time)

Before the rollback, have the agent propose `restart_service` first and **reject** it —
agent explains a restart won't fix a bad deploy and pivots to rollback. Proves the gate
is a real decision point, not theater.
