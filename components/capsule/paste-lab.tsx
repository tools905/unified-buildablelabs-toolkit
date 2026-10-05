"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { copyAtom, copyAndOpen, editorUrl, openEditor, type CopyAndOpenResult, type OpenStrategy } from "@/components/capsule/decapsulate";
import type { CapsulePlatform } from "@/lib/capsule/types";

// A small article that uses the things that matter: headings, emphasis, a link, a list, a quote,
// code and a table. After pasting it into Medium or Substack, look at what survived.
const SAMPLE_HTML = `<h2>Capsule paste test</h2>
<p>This is a <strong>bold</strong> word, an <em>italic</em> word and a <a href="https://www.buildablelabs.com">link</a>.</p>
<h3>A list</h3>
<ul><li>First point</li><li>Second point</li></ul>
<blockquote>A short quote to see how it is kept.</blockquote>
<pre><code>const answer = 42;</code></pre>
<table><tbody><tr><th>Name</th><th>Score</th></tr><tr><td>Ada</td><td>10</td></tr></tbody></table>
<p>The end.</p>`;

const STRATEGIES: { value: OpenStrategy; label: string; note: string }[] = [
  { value: "copy-then-open", label: "Copy, then open", note: "Copy first, open the tab after (the plan's first idea)." },
  { value: "open-then-copy", label: "Open, then copy", note: "Open a blank tab at once, copy, then send the tab to the editor." },
  { value: "together", label: "Both at once", note: "Start the copy and open the tab in the same instant." },
];

type LogEntry = { id: number; at: string; text: string; good: boolean };

export function PasteLab() {
  const [publication, setPublication] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [pasted, setPasted] = useState<string | null>(null);
  const [env, setEnv] = useState<string>("");
  const counter = useRef(0);

  // Browser-only facts (stored name, user agent) can't be known while the page is built on the server.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      setPublication(localStorage.getItem("capsule-lab-publication") ?? "");
    } catch {
      /* private mode: start empty */
    }
    setEnv(
      `${navigator.userAgent} | ClipboardItem: ${typeof ClipboardItem !== "undefined" ? "yes" : "no"} | clipboard.write: ${
        typeof navigator.clipboard?.write === "function" ? "yes" : "no"
      }`,
    );
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  function note(text: string, good: boolean) {
    counter.current += 1;
    setLog((current) => [{ id: counter.current, at: new Date().toLocaleTimeString(), text, good }, ...current].slice(0, 30));
  }

  function savePublication(value: string) {
    setPublication(value);
    try {
      localStorage.setItem("capsule-lab-publication", value);
    } catch {
      /* ignore */
    }
  }

  function report(platform: CapsulePlatform, result: CopyAndOpenResult) {
    const parts = [
      `${platform} · ${result.strategy}`,
      result.copied ? `copied (${result.how})` : `COPY FAILED: ${result.error}`,
      result.opened ? "tab opened" : "TAB BLOCKED",
      `${result.ms} ms`,
    ];
    note(parts.join(" · "), result.copied && result.opened);
  }

  // These handlers do the copy/open straight from the click. Don't put an await in front of them.
  function run(platform: CapsulePlatform, strategy: OpenStrategy) {
    void copyAndOpen(strategy, { html: SAMPLE_HTML }, editorUrl(platform, publication)).then((result) => report(platform, result));
  }

  function copyOnly() {
    copyAtom({ html: SAMPLE_HTML }).then(
      ({ how }) => note(`Copied (${how}).`, true),
      (failure: unknown) => note(`COPY FAILED: ${failure instanceof Error ? failure.message : "unknown"}`, false),
    );
  }

  function openOnly(platform: CapsulePlatform) {
    const opened = openEditor(editorUrl(platform, publication));
    note(`${platform} · open only · ${opened ? "tab opened" : "TAB BLOCKED"}`, opened);
  }

  const substackReady = publication.trim().length > 0;

  return (
    <div className="space-y-6">
      <p className="break-words rounded-md border border-border bg-card p-3 text-xs text-muted-foreground">{env || "Reading this browser…"}</p>

      <section className="space-y-2">
        <Label htmlFor="publication">Your Substack publication name</Label>
        <Input
          id="publication"
          value={publication}
          onChange={(event) => savePublication(event.target.value)}
          placeholder="e.g. buildablelabs  (from buildablelabs.substack.com)"
          className="max-w-md"
        />
      </section>

      {STRATEGIES.map((strategy) => (
        <section key={strategy.value} className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">{strategy.label}</h2>
          <p className="mb-3 text-xs text-muted-foreground">{strategy.note}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => run("medium", strategy.value)}>
              Medium
            </Button>
            <Button type="button" size="sm" disabled={!substackReady} onClick={() => run("substack", strategy.value)}>
              Substack
            </Button>
          </div>
        </section>
      ))}

      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Two clicks (the backup)</h2>
        <p className="mb-3 text-xs text-muted-foreground">First click copies, second click opens. Each is its own real click.</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={copyOnly}>
            1 · Copy
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => openOnly("medium")}>
            2 · Open Medium
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={!substackReady} onClick={() => openOnly("substack")}>
            2 · Open Substack
          </Button>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">What would paste</h2>
        <p className="mb-3 text-xs text-muted-foreground">Copy, then paste here to see exactly what the clipboard holds.</p>
        <div
          contentEditable
          suppressContentEditableWarning
          onPaste={(event) => {
            const types = Array.from(event.clipboardData.types);
            const html = event.clipboardData.getData("text/html");
            setPasted(`types: ${types.join(", ")}\nhtml length: ${html.length}\nplain: ${event.clipboardData.getData("text/plain").slice(0, 120)}`);
          }}
          className="min-h-24 rounded-md border border-dashed border-border bg-background p-3 text-sm"
          aria-label="Paste here to inspect the clipboard"
        />
        {pasted ? <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">{pasted}</pre> : null}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Results</h2>
        {log.length === 0 ? <p className="text-xs text-muted-foreground">Nothing yet. Press a button above.</p> : null}
        <ul className="space-y-1 text-xs">
          {log.map((entry) => (
            <li key={entry.id} className={entry.good ? "text-emerald-500" : "text-amber-500"}>
              {entry.at} · {entry.text}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
