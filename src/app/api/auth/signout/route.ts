import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Signs out server-side so the auth cookies are cleared by the response,
 * rather than relying on the browser client to tidy up cookies it may not
 * own.
 */
export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
