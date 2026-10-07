// What the consent screen decides without touching the network: whether a connector's return address is
// one we recognise, and how to say what it asked for in plain words. Kept apart from the page so it can
// be tested on its own.

type RedirectRule = { protocol: "https:" | "http:"; hostname: string; pathPrefix?: string };

// Dynamic registration lets anyone register an app with the project, so the consent screen only lets a
// person approve connectors it recognises. The hosted apps return to one fixed address; the
// command-line tool returns to a local address on any port. Add a line here to recognise another one.
export const RECOGNISED_REDIRECTS: readonly RedirectRule[] = [
  { protocol: "https:", hostname: "claude.ai", pathPrefix: "/api/mcp/" },
  { protocol: "http:", hostname: "localhost" },
  { protocol: "http:", hostname: "127.0.0.1" },
];

export function isRecognisedRedirect(redirectUri: string): boolean {
  let url: URL;
  try {
    url = new URL(redirectUri);
  } catch {
    return false;
  }
  return RECOGNISED_REDIRECTS.some(
    (rule) =>
      url.protocol === rule.protocol &&
      url.hostname === rule.hostname &&
      (rule.pathPrefix === undefined || url.pathname.startsWith(rule.pathPrefix)),
  );
}

// The part of the return address a person can check at a glance, such as "claude.ai".
export function redirectHostLabel(redirectUri: string): string {
  try {
    return new URL(redirectUri).host;
  } catch {
    return redirectUri;
  }
}

const SCOPE_WORDS: Record<string, string> = {
  openid: "Confirm who you are",
  profile: "See your name",
  email: "See your email address",
  phone: "See your phone number",
  offline_access: "Stay connected without asking you to sign in again",
};

// "openid email" -> the plain sentences to show. A scope we have no wording for is shown as it is.
export function describeScopes(scope: string): string[] {
  const asked = [...new Set(scope.split(/\s+/).filter(Boolean))];
  return asked.map((name) => SCOPE_WORDS[name] ?? name);
}

// What the connector can do once approved. It matches the tools in lib/mcp/contract.ts: if a tool is added
// or removed there, update this list too.
export const CONNECTOR_CAN = [
  "Create a new idea on the Content Board.",
  "See your Content Board ideas, their files and review points, and the month's schedule.",
  "Add review points and tick them off. They show under your name, and the first one on a new idea moves it to Feedback, as on the board.",
  "Upload a PDF or image to an idea, or replace one that is already there.",
] as const;

export const CONNECTOR_CANNOT = [
  "Delete ideas, change the details of ideas that already exist, or move them between columns in any other way.",
  "Use any other part of the toolkit.",
] as const;
