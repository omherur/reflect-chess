import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { isAdminUser } from "@/server/admin-auth";
import { getAdminOverview } from "@/server/admin";
import { AdminOverviewView } from "@/components/admin/admin-overview-view";

export const dynamic = "force-dynamic";

/**
 * Signups and waitlist, for whoever is on the ADMIN_EMAILS allowlist.
 *
 * A signed-in non-admin gets a 404 rather than "forbidden": there's no
 * reason to confirm the page exists to someone who can't use it. The data
 * is only queried after that check, so a rejected visitor's response never
 * contains a name or an email address.
 */
export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  if (!isAdminUser(user)) notFound();

  const data = await getAdminOverview();
  return <AdminOverviewView data={data} />;
}
