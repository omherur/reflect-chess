import { NextResponse } from "next/server";
import { getDashboardData } from "@/server/dashboard";

/** Refetch endpoint for the client-side dashboard view (e.g. after bulk analysis completes). */
export async function GET() {
  const data = await getDashboardData();
  return NextResponse.json(data);
}
