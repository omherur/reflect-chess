import { getCurrentUser } from "@/server/auth";
import { getDashboardData } from "@/server/dashboard";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { LandingPage } from "@/components/landing/landing-page";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  const user = await getCurrentUser();
  if (!user) return <LandingPage />;

  const data = await getDashboardData();
  return <DashboardView initialData={data} />;
}
