import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidEmail, normalizeEmail } from "@/lib/email";

const MAX_SOURCE_LENGTH = 40;

/**
 * Pre-launch waitlist signup. Public on purpose — no session required, since
 * the whole point is capturing people who haven't made an account.
 *
 * Signing up twice is a success, not an error: `upsert` keeps the original
 * `createdAt` (so waitlist position isn't lost by re-submitting) and the
 * response says whether they were already on the list, which is all the UI
 * needs to word its confirmation honestly.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const rawEmail = typeof body?.email === "string" ? body.email : "";
  const rawSource = typeof body?.source === "string" ? body.source : "landing";

  if (!rawEmail.trim()) {
    return NextResponse.json({ error: "Enter your email to join the waitlist." }, { status: 400 });
  }
  if (!isValidEmail(rawEmail)) {
    return NextResponse.json({ error: "That doesn't look like a valid email address." }, { status: 400 });
  }

  const email = normalizeEmail(rawEmail);
  const source = rawSource.slice(0, MAX_SOURCE_LENGTH) || "landing";

  const existing = await prisma.waitlistSignup.findUnique({ where: { email } });
  await prisma.waitlistSignup.upsert({
    where: { email },
    create: { email, source },
    update: {}, // keep the original signup time and source
  });

  return NextResponse.json({ ok: true, alreadyOnList: existing !== null });
}
