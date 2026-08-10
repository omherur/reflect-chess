import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { getPerformanceData } from "@/server/rating";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const data = await getPerformanceData(user.id);
  return NextResponse.json(data);
}
