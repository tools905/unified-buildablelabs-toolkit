// The protocol side of the connector: takes what an app sends (JSON-RPC messages as MCP defines them) and
// answers it. It is a plain function of the message and the caller, so it can be tested without a server.
// It runs one request at a time and keeps nothing between requests (no session), which is all the tools need.

import { z } from "zod";
import {
  MCP_LIMITS,
  MCP_TOOLS,
  MCP_TOOL_NAMES,
  type McpCaller,
  type McpErrorCode,
  type McpToolName,
} from "@/lib/mcp/contract";
import type { AuditStore } from "@/lib/mcp/audit";
import { isMcpToolFailure } from "@/lib/mcp/errors";
import { isWithImages, type McpImage } from "@/lib/mcp/tool-result";
import { MCP_TOOL_TEXT } from "@/lib/mcp/tool-descriptions";
import type { McpToolHandler, ToolContext } from "@/lib/mcp/tools";

// Newest first. An app that asks for one of these gets it; any other request is answered with the newest.
export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;
export const MCP_SERVER_VERSION = "1.0.0";

export type JsonRpcId = string | number | null;
export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId; result: unknown }
  | { jsonrpc: "2.0"; id: JsonRpcId; error: { code: number; message: string } };

export type ServerDeps = {
  caller: McpCaller;
  handlers: Partial<Record<McpToolName, McpToolHandler>>;
  audit: AuditStore;
  context: ToolContext;
};

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

const requestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
});

const callParamsSchema = z.object({
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()).optional(),
});

const ok = (id: JsonRpcId, result: unknown): JsonRpcResponse => ({ jsonrpc: "2.0", id, result });
const fail = (id: JsonRpcId, code: number, message: string): JsonRpcResponse => ({
  jsonrpc: "2.0",
  id,
  error: { code, message },
});

export const parseErrorResponse = () => fail(null, PARSE_ERROR, "The request is not valid JSON.");

function toInputSchema(name: McpToolName) {
  const schema = z.toJSONSchema(MCP_TOOLS[name].input, { io: "input" }) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}

function instructions(handlers: ServerDeps["handlers"]) {
  const lines = [
    "Tools for the team's Content Board: create ideas, look at ideas and their PDFs, and add or tick off review points.",
    "Act only on what the person asked for. Everything you write shows under their name.",
  ];
  if (handlers.start_upload) {
    lines.push(
      "You cannot send a file yourself. To add a PDF or an image, get a one-time link with start_upload and ask the person to open it and drop the file there.",
    );
  }
  return lines.join(" ");
}

function listTools(handlers: ServerDeps["handlers"]) {
  return MCP_TOOL_NAMES.filter((name) => handlers[name]).map((name) => {
    const { title, description } = MCP_TOOL_TEXT[name];
    return {
      name,
      title,
      description,
      inputSchema: toInputSchema(name),
      annotations: { title, readOnlyHint: MCP_TOOLS[name].readOnly, destructiveHint: false, openWorldHint: false },
    };
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The idea a call was about, for the audit record: the one it was asked about, or the one it created.
function ideaIdOf(args: Record<string, unknown>, output: unknown): string | null {
  if (typeof args.idea_id === "string" && UUID.test(args.idea_id)) return args.idea_id;
  const answer = isWithImages(output) ? output.value : output;
  const created = (answer as { idea?: { id?: unknown } } | null | undefined)?.idea?.id;
  return typeof created === "string" && UUID.test(created) ? created : null;
}

type ToolContent = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };

function toolResult(payload: unknown, isError: boolean, images: McpImage[] = []) {
  const content: ToolContent[] = [{ type: "text", text: JSON.stringify(payload, null, 2) }];
  for (const image of images) content.push({ type: "image", data: image.data, mimeType: image.mimeType });
  return { content, isError };
}

async function callTool(id: JsonRpcId, rawParams: unknown, deps: ServerDeps): Promise<JsonRpcResponse> {
  const parsed = callParamsSchema.safeParse(rawParams);
  if (!parsed.success) return fail(id, INVALID_PARAMS, "A tool call needs a name and its arguments.");

  const name = parsed.data.name as McpToolName;
  const handler = Object.prototype.hasOwnProperty.call(MCP_TOOLS, name) ? deps.handlers[name] : undefined;
  if (!handler) return fail(id, INVALID_PARAMS, `There is no tool called "${parsed.data.name}".`);

  const args = parsed.data.arguments ?? {};
  const { caller, audit } = deps;
  let output: unknown = null;
  let errorCode: McpErrorCode | null = null;
  let result: ReturnType<typeof toolResult>;

  let calls = 0;
  try {
    calls = await audit.callsInLastMinute(caller.userId);
  } catch (error) {
    console.error("MCP: could not count recent calls:", error);
  }

  if (calls >= MCP_LIMITS.callsPerMinute) {
    errorCode = "rate_limited";
    result = toolResult({ code: errorCode, message: "Too many requests. Wait a minute and try again." }, true);
  } else {
    try {
      output = await handler(caller, args, deps.context);
      const answer = isWithImages(output) ? output.value : output;
      const text = JSON.stringify(answer, null, 2);
      if (text.length > MCP_LIMITS.maxResultChars) {
        errorCode = "limit_reached";
        result = toolResult({ code: errorCode, message: "The answer is too long to send. Ask for less at a time." }, true);
      } else {
        result = toolResult(answer, false, isWithImages(output) ? output.images : []);
      }
    } catch (error) {
      if (isMcpToolFailure(error)) {
        errorCode = error.code;
        result = toolResult(error.toJSON(), true);
      } else {
        console.error(`MCP: the tool ${name} failed unexpectedly:`, error);
        result = toolResult({ message: "Something went wrong on the server. Try again in a moment." }, true);
      }
    }
  }

  try {
    await audit.record({
      workspace_id: caller.workspaceId,
      user_id: caller.userId,
      client_id: caller.clientId,
      tool_name: name,
      idea_id: ideaIdOf(args, output),
      outcome: result.isError ? "error" : "ok",
      error_code: errorCode,
    });
  } catch (error) {
    console.error("MCP: could not write the audit record:", error);
  }

  return ok(id, result);
}

// One message in, at most one answer out. A notification (a message with no id) gets no answer.
export async function handleMessage(message: unknown, deps: ServerDeps): Promise<JsonRpcResponse | null> {
  const parsed = requestSchema.safeParse(message);
  if (!parsed.success) {
    // Something that isn't a request, such as an app's reply to us, is ignored; a broken request is refused.
    const looksLikeReply = typeof message === "object" && message !== null && ("result" in message || "error" in message);
    return looksLikeReply ? null : fail(null, INVALID_REQUEST, "That is not a valid request.");
  }

  const { id, method, params } = parsed.data;
  if (id === undefined) return null;

  switch (method) {
    case "initialize": {
      const asked = typeof params?.protocolVersion === "string" ? params.protocolVersion : "";
      const version = (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(asked) ? asked : SUPPORTED_PROTOCOL_VERSIONS[0];
      return ok(id, {
        protocolVersion: version,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "buildablelabs-content-board", title: "BuildableLabs Content Board", version: MCP_SERVER_VERSION },
        instructions: instructions(deps.handlers),
      });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: listTools(deps.handlers) });
    case "tools/call":
      return callTool(id, params, deps);
    default:
      return fail(id, METHOD_NOT_FOUND, `This server does not support "${method}".`);
  }
}

// A request body is one message or a list of them. Returns what to send back, or null when nothing is owed.
export async function handleBody(body: unknown, deps: ServerDeps): Promise<JsonRpcResponse | JsonRpcResponse[] | null> {
  if (Array.isArray(body)) {
    if (body.length === 0) return fail(null, INVALID_REQUEST, "An empty list is not a valid request.");
    const answers = (await Promise.all(body.map((message) => handleMessage(message, deps)))).filter(
      (answer): answer is JsonRpcResponse => answer !== null,
    );
    return answers.length ? answers : null;
  }
  return handleMessage(body, deps);
}
