import { test } from "node:test";
import assert from "node:assert/strict";
import { Estate } from "../src/estate.js";

test("seed data loads with one firing P1 alert on checkout-service", () => {
  const estate = new Estate();
  const firing = estate.listAlerts().filter((a) => a.status === "firing");
  assert.equal(firing.length, 1);
  assert.equal(firing[0].severity, "P1");
  assert.equal(firing[0].service, "checkout-service");
});

test("degraded service logs contain the cache OOM signature", () => {
  const estate = new Estate();
  const logs = estate.queryLogs("checkout-service", { limit: 300 });
  assert.match(logs, /PricingCache.*no eviction policy/);
  assert.match(logs, /OOMKilled/);
});

test("healthy service logs contain no errors", () => {
  const estate = new Estate();
  const logs = estate.queryLogs("payments-service", { limit: 300 });
  assert.doesNotMatch(logs, /ERROR/);
});

test("logs are deterministic across instances", () => {
  const a = new Estate().queryLogs("checkout-service", { limit: 100 });
  const b = new Estate().queryLogs("checkout-service", { limit: 100 });
  assert.equal(a, b);
});

test("restart alone does not fix a bad deploy", () => {
  const estate = new Estate();
  const result = estate.restartService("checkout-service");
  assert.equal(result.status, "degraded");
  assert.match(result.note, /still running the same version/);
});

test("rollback fixes the service and resolves the alert", () => {
  const estate = new Estate();
  const result = estate.rollbackDeploy("checkout-service", "v2.4.0");
  assert.equal(result.nowRunning, "v2.4.0");
  assert.equal(result.status, "healthy");
  assert.equal(estate.listAlerts().filter((a) => a.status === "firing").length, 0);
});

test("rollback to an unknown version is rejected", () => {
  const estate = new Estate();
  assert.throws(() => estate.rollbackDeploy("checkout-service", "v0.0.1"), /No deploy/);
});

test("rollback does not mutate the seed for other instances", () => {
  const a = new Estate();
  a.rollbackDeploy("checkout-service", "v2.4.0");
  const b = new Estate();
  assert.equal(b.getServiceStatus("checkout-service").version, "v2.4.1");
});
