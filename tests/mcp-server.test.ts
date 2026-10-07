import { afterEach, describe, expect, it, vi } from "vitest";
import { handleBody, handleMessage, SUPPORTED_PROTOCOL_VERSIONS, type ServerDeps } from "@/lib/mcp/server";
import { McpToolFailure } from "@/lib/mcp/errors";
import type { AuditEntry, AuditStore } from "@/lib/mcp/audit";
import type { McpCaller } from "@/lib/mcp/contract";

const ME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const IDEA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const caller: McpCaller = { userId: ME, workspaceId: WORKSPACE, clientId: "client-1", supabase: {} as never };

function setup(options: { handlers?: ServerDeps["handlers"]; calls?: number; recordFails?: boolean; countFails?: boolean } = {}) {
  const recorded: AuditEntry[] = [];
  const audit: AuditStore = {
    record: async (entry) => {
      if (options.recordFails) throw new Error("audit down");
      recorded.push(entry);
    },
    callsInLastMinute: async () => {
      if (options.countFails) throw new Error("count down");
      return options.calls ?? 0;
    },
  };
  const handlers: ServerDeps["handlers"] = options.handlers ?? {
    create_idea: async () => ({ idea: { id: IDEA, title: "T" } }),
    list_review_points: async () => ({ points: [] }),
  };
  return { deps: { caller, handlers, audit, context: { origin: "https://tools.example.test" } } satisfies ServerDeps, recorded };
}

const rpc = (method: string, params?: Record<string, unknown>, id: number | string = 1) => ({ jsonrpc: "2.0" as const, id, method, params });
const call = (name: string, args: Record<string, unknown> = {}) => rpc("tools/call", { name, arguments: args });

type Answer = { id: unknown; result?: any; error?: { code: number; message: string } };
async function ask(message: unknown, deps: ServerDeps) {
  return (await handleMessage(message, deps)) as Answer;
}

afterEach(() => vi.restoreAllMocks());

describe("initialize and housekeeping", () => {
  it("agrees on a protocol version the app asked for", async () => {
    const { deps } = setup();
    const answer = await ask(rpc("initialize", { protocolVersion: "2025-03-26" }), deps);
    expect(answer.result.protocolVersion).toBe("2025-03-26");
    expect(answer.result.capabilities).toEqual({ tools: { listChanged: false } });
    expect(answer.result.serverInfo.name).toBe("buildablelabs-content-board");
  });

  it("answers with the newest version when the app asks for one it doesn't know", async () => {
    const { deps } = setup();
    expect((await ask(rpc("initialize", { protocolVersion: "1999-01-01" }), deps)).result.protocolVersion).toBe(SUPPORTED_PROTOCOL_VERSIONS[0]);
    expect((await ask(rpc("initialize"), deps)).result.protocolVersion).toBe(SUPPORTED_PROTOCOL_VERSIONS[0]);
  });

  it("only tells the app about uploads when the upload tool is served", async () => {
    const without = await ask(rpc("initialize"), setup().deps);
    expect(without.result.instructions).not.toContain("start_upload");
    const withUpload = await ask(rpc("initialize"), setup({ handlers: { start_upload: async () => ({}) } }).deps);
    expect(withUpload.result.instructions).toContain("start_upload");
  });

  it("answers ping, and stays silent for notifications and for replies from the app", async () => {
    const { deps } = setup();
    expect((await ask(rpc("ping"), deps)).result).toEqual({});
    expect(await handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, deps)).toBeNull();
    expect(await handleMessage({ jsonrpc: "2.0", method: "who/knows" }, deps)).toBeNull();
    expect(await handleMessage({ jsonrpc: "2.0", id: 5, result: {} }, deps)).toBeNull();
  });

  it("refuses unknown methods and messages that are not requests", async () => {
    const { deps } = setup();
    expect((await ask(rpc("resources/list"), deps)).error?.code).toBe(-32601);
    expect((await ask({ hello: "world" }, deps)).error?.code).toBe(-32600);
    expect((await ask("text", deps)).error?.code).toBe(-32600);
  });
});

describe("tools/list", () => {
  it("lists only the tools that have a handler, with titles, descriptions and read-only hints", async () => {
    const { deps } = setup();
    const { result } = await ask(rpc("tools/list"), deps);
    expect(result.tools.map((tool: { name: string }) => tool.name).sort()).toEqual(["create_idea", "list_review_points"]);
    const create = result.tools.find((tool: { name: string }) => tool.name === "create_idea");
    expect(create.title).toBe("Create a new idea on the Content Board");
    expect(create.description).toContain("Ideas column");
    expect(create.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, openWorldHint: false });
    const list = result.tools.find((tool: { name: string }) => tool.name === "list_review_points");
    expect(list.annotations.readOnlyHint).toBe(true);
  });

  it("describes each tool's input as an object schema with the right required fields", async () => {
    const { result } = await ask(rpc("tools/list"), setup().deps);
    const create = result.tools.find((tool: { name: string }) => tool.name === "create_idea");
    expect(create.inputSchema.type).toBe("object");
    expect(create.inputSchema.$schema).toBeUndefined();
    expect([...create.inputSchema.required].sort()).toEqual(["platforms", "title"]);
    expect(create.inputSchema.properties.platforms.items.enum).toContain("linkedin");
    const list = result.tools.find((tool: { name: string }) => tool.name === "list_review_points");
    expect(list.inputSchema.required).toEqual(["idea_id"]);
    expect(list.inputSchema.properties.include_done.description).toContain("ticked off");
  });
});

describe("tools/call", () => {
  it("runs the tool as the caller and answers with its result as text", async () => {
    const handler = vi.fn(async () => ({ idea: { id: IDEA, title: "Five gaps" } }));
    const { deps, recorded } = setup({ handlers: { create_idea: handler } });
    const answer = await ask(call("create_idea", { title: "Five gaps", platforms: ["linkedin"] }), deps);

    expect(handler).toHaveBeenCalledWith(caller, { title: "Five gaps", platforms: ["linkedin"] }, { origin: "https://tools.example.test" });
    expect(answer.result.isError).toBe(false);
    expect(JSON.parse(answer.result.content[0].text)).toEqual({ idea: { id: IDEA, title: "Five gaps" } });
    expect(recorded).toEqual([
      { workspace_id: WORKSPACE, user_id: ME, client_id: "client-1", tool_name: "create_idea", idea_id: IDEA, outcome: "ok", error_code: null },
    ]);
  });

  it("records the idea a call was about when the input names it", async () => {
    const { deps, recorded } = setup();
    await ask(call("list_review_points", { idea_id: IDEA }), deps);
    expect(recorded[0]).toMatchObject({ tool_name: "list_review_points", idea_id: IDEA, outcome: "ok" });
  });

  it("answers a tool's refusal as an error with its code and message, and records the code", async () => {
    const { deps, recorded } = setup({
      handlers: { list_review_points: async () => { throw new McpToolFailure("not_found", "There is no idea with that id in this workspace."); } },
    });
    const answer = await ask(call("list_review_points", { idea_id: IDEA }), deps);
    expect(answer.result.isError).toBe(true);
    expect(JSON.parse(answer.result.content[0].text)).toEqual({ code: "not_found", message: "There is no idea with that id in this workspace." });
    expect(recorded[0]).toMatchObject({ outcome: "error", error_code: "not_found" });
  });

  it("hides the details of an unexpected failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { deps, recorded } = setup({ handlers: { create_idea: async () => { throw new Error("password=hunter2 leaked in a stack"); } } });
    const answer = await ask(call("create_idea", {}), deps);
    expect(answer.result.isError).toBe(true);
    expect(answer.result.content[0].text).not.toContain("hunter2");
    expect(answer.result.content[0].text).toContain("Something went wrong");
    expect(recorded[0]).toMatchObject({ outcome: "error", error_code: null });
  });

  it("refuses a tool that doesn't exist or isn't served yet, and one named like an object property", async () => {
    const { deps, recorded } = setup();
    expect((await ask(call("delete_everything"), deps)).error?.code).toBe(-32602);
    expect((await ask(call("start_upload"), deps)).error?.code).toBe(-32602); // in the contract, no handler yet
    expect((await ask(call("constructor"), deps)).error?.code).toBe(-32602);
    expect((await ask(call("toString"), deps)).error?.code).toBe(-32602);
    expect(recorded).toHaveLength(0);
  });

  it("refuses a call without a name", async () => {
    const { deps } = setup();
    expect((await ask(rpc("tools/call", { arguments: {} }), deps)).error?.code).toBe(-32602);
    expect((await ask(rpc("tools/call"), deps)).error?.code).toBe(-32602);
  });

  it("stops a person at 60 calls a minute without running the tool", async () => {
    const handler = vi.fn(async () => ({}));
    const { deps, recorded } = setup({ handlers: { create_idea: handler }, calls: 60 });
    const answer = await ask(call("create_idea", {}), deps);
    expect(handler).not.toHaveBeenCalled();
    expect(answer.result.isError).toBe(true);
    expect(JSON.parse(answer.result.content[0].text).code).toBe("rate_limited");
    expect(recorded[0]).toMatchObject({ outcome: "error", error_code: "rate_limited" });
  });

  it("lets the 60th call of a minute through", async () => {
    const handler = vi.fn(async () => ({ fine: true }));
    const { deps } = setup({ handlers: { create_idea: handler }, calls: 59 });
    expect((await ask(call("create_idea", {}), deps)).result.isError).toBe(false);
  });

  it("still does the work when the record or the count can't be saved", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = vi.fn(async () => ({ fine: true }));
    const { deps } = setup({ handlers: { create_idea: handler }, recordFails: true, countFails: true });
    const answer = await ask(call("create_idea", {}), deps);
    expect(handler).toHaveBeenCalled();
    expect(answer.result.isError).toBe(false);
  });

  it("refuses an answer too long to send", async () => {
    const { deps, recorded } = setup({ handlers: { create_idea: async () => ({ text: "x".repeat(120_000) }) } });
    const answer = await ask(call("create_idea", {}), deps);
    expect(answer.result.isError).toBe(true);
    expect(JSON.parse(answer.result.content[0].text).code).toBe("limit_reached");
    expect(recorded[0]).toMatchObject({ outcome: "error", error_code: "limit_reached" });
  });
});

describe("handleBody", () => {
  it("answers a list of messages with a list, leaving out notifications", async () => {
    const { deps } = setup();
    const answers = (await handleBody([rpc("ping", undefined, 1), { jsonrpc: "2.0", method: "notifications/initialized" }, rpc("ping", undefined, 2)], deps)) as Answer[];
    expect(answers.map((answer) => answer.id)).toEqual([1, 2]);
  });

  it("owes nothing for a list of only notifications, and refuses an empty list", async () => {
    const { deps } = setup();
    expect(await handleBody([{ jsonrpc: "2.0", method: "notifications/initialized" }], deps)).toBeNull();
    expect(((await handleBody([], deps)) as Answer).error?.code).toBe(-32600);
  });
});

describe("tools that show pictures", () => {
  it("sends the answer as text and each picture as an image, and leaves the pictures out of the text", async () => {
    const { withImages } = await import("@/lib/mcp/tool-result");
    const handler = async () => withImages({ page_count: 2 }, [{ mimeType: "image/jpeg", data: "AAAA" }, { mimeType: "image/jpeg", data: "BBBB" }]);
    const { deps, recorded } = setup({ handlers: { get_pdf_pages: handler } });
    const answer = await ask(call("get_pdf_pages", { attachment_id: IDEA }), deps);
    expect(answer.result.isError).toBe(false);
    expect(answer.result.content).toEqual([
      { type: "text", text: JSON.stringify({ page_count: 2 }, null, 2) },
      { type: "image", data: "AAAA", mimeType: "image/jpeg" },
      { type: "image", data: "BBBB", mimeType: "image/jpeg" },
    ]);
    expect(answer.result.content[0].text).not.toContain("AAAA");
    expect(recorded[0]).toMatchObject({ tool_name: "get_pdf_pages", outcome: "ok" });
  });
});
