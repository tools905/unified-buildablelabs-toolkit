import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { submitApplication } from "@/lib/services/talent-service";

// The public application form, step two: the answers. A form filled by a bot (the hidden field has
// text, or it was sent within seconds of opening) gets a normal-looking reply and is not saved.
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const body = (await request.json().catch(() => null)) as {
      candidateId?: string;
      answers?: unknown;
      files?: { path: string; name: string; kind: "resume" | "work" }[];
      website?: string;
      elapsedMs?: number;
    } | null;
    if (!body) return Response.json({ ok: false, message: "Please fill in the form." }, { status: 400 });
    if (body.website || (body.elapsedMs ?? 0) < 4000) {
      return Response.json({ ok: true, reference: `BL-${randomBytes(3).toString("hex").toUpperCase()}` });
    }
    const result = await submitApplication(createAdminClient(), token, {
      candidateId: String(body.candidateId ?? ""),
      answers: body.answers,
      files: Array.isArray(body.files) ? body.files.slice(0, 10) : [],
    });
    return Response.json(result, { status: result.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("talent application submit failed", error);
    return Response.json({ ok: false, message: "Something went wrong on our side. Please try again." }, { status: 500 });
  }
}
