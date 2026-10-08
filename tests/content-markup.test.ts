import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/audit-service", () => ({ writeAuditLog: vi.fn(async () => undefined) }));
vi.mock("@/lib/services/notification-service", () => ({ createNotification: vi.fn(async () => undefined) }));
vi.mock("@/lib/services/content-review-service", () => ({ addReviewPoint: vi.fn(async () => ({ movedToFeedback: true })) }));

import { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream } from "pdf-lib";
import { createNotification } from "@/lib/services/notification-service";
import { addReviewPoint } from "@/lib/services/content-review-service";
import { submitMarkupReview } from "@/lib/services/content-markup-service";
import { getIdeaPdfDownloadUrl } from "@/lib/services/content-export-service";
import { describePages, eraseAt, simplifyPoints, strokePath, strokeWidth, type MarkupStroke } from "@/lib/utils/markup";
import { markupSubmissionSchema } from "@/lib/validation/content-idea-schema";

const IDEA = "11111111-1111-4111-8111-111111111111";
const FILE_A = "22222222-2222-4222-8222-222222222222";
const FILE_B = "33333333-3333-4333-8333-333333333333";
const ADITI = "44444444-4444-4444-8444-444444444444";
const MRIDUL = "55555555-5555-4555-8555-555555555555";
const red = (points: number[]): MarkupStroke => ({ tool: "pen", color: "#E5372B", width: 0.005, points });

describe("drawing marks", () => {
  it("keeps strokes small without changing their shape", () => {
    const dense = Array.from({ length: 200 }, (_, i) => [i * 0.0001, 0.5]).flat();
    const simplified = simplifyPoints(dense);
    expect(simplified.length).toBeLessThan(dense.length / 5);
    expect(simplified.slice(0, 2)).toEqual([0, 0.5]);
    expect(simplified.slice(-2)).toEqual([0.0199, 0.5]);
  });

  it("presses harder for a thicker Pencil line", () => {
    expect(strokeWidth("pen", 1)).toBeGreaterThan(strokeWidth("pen", 0.2));
    expect(strokeWidth("highlighter", 1)).toBe(strokeWidth("highlighter", 0.1));
  });

  it("turns a stroke into a path on a page of any size", () => {
    expect(strokePath([0, 0, 0.5, 1], 1000, 1250)).toBe("M0.00 0.00 L500.00 1250.00");
    expect(strokePath([0.5, 0.5], 100, 100)).toBe("M50.00 50.00 L50.01 50.00");
  });

  it("erases only the strokes the eraser passes over", () => {
    const strokes = [red([0.1, 0.1, 0.2, 0.1]), red([0.8, 0.8, 0.9, 0.9])];
    expect(eraseAt(strokes, 0.15, 0.1, 0.01, 1.25)).toEqual([strokes[1]]);
    expect(eraseAt(strokes, 0.5, 0.5, 0.01, 1.25)).toEqual(strokes);
  });

  it("names the pages that were marked", () => {
    expect(describePages([3])).toBe("page 3");
    expect(describePages([5, 2])).toBe("pages 2 and 5");
    expect(describePages([7, 2, 5, 2])).toBe("pages 2, 5 and 7");
  });
});

describe("a submitted review", () => {
  const page = { attachmentId: FILE_A, pageNumber: 2, position: 2, strokes: [red([0.1, 0.1, 0.2, 0.2])] };

  it("must be on the draft's own pages and have something drawn", () => {
    expect(markupSubmissionSchema.safeParse({ ideaId: IDEA, fileIds: [FILE_A], pages: [page] }).success).toBe(true);
    expect(markupSubmissionSchema.safeParse({ ideaId: IDEA, fileIds: [FILE_B], pages: [page] }).success).toBe(false);
    expect(markupSubmissionSchema.safeParse({ ideaId: IDEA, fileIds: [FILE_A], pages: [] }).success).toBe(false);
    expect(
      markupSubmissionSchema.safeParse({ ideaId: IDEA, fileIds: [FILE_A], pages: [{ ...page, strokes: [{ ...page.strokes[0], color: "red" }] }] })
        .success,
    ).toBe(false);
  });

  beforeEach(() => vi.clearAllMocks());

  function fakeSupabase() {
    const inserted: Record<string, unknown[]> = {};
    const from = (table: string) => {
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        delete: () => builder,
        maybeSingle: async () => ({
          data: {
            id: IDEA,
            title: "Founder Bingo",
            workspace_id: "w",
            attachments: [{ id: FILE_A }, { id: FILE_B }],
            assignees: [{ user_id: MRIDUL }, { user_id: ADITI }],
          },
          error: null,
        }),
        insert: (rows: unknown) => {
          inserted[table] = [...(inserted[table] ?? []), ...(Array.isArray(rows) ? rows : [rows])];
          const result = { data: { id: "review-1" }, error: null };
          return { select: () => ({ single: async () => result }), then: (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve) };
        },
      };
      return builder;
    };
    return { client: { from } as never, inserted };
  }

  it("is saved as a layer, adds a review comment and tells the assignees (not the reviewer)", async () => {
    const { client, inserted } = fakeSupabase();
    const result = await submitMarkupReview(client, {
      workspaceId: "w",
      userId: ADITI,
      userName: "Aditi",
      submission: { ideaId: IDEA, fileIds: [FILE_A], note: "Tighten the headline", pages: [page, { ...page, pageNumber: 5, position: 5 }] },
    });
    expect(result).toEqual({ reviewId: "review-1" });
    expect(inserted.content_idea_reviews).toEqual([
      expect.objectContaining({ idea_id: IDEA, file_ids: [FILE_A], note: "Tighten the headline", created_by: ADITI }),
    ]);
    expect(inserted.content_idea_review_pages).toHaveLength(2);
    expect(addReviewPoint).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ ideaId: IDEA, body: "Marked up pages 2 and 5 with Pencil. Tighten the headline" }),
    );
    expect(vi.mocked(createNotification).mock.calls.map(([input]) => input.userId)).toEqual([MRIDUL]);
  });

  it("refuses files that aren't on the idea any more", async () => {
    const { client } = fakeSupabase();
    const missing = "66666666-6666-4666-8666-666666666666";
    await expect(
      submitMarkupReview(client, {
        workspaceId: "w",
        userId: ADITI,
        userName: "Aditi",
        submission: { ideaId: IDEA, fileIds: [missing], pages: [{ ...page, attachmentId: missing }] },
      }),
    ).rejects.toThrow(/removed while you were reviewing/);
  });
});

describe("downloading a review as a PDF", () => {
  it("draws the marks onto the draft's pages and names the file after the review", async () => {
    const source = await PDFDocument.create();
    source.addPage([1080, 1350]);
    source.addPage([1080, 1350]);
    const sourceBytes = await source.save();
    let uploaded: Uint8Array | null = null;
    let uploadedPath = "";
    const signed: string[] = [];
    const rows = [{ id: FILE_A, kind: "pdf", storage_path: "w/i/a.pdf", created_by: MRIDUL, created_at: "2026-10-08T10:00:00Z" }];
    const query = (result: unknown) => {
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        maybeSingle: async () => ({ data: result, error: null }),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: result, error: null }).then(resolve),
      };
      return builder;
    };
    const client = {
      from: (table: string) => (table === "content_ideas" ? query({ id: IDEA, title: "Founder Bingo", workspace_id: "w" }) : query(rows)),
      storage: {
        from: () => ({
          list: async () => ({ data: [], error: null }),
          download: async () => ({ data: new Blob([sourceBytes as BlobPart]), error: null }),
          upload: async (path: string, bytes: Uint8Array) => {
            uploadedPath = path;
            uploaded = bytes;
            return { error: null };
          },
          remove: async () => ({ error: null }),
          createSignedUrl: async (_path: string, _ttl: number, options: { download: string }) => {
            signed.push(options.download);
            return { data: { signedUrl: "https://files.test/review.pdf" }, error: null };
          },
        }),
      },
    } as never;

    const url = await getIdeaPdfDownloadUrl(client, IDEA, [], {
      id: "abcdef12-0000-4000-8000-000000000000",
      authorName: "Aditi",
      fileIds: [FILE_A],
      pages: [{ attachmentId: FILE_A, pageNumber: 2, strokes: [red([0.1, 0.1, 0.9, 0.9])] }],
    });

    expect(url).toBe("https://files.test/review.pdf");
    expect(uploadedPath).toContain("-review-abcdef12.pdf");
    expect(signed[0]).toBe("Founder Bingo - review by Aditi.pdf");
    const result = await PDFDocument.load(uploaded!);
    expect(result.getPageCount()).toBe(2);
    // The red stroke (229, 55, 43) is in page 2's drawing commands, and only there.
    const pageCommands = (index: number) => {
      const contents = result.getPage(index).node.Contents();
      const streams = contents instanceof PDFArray ? contents.asArray().map((ref) => result.context.lookup(ref)) : [contents];
      return streams
        .map((stream) => (stream instanceof PDFRawStream ? Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1") : ""))
        .join("\n");
    };
    expect(pageCommands(1)).toMatch(/0\.898\d* 0\.215\d* 0\.168\d* RG/);
    expect(pageCommands(0)).not.toMatch(/RG/);
  });
});
