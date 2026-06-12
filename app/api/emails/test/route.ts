import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/services/email-service";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Disabled in production" }, { status: 404 });
  }

  const { to } = await request.json();
  const supabase = createAdminClient();
  const result = await sendEmail(supabase, {
    to,
    subject: "BuildableLabs Toolkit test email",
    html: "<p>Email delivery is configured.</p>",
    type: "invite",
  });

  return NextResponse.json(result);
}
