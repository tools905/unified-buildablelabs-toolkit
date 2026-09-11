import { describe, expect, it, vi } from "vitest";

const getIssueByIdentifier = vi.fn();
const isLinearConfigured = vi.fn();
const searchIssues = vi.fn();
const requestIntelligenceJson = vi.fn();

vi.mock("@/lib/services/linear-client", () => ({
  getIssueByIdentifier: (...args: unknown[]) => getIssueByIdentifier(...args),
  isLinearConfigured: (...args: unknown[]) => isLinearConfigured(...args),
  searchIssues: (...args: unknown[]) => searchIssues(...args),
}));

vi.mock("@/modules/shared/ai", () => ({
  requestIntelligenceJson: (...args: unknown[]) => requestIntelligenceJson(...args),
}));

const { extractLinearIdentifier, detectAndLinkByIdentifier, detectSemanticMatch } = await import(
  "@/lib/services/linear-link-service"
);

describe("extractLinearIdentifier", () => {
  it("extracts a bare issue key", () => {
    expect(extractLinearIdentifier("Fix the login redirect (ENG-214)")).toBe("ENG-214");
  });

  it("extracts a key from a Linear URL", () => {
    expect(
      extractLinearIdentifier("See https://linear.app/buildablelabs/issue/ENG-214/fix-login-redirect for context"),
    ).toBe("ENG-214");
  });

  it("is case-insensitive on input but normalizes to uppercase", () => {
    expect(extractLinearIdentifier("continuing work on eng-214")).toBe("ENG-214");
  });

  it("returns null when no identifier is present", () => {
    expect(extractLinearIdentifier("Fix the login redirect bug")).toBeNull();
  });

  it("does not match a plain word followed by a number without a hyphen", () => {
    expect(extractLinearIdentifier("There were 214 users affected")).toBeNull();
  });

  it("prefers a URL match over a bare key elsewhere in the text", () => {
    expect(
      extractLinearIdentifier("Related to ENG-100, tracked at https://linear.app/team/issue/ENG-214/title"),
    ).toBe("ENG-214");
  });
});

describe("detectAndLinkByIdentifier", () => {
  const supabase = {} as any;

  it("never touches Linear when the ticket is already linked", async () => {
    getIssueByIdentifier.mockClear();
    isLinearConfigured.mockClear();
    const ticket = { id: "t1", title: "Fix ENG-214", description: null, linear_issue_id: "existing" };

    const result = await detectAndLinkByIdentifier(supabase, "workspace-1", ticket, "actor-1");

    expect(result).toBe(ticket);
    expect(isLinearConfigured).not.toHaveBeenCalled();
    expect(getIssueByIdentifier).not.toHaveBeenCalled();
  });

  it("never touches Linear when it isn't configured", async () => {
    getIssueByIdentifier.mockClear();
    isLinearConfigured.mockClear().mockReturnValue(false);
    const ticket = { id: "t1", title: "Fix ENG-214", description: null, linear_issue_id: null };

    const result = await detectAndLinkByIdentifier(supabase, "workspace-1", ticket, "actor-1");

    expect(result).toBe(ticket);
    expect(getIssueByIdentifier).not.toHaveBeenCalled();
  });

  it("never calls Linear when no identifier is present in title/description", async () => {
    getIssueByIdentifier.mockClear();
    isLinearConfigured.mockClear().mockReturnValue(true);
    const ticket = { id: "t1", title: "Fix the login redirect", description: "no key here", linear_issue_id: null };

    const result = await detectAndLinkByIdentifier(supabase, "workspace-1", ticket, "actor-1");

    expect(result).toBe(ticket);
    expect(getIssueByIdentifier).not.toHaveBeenCalled();
  });

  it("returns the original ticket unchanged if the Linear lookup throws", async () => {
    isLinearConfigured.mockClear().mockReturnValue(true);
    getIssueByIdentifier.mockClear().mockRejectedValue(new Error("network error"));
    const ticket = { id: "t1", title: "Fix ENG-214", description: null, linear_issue_id: null };

    const result = await detectAndLinkByIdentifier(supabase, "workspace-1", ticket, "actor-1");

    expect(result).toBe(ticket);
    expect(getIssueByIdentifier).toHaveBeenCalledWith("ENG-214");
  });
});

describe("detectSemanticMatch", () => {
  const supabase = {} as any;

  it("never calls Linear when the ticket is already linked", async () => {
    isLinearConfigured.mockClear();
    searchIssues.mockClear();
    const ticket = { id: "t1", title: "Obtain Expo EAS", description: null, linear_issue_id: "existing" };

    await detectSemanticMatch(supabase, "workspace-1", ticket, "actor-1");

    expect(isLinearConfigured).not.toHaveBeenCalled();
    expect(searchIssues).not.toHaveBeenCalled();
  });

  it("never calls Linear when the ticket was already checked before", async () => {
    isLinearConfigured.mockClear();
    searchIssues.mockClear();
    const ticket = {
      id: "t1",
      title: "Obtain Expo EAS",
      description: null,
      linear_issue_id: null,
      linear_match_checked_at: "2026-01-01T00:00:00Z",
    };

    await detectSemanticMatch(supabase, "workspace-1", ticket, "actor-1");

    expect(isLinearConfigured).not.toHaveBeenCalled();
    expect(searchIssues).not.toHaveBeenCalled();
  });

  it("never calls Linear or the AI when Linear isn't configured", async () => {
    isLinearConfigured.mockClear().mockReturnValue(false);
    searchIssues.mockClear();
    requestIntelligenceJson.mockClear();
    const ticket = { id: "t1", title: "Obtain Expo EAS", description: null, linear_issue_id: null };

    await detectSemanticMatch(supabase, "workspace-1", ticket, "actor-1");

    expect(searchIssues).not.toHaveBeenCalled();
    expect(requestIntelligenceJson).not.toHaveBeenCalled();
  });
});
