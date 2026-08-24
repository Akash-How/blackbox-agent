---
name: incident-runbook
description: Standard triage procedure for a firing production alert — evidence gathering, root-cause correlation, and approval-gated remediation.
---

# Incident Runbook

Follow this procedure when an alert is firing.

## Phase 1 — Situational awareness (read-only)

1. `list_alerts` — identify firing alerts, severity, and affected service.
2. `get_service_status` on the affected service — version, replica health.

## Phase 2 — Parallel evidence gathering (subagents, read-only)

Dispatch three subagents concurrently:

- **Logs analyst**: `query_logs` (limit 300+), then in the sandbox write a script that
  parses lines by level, counts distinct ERROR signatures, and buckets them over time.
  Report: dominant signature, first occurrence, trend.
- **Metrics reader**: `get_metrics` — look for inflection points in memory, error
  rate, and OOM kills. Report the timestamp where the trend breaks.
- **Deploy historian**: `get_recent_deploys` — list deploys near the alert window.
  Report any deploy shortly before the metric inflection, with its summary.

## Phase 3 — Root cause

State the root cause only when ≥2 independent signals agree (e.g. deploy at 09:31,
memory inflection at ~09:35, error signature referencing the deployed feature).
If signals conflict, gather more evidence instead of guessing.

## Phase 4 — Remediation (approval-gated)

- Prefer `rollback_deploy` to the last known-good version when a specific deploy is
  implicated. A `restart_service` does NOT fix a bad deploy — the failure recurs.
- Present the proposed action with evidence and expected outcome, then call the tool.
  The harness will pause for human approval. Respect a rejection: offer the
  alternative, never re-propose the rejected action unchanged.

## Phase 5 — Verification and closure

1. `get_service_status` — confirm healthy.
2. `resolve_alert` with a one-line resolution.
3. Post an incident summary: timeline, root cause, evidence, action, follow-ups
   (e.g. "add eviction policy to PricingCache; add heap alerting").
