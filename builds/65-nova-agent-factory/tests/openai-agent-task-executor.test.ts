import { describe, expect, it, vi } from "vitest";
import { createOpenAIAgentTaskExecutor, type OpenAIFunctionTool } from "../src/openai-agent-task-executor.js";
import type { AgentCapability, AgentRecord } from "../src/agent-factory.js";

const agent = { id:"a1", tenantId:"t1", lifecycle:"ACTIVE", profile:{ name:"Research", purpose:"Research safely", capabilities:["research.web"] } } as unknown as AgentRecord;
const tool: OpenAIFunctionTool = {
  name:"search_docs", description:"Search approved documents", requiredCapability:"research.web",
  parameters:{type:"object",properties:{query:{type:"string"}},required:["query"],additionalProperties:false},
  execute:vi.fn(async (args) => ({hits:[String(args.query)]}))
};
function response(payload:unknown,status=200){return new Response(JSON.stringify(payload),{status,headers:{"content-type":"application/json"}});}

describe("OpenAI Responses adapter",()=>{
  it("routes every tool operation through the runtime authorization callback",async()=>{
    const fetchImpl=vi.fn()
      .mockResolvedValueOnce(response({id:"resp_1",output:[{type:"function_call",name:"search_docs",call_id:"call_1",arguments:'{"query":"policy"}'}]}))
      .mockResolvedValueOnce(response({id:"resp_2",output:[],output_text:"Found approved policy."}));
    const invokeTool=vi.fn(async <T>(_name:string,_cap:AgentCapability,operation:()=>Promise<T>):Promise<T>=>operation());
    const executor=createOpenAIAgentTaskExecutor({apiKey:"test-key",model:"test-model",tools:[tool],fetchImpl});
    const result=await executor.execute({agent,capability:"research.web",input:{query:"policy"},signal:new AbortController().signal,invokeTool});
    expect(invokeTool).toHaveBeenCalledTimes(1);
    expect(invokeTool).toHaveBeenCalledWith("search_docs","research.web",expect.any(Function));
    expect(result).toMatchObject({provider:"openai",model:"test-model",outputText:"Found approved policy."});
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][1]?.headers).toMatchObject({authorization:"Bearer test-key"});
  });

  it("fails closed if the model asks for a tool outside the configured allowlist",async()=>{
    const fetchImpl=vi.fn().mockResolvedValue(response({output:[{type:"function_call",name:"delete_everything",call_id:"call_1",arguments:"{}"}]}));
    const invokeTool=vi.fn();
    const executor=createOpenAIAgentTaskExecutor({apiKey:"test-key",model:"test-model",tools:[tool],fetchImpl});
    await expect(executor.execute({agent,capability:"research.web",input:{},signal:new AbortController().signal,invokeTool})).rejects.toThrow("OPENAI_TOOL_NOT_ALLOWLISTED");
    expect(invokeTool).not.toHaveBeenCalled();
  });

  it("requires a server-side API key and bounded execution settings",()=>{
    expect(()=>createOpenAIAgentTaskExecutor({apiKey:" ",model:"test-model"})).toThrow("OPENAI_API_KEY_REQUIRED");
    expect(()=>createOpenAIAgentTaskExecutor({apiKey:"test-key",model:"test-model",maxSteps:99})).toThrow("OPENAI_MAX_STEPS_INVALID");
  });
});
