import { prisma } from "@/lib/db";
import { mirrorSubscription, supabaseMirrorEnabled } from "@/server/billing/supabase-mirror";

/**
 * Rebuild the Supabase `subscriptions` table from the local database.
 *
 * This exists because the mirror is deliberately best-effort: writes are
 * swallowed so they can never fail a webhook, which means the table can drift
 * — a Supabase outage, a timeout, a missing key during a deploy. Drift in a
 * secondary copy is acceptable only if it's repairable, and this is the
 * repair.
 *
 * Safe to run any time: it's an upsert keyed on app_user_id, so re-running is
 * a no-op rather than a duplicate. Run it after adding the service-role key,
 * after any incident, or on a schedule if you want belt and braces.
 *
 *     npx tsx scripts/reconcile-supabase-subscriptions.ts
 */
async function main() {
  if (!supabaseMirrorEnabled()) {
    console.error(
      "Mirroring is not configured. Set SUPABASE_SERVICE_ROLE_KEY (and " +
        "NEXT_PUBLIC_SUPABASE_URL) and try again."
    );
    process.exit(1);
  }

  // Only accounts that have ever touched billing. Mirroring every user would
  // fill the table with rows that all say "free, never subscribed".
  const users = await prisma.user.findMany({
    where: { OR: [{ stripeCustomerId: { not: null } }, { subscriptionStatus: { not: null } }] },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Reconciling ${users.length} account(s) with billing history…`);

  let written = 0;
  const failed: string[] = [];
  for (const user of users) {
    if (await mirrorSubscription(user)) written++;
    else failed.push(user.email ?? user.id);
  }

  console.log(`Wrote ${written}/${users.length}.`);
  if (failed.length > 0) {
    // Reported rather than thrown: a partial reconcile is still progress, and
    // knowing which rows are still stale is the useful output.
    console.error(`Still stale: ${failed.join(", ")}`);
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
