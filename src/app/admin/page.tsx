import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { adminEnabled, isAdminUnlocked } from "@/server/admin-auth";
import { getAdminOverview } from "@/server/admin";
import { AdminUnlock } from "@/components/admin/admin-unlock";
import { AdminOverviewView } from "@/components/admin/admin-overview-view";

export const dynamic = "force-dynamic";

/**
 * Signups and waitlist, for the person running this.
 *
 * The data is only fetched once the admin cookie checks out — a locked
 * visitor's response never contains a single name or email address, rather
 * than fetching and hiding them.
 */
export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");

  if (!(await isAdminUnlocked())) {
    return <AdminUnlock configured={adminEnabled()} />;
  }

  const data = await getAdminOverview();
  return <AdminOverviewView data={data} />;
}
