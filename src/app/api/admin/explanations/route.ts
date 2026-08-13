import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { isAdminUser } from "@/server/admin-auth";
import { getRecentExplanations } from "@/server/explain/monitor";

/**
 * Backs the /admin/explanations debug view's auto-refresh.
 *
 * Gating the page without gating this route would be pointless — the page is
 * just a renderer, and the entries (other people's generated explanations)
 * would still be one fetch away for any signed-in user. Both go behind the
 * same email allowlist.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!isAdminUser(user)) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  return NextResponse.json({ entries: getRecentExplanations() });
}
