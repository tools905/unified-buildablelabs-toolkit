"use client";

import { useCallback, useRef, useState } from "react";
import { BASE_PATH } from "@/lib/utils/app-url";
import type { ExportEvent } from "@/lib/utils/downloads";
import type { ContentIdeaStatus } from "@/lib/db/types";

export type ExportParams = { from: string; to: string; columns: ContentIdeaStatus[] };
type Done = Extract<ExportEvent, { type: "done" }>;

export type ExportRun =
  | { status: "idle" }
  | {
      status: "running";
      stage: "gather" | "build" | "saving" | "uploading";
      posts: { title: string; weight: number }[];
      done: number;
      startedAt: number;
    }
  | { status: "done"; result: Done; posts: { title: string; weight: number }[]; startedAt: number; finishedAt: number }
  | { status: "error"; message: string; params: ExportParams };

// Runs a board export and follows its progress line by line (see the export route). When the file is
// ready the download starts by itself.
export function useBoardExport() {
  const [run, setRun] = useState<ExportRun>({ status: "idle" });
  const busy = useRef(false);

  const start = useCallback(async (params: ExportParams) => {
    if (busy.current) return;
    busy.current = true;
    const startedAt = Date.now();
    let posts: { title: string; weight: number }[] = [];
    let finished = false;
    setRun({ status: "running", stage: "gather", posts, done: 0, startedAt });

    const handle = (event: ExportEvent) => {
      if (event.type === "start") {
        posts = event.posts;
        setRun({ status: "running", stage: "build", posts, done: 0, startedAt });
      } else if (event.type === "post") {
        setRun({ status: "running", stage: "build", posts, done: event.index + 1, startedAt });
      } else if (event.type === "saving" || event.type === "uploading") {
        setRun({ status: "running", stage: event.type, posts, done: posts.length, startedAt });
      } else if (event.type === "done") {
        finished = true;
        setRun({ status: "done", result: event, posts, startedAt, finishedAt: Date.now() });
        window.location.assign(event.url);
      } else {
        finished = true;
        setRun({ status: "error", message: event.message, params });
      }
    };

    try {
      const query = new URLSearchParams({ from: params.from, to: params.to, columns: params.columns.join(",") });
      const response = await fetch(`${BASE_PATH}/api/content-board/export?${query}`, { headers: { Accept: "application/x-ndjson" } });
      if (!response.ok || !response.body) throw new Error((await response.text()) || "Couldn't prepare the export. Please try again.");
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        let newline;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (line) handle(JSON.parse(line) as ExportEvent);
        }
      }
      if (!finished) throw new Error("The export stopped part-way. Please try again.");
    } catch (error) {
      setRun({ status: "error", message: error instanceof Error ? error.message : "Couldn't prepare the export. Please try again.", params });
    } finally {
      busy.current = false;
    }
  }, []);

  const reset = useCallback(() => setRun({ status: "idle" }), []);
  return { run, start, reset };
}
