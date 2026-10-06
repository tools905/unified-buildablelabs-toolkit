// How a tool says "no". A tool throws McpToolFailure with one of the contract's error codes; the endpoint
// catches it, writes the audit record and answers the caller with `{ code, message }`. Anything else
// a tool throws is unexpected and is the endpoint's to turn into a plain "something went wrong".

import type { ZodType } from "zod";
import type { McpErrorCode, McpToolError } from "@/lib/mcp/contract";

export class McpToolFailure extends Error {
  readonly code: McpErrorCode;

  constructor(code: McpErrorCode, message: string) {
    super(message);
    this.name = "McpToolFailure";
    this.code = code;
  }

  toJSON(): McpToolError {
    return { code: this.code, message: this.message };
  }
}

export function isMcpToolFailure(error: unknown): error is McpToolFailure {
  return error instanceof McpToolFailure;
}

// Checks a tool's input against its schema from the contract and applies the defaults. A tool calls this
// itself, so it is safe whether or not the endpoint has already checked the input.
export function parseToolInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const first = result.error.issues[0];
  const where = first?.path.length ? `${first.path.join(".")}: ` : "";
  throw new McpToolFailure("invalid_input", `${where}${first?.message ?? "The input is not valid."}`);
}
