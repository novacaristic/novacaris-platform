#!/usr/bin/env node
import { randomUUID } from "node:crypto";

const baseUrl = (process.env.NOVA_BASE_URL || "").replace(/\/+$/, "");
const startedAt = new Date().toISOString();
const runId = randomUUID();
const checks = [];
async function check(name, path, expectedStatus, options = {}) {
  const began = Date.now();
  try {
    const response = await fetch(baseUrl + path, { method: options.method || "GET", headers: options.headers || {}, body: options.body });
    const text = await response.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = undefined; }
    const passed = response.status === expectedStatus && (!options.jsonField || parsed?.[options.jsonField] === options.jsonValue);
    checks.push({ name, passed, status: response.status, expectedStatus, durationMs: Date.now() - began, detail: passed ? "Expected response received." : "Response did not match the expected status or shape." });
  } catch {
    checks.push({ name, passed: false, expectedStatus, durationMs: Date.now() - began, detail: "Request failed; network and response details withheld." });
  }
}
if (!baseUrl) {
  checks.push({ name: "base_url_configured", passed: false, detail: "Set NOVA_BASE_URL to the deployed service origin." });
} else {
  try {
    const origin = new URL(baseUrl);
    if (!["http:", "https:"].includes(origin.protocol) || origin.origin !== baseUrl) throw new Error("invalid origin");
    await check("liveness", "/healthz", 200, { jsonField: "status", jsonValue: "healthy" });
    await check("database_readiness", "/readyz", 200, { jsonField: "status", jsonValue: "ready" });
    await check("dashboard_served", "/", 200);
    await check("unauthenticated_api_denied", "/api/recovery/escalations", 401);
    await check("unknown_route_rejected", "/not-a-route", 404);
  } catch {
    checks.push({ name: "base_url_valid", passed: false, detail: "NOVA_BASE_URL must be a valid exact HTTP(S) origin." });
  }
}
const report = {
  schemaVersion: "1.0",
  reportType: "nova-deployment-smoke",
  runId,
  startedAt,
  completedAt: new Date().toISOString(),
  baseUrlConfigured: Boolean(baseUrl),
  result: checks.length > 0 && checks.every(check => check.passed) ? "passed" : "failed",
  passedChecks: checks.filter(check => check.passed).length,
  totalChecks: checks.length,
  checks,
  limitations: ["This report records HTTP smoke checks only; it is not proof of clinical safety, regulatory compliance, or live EHR correctness.", "No credentials or response bodies are included in the report."]
};
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
if (report.result !== "passed") process.exitCode = 1;
