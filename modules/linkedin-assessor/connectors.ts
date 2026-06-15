import type { LinkedInActivityType, LinkedInConnectorSource } from "./types";

export type FetchedLinkedInActivity = {
  externalId: string | null;
  url: string | null;
  text: string | null;
  postedAt: string | null;
  rawPayload: unknown;
  source: LinkedInConnectorSource;
};

export interface LinkedInConnector {
  fetchActivities(input: {
    trackedMemberId: string;
    linkedinProfileUrl: string;
    from: Date;
    to: Date;
  }): Promise<FetchedLinkedInActivity[]>;
}

class MockConnector implements LinkedInConnector {
  async fetchActivities(input: Parameters<LinkedInConnector["fetchActivities"]>[0]) {
    const seed = input.trackedMemberId.slice(0, 8);
    return [
      {
        externalId: `mock-${seed}-1`,
        url: `https://www.linkedin.com/feed/update/mock-${seed}-1`,
        text: "I learned that useful dashboards begin with the decision a team needs to make. One concrete example and one clear next step beat another decorative chart.",
        postedAt: new Date(Math.max(input.from.getTime(), Date.now() - 9 * 86400000)).toISOString(),
        rawPayload: { mock: true, type: "original_post", profile: input.linkedinProfileUrl },
        source: "mock" as const,
      },
      {
        externalId: `mock-${seed}-2`,
        url: `https://www.linkedin.com/feed/update/mock-${seed}-2`,
        text: "Reposting this useful perspective from another operator.",
        postedAt: new Date(Math.max(input.from.getTime(), Date.now() - 7 * 86400000)).toISOString(),
        rawPayload: { mock: true, type: "repost" },
        source: "mock" as const,
      },
      {
        externalId: `mock-${seed}-3`,
        url: `https://www.linkedin.com/feed/update/mock-${seed}-3`,
        text: "A small content experiment worked better than expected: one specific example, one uncomfortable tradeoff, and one clear next step.",
        postedAt: new Date(Math.max(input.from.getTime(), Date.now() - 2 * 86400000)).toISOString(),
        rawPayload: { mock: true, type: "original_post" },
        source: "mock" as const,
      },
    ].filter((activity) => {
      const postedAt = new Date(activity.postedAt);
      return postedAt >= input.from && postedAt <= input.to;
    });
  }
}

class EmptyConnector implements LinkedInConnector {
  constructor(private readonly provider: LinkedInConnectorSource) {}

  async fetchActivities(): Promise<FetchedLinkedInActivity[]> {
    throw new Error(`${this.provider.replaceAll("_", " ")} collection is not configured yet.`);
  }
}

export function getLinkedInConnector(provider: LinkedInConnectorSource): LinkedInConnector {
  return provider === "mock" ? new MockConnector() : new EmptyConnector(provider);
}

export function classifyLinkedInActivity(activity: FetchedLinkedInActivity): LinkedInActivityType {
  const type = (activity.rawPayload as { type?: string } | null)?.type;
  if (type === "original_post" || type === "collaborative_post" || type === "repost" || type === "comment" || type === "reaction") return type;
  return activity.text?.trim() ? "unknown" : "reaction";
}
