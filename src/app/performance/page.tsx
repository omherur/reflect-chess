import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { getPerformanceData } from "@/server/rating";
import { PerformanceView } from "@/components/performance/performance-view";

export const dynamic = "force-dynamic";

export default async function PerformancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const data = await getPerformanceData(user.id);
  return <PerformanceView data={data} />;
}
