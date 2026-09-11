import "server-only";

const LINEAR_API_URL = "https://api.linear.app/graphql";

export type LinearIssue = {
  id: string;
  identifier: string;
  title: string;
  url: string;
  state: string | null;
  teamId: string | null;
  updatedAt: string;
};

export type LinearTeam = {
  id: string;
  name: string;
  key: string;
};

type GraphQLResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};

/**
 * Linear API keys (personal or workspace) go in the Authorization header
 * as-is — no "Bearer " prefix. (Only OAuth access tokens use "Bearer ".)
 * See https://developers.linear.app/docs/graphql/working-with-the-graphql-api#authentication
 */
async function linearRequest<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    throw new Error("LINEAR_API_KEY is not configured.");
  }

  const response = await fetch(LINEAR_API_URL, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "<unreadable>");
    throw new Error(`Linear API error: ${response.status} ${text}`);
  }

  const json = (await response.json()) as GraphQLResponse<T>;
  if (json.errors?.length) {
    throw new Error(`Linear API returned errors: ${json.errors.map((e) => e.message).join("; ")}`);
  }
  if (!json.data) {
    throw new Error("Linear API returned no data.");
  }
  return json.data;
}

function toIssue(node: {
  id: string;
  identifier: string;
  title: string;
  url: string;
  state?: { name: string } | null;
  team?: { id: string } | null;
  updatedAt: string;
}): LinearIssue {
  return {
    id: node.id,
    identifier: node.identifier,
    title: node.title,
    url: node.url,
    state: node.state?.name ?? null,
    teamId: node.team?.id ?? null,
    updatedAt: node.updatedAt,
  };
}

const ISSUE_FIELDS = `
  id
  identifier
  title
  url
  updatedAt
  state { name }
  team { id }
`;

/**
 * Looks up a single issue by its human key (e.g. "ENG-214") — used to verify
 * a deterministic identifier found in ticket text before auto-linking.
 */
export async function getIssueByIdentifier(identifier: string): Promise<LinearIssue | null> {
  const data = await linearRequest<{ searchIssues: { nodes: Array<Parameters<typeof toIssue>[0]> } }>(
    `query($term: String!) {
      searchIssues(term: $term, first: 5) {
        nodes { ${ISSUE_FIELDS} }
      }
    }`,
    { term: identifier },
  );

  const match = data.searchIssues.nodes.find(
    (node) => node.identifier.toLowerCase() === identifier.toLowerCase(),
  );
  return match ? toIssue(match) : null;
}

/**
 * Free-text issue search, optionally scoped to specific teams. Used for the
 * manual "search Linear" picker and as the candidate source for semantic
 * matching (Tier 2).
 *
 * Uses `searchIssues`, not the deprecated `issueSearch` — verified against a
 * live Linear account (Linear's schema marks `issueSearch` deprecated in
 * favor of `searchIssues`, which takes `term` rather than `query`).
 */
export async function searchIssues(
  term: string,
  options?: { teamIds?: string[]; limit?: number },
): Promise<LinearIssue[]> {
  const limit = options?.limit ?? 20;
  const filter = options?.teamIds?.length
    ? { team: { id: { in: options.teamIds } } }
    : undefined;

  const data = await linearRequest<{ searchIssues: { nodes: Array<Parameters<typeof toIssue>[0]> } }>(
    `query($term: String!, $filter: IssueFilter, $first: Int) {
      searchIssues(term: $term, filter: $filter, first: $first) {
        nodes { ${ISSUE_FIELDS} }
      }
    }`,
    { term, filter, first: limit },
  );

  return data.searchIssues.nodes.map(toIssue);
}

/** Lists teams so an admin can pick which ones are searchable (see settings). */
export async function listTeams(): Promise<LinearTeam[]> {
  const data = await linearRequest<{ teams: { nodes: LinearTeam[] } }>(
    `query {
      teams(first: 100) {
        nodes { id name key }
      }
    }`,
  );
  return data.teams.nodes;
}

export function isLinearConfigured() {
  return Boolean(process.env.LINEAR_API_KEY);
}
