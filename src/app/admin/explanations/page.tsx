import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { adminEnabled, isAdminUnlocked } from "@/server/admin-auth";
import { getRecentExplanations } from "@/server/explain/monitor";
import { ExplanationLogView } from "@/components/admin/explanation-log-view";
import { AdminUnlock } from "@/components/admin/admin-unlock";

export const dynamic = "force-dynamic";

/**
 * Internal debug view: the last N generated explanations and whether each
 * came from the real AI path, was AI-generated but had a field patched by
 * the grounding check, or fell all the way back to the deterministic
 * template — and why, when that happened. Exists because the
 * templated-repetition bug (see CLAUDE.md §6) happened twice and was only
 * ever caught by a user noticing repeated phrasing; this makes the
 * AI-vs-fallback split visible at a glance instead.
 */
export default async function AdminExplanationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin/explanations");

  // Previously any signed-in user could read this. The entries contain other
  // people's generated explanations, so it belongs behind the same admin key
  // as the rest of /admin.
  if (!(await isAdminUnlocked())) {
    return <AdminUnlock configured={adminEnabled()} />;
  }

  const initialEntries = getRecentExplanations();

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Explanation log</h1>
        <p className="mt-1 text-sm text-stone-500">
          The last {initialEntries.length} explanations generated this server session, and whether each came from
          Claude, was patched by the grounding check, or fell back to the deterministic template.
        </p>
      </div>
      <ExplanationLogView initialEntries={initialEntries} />
    </div>
  );
}
