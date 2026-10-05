import { describe, expect, it } from "vitest";
import { getIdeaPdfDownloadUrl, NothingToDownloadError } from "@/lib/services/content-export-service";
import { groupIntoDrafts } from "@/lib/utils/content-board";

const MRIDUL = "11111111-1111-4111-8111-111111111111";
const ADITI = "22222222-2222-4222-8222-222222222222";

// Three drafts like Founder Bingo: Mridul's PDF, Aditi's PDF, then Mridul's updated PDF.
const rows = [
  { id: "a1", kind: "pdf", storage_path: "w/i/first.pdf", created_by: MRIDUL, created_at: "2026-09-30T12:25:00Z" },
  { id: "a2", kind: "pdf", storage_path: "w/i/second.pdf", created_by: ADITI, created_at: "2026-09-30T18:44:00Z" },
  { id: "a3", kind: "pdf", storage_path: "w/i/third.pdf", created_by: MRIDUL, created_at: "2026-10-03T15:30:00Z" },
];

// Enough of Supabase for a download made of single PDFs: those are handed out as they are, unbuilt.
function fakeSupabase() {
  const signed: { path: string; download: string }[] = [];
  const query = (result: unknown) => {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      maybeSingle: () => Promise.resolve({ data: result, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: result, error: null }).then(resolve),
    };
    return builder;
  };
  const client = {
    from: (table: string) =>
      table === "content_ideas" ? query({ id: "i", title: "Founder Bingo", workspace_id: "w" }) : query(rows),
    storage: {
      from: () => ({
        createSignedUrl: async (path: string, _ttl: number, options: { download: string }) => {
          signed.push({ path, download: options.download });
          return { data: { signedUrl: `https://files.test/${path}` }, error: null };
        },
      }),
    },
  };
  return { client: client as never, signed };
}

describe("downloading a draft as a PDF", () => {
  it("downloads the latest draft when no draft is picked", async () => {
    const { client, signed } = fakeSupabase();
    await expect(getIdeaPdfDownloadUrl(client, "i")).resolves.toBe("https://files.test/w/i/third.pdf");
    expect(signed[0].download).toBe("Founder Bingo - draft 3.pdf");
  });

  it("downloads exactly the draft on screen", async () => {
    const { client, signed } = fakeSupabase();
    await expect(getIdeaPdfDownloadUrl(client, "i", ["a2"])).resolves.toBe("https://files.test/w/i/second.pdf");
    expect(signed[0].download).toBe("Founder Bingo - draft 2.pdf");
  });

  it("refuses files that are not part of the idea", async () => {
    const { client } = fakeSupabase();
    await expect(getIdeaPdfDownloadUrl(client, "i", ["someone-else"])).rejects.toBeInstanceOf(NothingToDownloadError);
  });
});

describe("drafts", () => {
  it("are one person's uploads made around the same time", () => {
    const drafts = groupIntoDrafts(
      [
        { who: "a", at: "2026-10-01T10:00:00Z" },
        { who: "a", at: "2026-10-01T10:20:00Z" },
        { who: "b", at: "2026-10-01T10:21:00Z" },
        { who: "b", at: "2026-10-01T12:00:00Z" },
      ],
      (item) => item.who,
      (item) => item.at,
    );
    expect(drafts.map((draft) => draft.length)).toEqual([2, 1, 1]);
  });
});
