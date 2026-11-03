// The date filter on Notifications and Workspace logs: everything, this month, the last 3 months, or
// a custom range. Kept in the address (?range=month, ?range=custom&from=2026-09-01&to=2026-09-30) so
// a filtered list can be refreshed or shared, and read the same way on the server and in the page.

export type RangeKey = "all" | "month" | "3months" | "custom";

export type DateRange = { key: RangeKey; from: string | null; to: string | null };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

// Calendar days in India time, where the team is.
function todayParts(now: Date) {
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now).split("-").map(Number);
  return { year, month, day };
}
const pad = (value: number) => String(value).padStart(2, "0");
const dayString = (year: number, month: number, day: number) => {
  const date = new Date(Date.UTC(year, month - 1, day));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};

export function parseDateRange(params: { range?: string | string[]; from?: string | string[]; to?: string | string[] }, now = new Date()): DateRange {
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const key = one(params.range);
  const { year, month, day } = todayParts(now);
  if (key === "month") return { key, from: dayString(year, month, 1), to: null };
  if (key === "3months") return { key, from: dayString(year, month - 3, day), to: null };
  if (key === "custom") {
    const from = one(params.from);
    const to = one(params.to);
    return { key, from: from && DAY.test(from) ? from : null, to: to && DAY.test(to) ? to : null };
  }
  return { key: "all", from: null, to: null };
}

// The range as timestamps for a database filter: from the start of `from` to the end of `to`, India time.
export function rangeBounds(range: DateRange) {
  return {
    since: range.from ? `${range.from}T00:00:00+05:30` : null,
    until: range.to ? `${range.to}T23:59:59.999+05:30` : null,
  };
}

export function describeRange(range: DateRange) {
  if (range.key === "month") return "This month";
  if (range.key === "3months") return "Last 3 months";
  if (range.key === "custom") {
    if (range.from && range.to) return `${range.from} to ${range.to}`;
    if (range.from) return `From ${range.from}`;
    if (range.to) return `Until ${range.to}`;
  }
  return "All time";
}
