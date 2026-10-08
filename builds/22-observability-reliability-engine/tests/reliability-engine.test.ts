import { describe, expect, it } from "vitest";
import { evaluateHealth } from "../src/reliability-engine";

describe("Build 22 reliability engine", () => {
  it("opens a critical incident when a component is unavailable", async () => {
    let incidentOpened = false;
    let alertEmitted = false;

    const result = await evaluateHealth(
      {
        recordHealth: async () => {},
        openIncident: async () => {
          incidentOpened = true;
          return "incident-1";
        },
        emitAlert: async () => {
          alertEmitted = true;
        },
      },
      {
        componentId: "command-runtime",
        status: "unavailable",
      },
    );

    expect(result.status).toBe("unavailable");
    expect(result.incidentId).toBe("incident-1");
    expect(incidentOpened).toBe(true);
    expect(alertEmitted).toBe(true);
  });

  it("alerts on degraded health without falsely declaring an outage", async () => {
    let severity = "";

    const result = await evaluateHealth(
      {
        recordHealth: async () => {},
        openIncident: async () => "not-used",
        emitAlert: async (_component, level) => {
          severity = level;
        },
      },
      {
        componentId: "ehr-adapter",
        status: "degraded",
        latencyMs: 4200,
      },
    );

    expect(result.status).toBe("degraded");
    expect(severity).toBe("high");
  });
});
