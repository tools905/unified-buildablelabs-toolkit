import { createAdminClient } from "@/lib/supabase/admin";
import { prepareApplication } from "@/lib/services/talent-service";

// The public application form, step one: where to upload the chosen files. See talent-service.ts.
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const body = (await request.json().catch(() => null)) as { files?: unknown } | null;
    const files = Array.isArray(body?.files) ? body.files.slice(0, 10) : [];
    const result = await prepareApplication(createAdminClient(), token, files as Parameters<typeof prepareApplication>[2]);
    return Response.json(result, { status: result.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("talent application prepare failed", error);
    return Response.json({ ok: false, message: "Something went wrong on our side. Please try again." }, { status: 500 });
  }
}
