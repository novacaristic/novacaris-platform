import { describe, it, expect } from "vitest";
import { BedrockProvider, DocumentationAgent, providerFromEnv, ReferenceProvider } from "../src/agent";

const fakeClient = (reply: unknown, seen: any[] = []) => ({
  async send(cmd: any) { seen.push(cmd); return { body: new TextEncoder().encode(JSON.stringify(reply)) }; } });

describe("NovaClerk AWS Bedrock provider", () => {
  it("refuses to start without the BAA confirmation, a model or a valid region", () => {
    expect(() => new BedrockProvider({ modelId: "m", region: "us-west-2", baaConfirmed: false })).toThrow("AI_PROVIDER_BLOCKED_NO_BAA");
    expect(() => new BedrockProvider({ modelId: "", region: "us-west-2", baaConfirmed: true })).toThrow("AI_PROVIDER_MISCONFIGURED");
    expect(() => new BedrockProvider({ modelId: "m", region: "oregon", baaConfirmed: true })).toThrow("AI_PROVIDER_MISCONFIGURED");
  });
  it("sends the staff notes with the safety prompt and returns a guarded draft", async () => {
    const seen: any[] = [];
    const client = fakeClient({ content: [{ type: "text", text: '{"narrative":"Coached resident on making a grocery list.","resident_response":"Resident completed the list with two prompts.","plan_next_steps":"Will go shopping on Saturday."}' }] }, seen);
    const agent = new DocumentationAgent(new BedrockProvider({ modelId: "test-claude", region: "us-west-2", baaConfirmed: true, client }));
    const r = await agent.run({ source: "Coached resident on making a grocery list. Resident completed the list with two prompts. Will go shopping on Saturday.", noteType: "progress" });
    expect(r.provider).toBe("aws-bedrock"); expect(r.model).toBe("test-claude");
    expect(r.guard.status).not.toBe("blocked");
    const sent = JSON.parse(new TextDecoder().decode(seen[0].input.body));
    expect(seen[0].input.modelId).toBe("test-claude");
    expect(sent.anthropic_version).toBe("bedrock-2023-05-31");
    expect(sent.temperature).toBe(0);
    expect(sent.system).toMatch(/Use ONLY facts in the staff notes/);
    expect(sent.messages[0].content).toContain("grocery list");
  });
  it("the fabrication guard still blocks what a Bedrock model invents", async () => {
    const client = fakeClient({ content: [{ type: "text", text: '{"narrative":"Coached resident on a grocery list. Vitals were 132/84."}' }] });
    const r = await new DocumentationAgent(new BedrockProvider({ modelId: "m", region: "us-west-2", baaConfirmed: true, client }))
      .run({ source: "Coached resident on making a grocery list for the week.", noteType: "progress" });
    expect(r.guard.status).toBe("blocked");
    expect(r.guard.flags.map(f => f.code)).toContain("INVENTED_NUMBER");
  });
  it("rejects extra fields from the model and maps AWS errors without leaking details", async () => {
    const extra = fakeClient({ content: [{ type: "text", text: '{"narrative":"Provided coaching.","diagnosis":"F33.1"}' }] });
    await expect(new BedrockProvider({ modelId: "m", region: "us-west-2", baaConfirmed: true, client: extra }).draft({ source: "Provided coaching today.", noteType: "progress" }))
      .rejects.toThrow("AI_OUTPUT_UNEXPECTED_FIELD:diagnosis");
    const failing = { async send() { const e = new Error("User arn:aws:iam::123:role/x is not authorized"); e.name = "AccessDeniedException"; throw e; } };
    await expect(new BedrockProvider({ modelId: "m", region: "us-west-2", baaConfirmed: true, client: failing }).draft({ source: "Provided coaching today.", noteType: "progress" }))
      .rejects.toThrow(/^AI_PROVIDER_ERROR_AccessDeniedException$/);
  });
  it("is selected from the environment, and an unknown provider name fails closed", () => {
    expect(providerFromEnv({ NOVA_AI_PROVIDER: "bedrock", NOVA_AI_MODEL: "m", AWS_REGION: "us-west-2", NOVA_AI_BAA_CONFIRMED: "true" }).name).toBe("aws-bedrock");
    expect(() => providerFromEnv({ NOVA_AI_PROVIDER: "bedrock", NOVA_AI_MODEL: "m", AWS_REGION: "us-west-2" })).toThrow("AI_PROVIDER_BLOCKED_NO_BAA");
    expect(() => providerFromEnv({ NOVA_AI_PROVIDER: "bedrok" })).toThrow("AI_PROVIDER_UNKNOWN");
    expect(providerFromEnv({})).toBeInstanceOf(ReferenceProvider);
  });
});
