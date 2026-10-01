export type DiffPart = { type: "equal" | "insert" | "delete"; value: string };

export type DiffRow = { type: "equal" | "insert" | "delete"; parts: DiffPart[] };

// Above this many cells the comparison table would be too big to build in the browser, so the
// changed stretch is shown as removed and re-added instead of word by word.
const MAX_TABLE_CELLS = 4_000_000;

type Step<T> = { type: "equal" | "insert" | "delete"; value: T };

// Longest-common-subsequence comparison of two lists. The unchanged start and end are matched
// first, so the table only covers the stretch that actually changed.
function compare<T>(a: T[], b: T[]): Step<T>[] {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }

  const head: Step<T>[] = a.slice(0, start).map((value) => ({ type: "equal", value }));
  const tail: Step<T>[] = a.slice(endA).map((value) => ({ type: "equal", value }));
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const n = midA.length;
  const m = midB.length;

  if ((n + 1) * (m + 1) > MAX_TABLE_CELLS) {
    return [
      ...head,
      ...midA.map((value) => ({ type: "delete" as const, value })),
      ...midB.map((value) => ({ type: "insert" as const, value })),
      ...tail,
    ];
  }

  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        midA[i] === midB[j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }

  const middle: Step<T>[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (midA[i] === midB[j]) {
      middle.push({ type: "equal", value: midA[i] });
      i += 1;
      j += 1;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      middle.push({ type: "delete", value: midA[i] });
      i += 1;
    } else {
      middle.push({ type: "insert", value: midB[j] });
      j += 1;
    }
  }
  while (i < n) middle.push({ type: "delete", value: midA[i++] });
  while (j < m) middle.push({ type: "insert", value: midB[j++] });

  return [...head, ...middle, ...tail];
}

function merge(parts: DiffPart[]): DiffPart[] {
  const merged: DiffPart[] = [];
  for (const part of parts) {
    if (!part.value) continue;
    const last = merged[merged.length - 1];
    if (last && last.type === part.type) last.value += part.value;
    else merged.push({ ...part });
  }
  return merged;
}

// Word-by-word changes between two pieces of text. Spaces are kept as their own pieces so the
// result can be joined back into either text exactly.
export function diffWords(before: string, after: string): DiffPart[] {
  const tokens = (text: string) => text.split(/(\s+)/).filter(Boolean);
  return merge(compare(tokens(before), tokens(after)));
}

// Line-by-line changes, shown the way git does: within each changed stretch, the old lines
// come first (removed) and the new lines after (added). When a line was edited rather than
// replaced, the words that changed inside it are marked too, so they stand out on the line.
export function diffLines(before: string, after: string): DiffRow[] {
  const steps = compare(before ? before.split("\n") : [], after ? after.split("\n") : []);
  const rows: DiffRow[] = [];
  let removed: string[] = [];
  let added: string[] = [];

  const flush = () => {
    const paired = Math.min(removed.length, added.length);
    const oldRows: DiffRow[] = [];
    const newRows: DiffRow[] = [];
    removed.forEach((line, k) => {
      const parts =
        k < paired
          ? diffWords(line, added[k]).filter((part) => part.type !== "insert")
          : [{ type: "delete" as const, value: line }];
      oldRows.push({ type: "delete", parts });
    });
    added.forEach((line, k) => {
      const parts =
        k < paired
          ? diffWords(removed[k], line).filter((part) => part.type !== "delete")
          : [{ type: "insert" as const, value: line }];
      newRows.push({ type: "insert", parts });
    });
    rows.push(...oldRows, ...newRows);
    removed = [];
    added = [];
  };

  for (const step of steps) {
    if (step.type === "delete") removed.push(step.value);
    else if (step.type === "insert") added.push(step.value);
    else {
      flush();
      rows.push({ type: "equal", parts: [{ type: "equal", value: step.value }] });
    }
  }
  flush();
  return rows;
}

export function countChanges(parts: DiffPart[]) {
  const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
  return parts.reduce(
    (total, part) => {
      if (part.type === "insert") total.added += words(part.value);
      if (part.type === "delete") total.removed += words(part.value);
      return total;
    },
    { added: 0, removed: 0 },
  );
}
