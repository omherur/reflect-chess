import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/server/auth";
import { createGameFromCandidate } from "@/server/games";
import { chesscomAdapter } from "@/lib/import/chesscom";
import { ImportError } from "@/lib/import/types";

const SYNC_LIMIT = 15;

/**
 * Auto-sync: pull the current user's linked Chess.com account's most recent
 * games and import any that aren't already here. Duplicate-import
 * prevention (by externalId) means this is safe to call repeatedly — it
 * only ever adds genuinely new games. Meant to run automatically on
 * dashboard load, not something the user has to trigger by hand.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const accounts = await prisma.chessAccount.findMany({
    where: { userId: user.id, platform: "chesscom" },
  });
  if (accounts.length === 0) {
    return NextResponse.json({ imported: 0, accounts: [] });
  }

  let imported = 0;
  const results: { username: string; imported: number; error?: string }[] = [];

  for (const account of accounts) {
    try {
      const candidates = await chesscomAdapter.fetchRecentGames(account.username, SYNC_LIMIT);
      let createdForAccount = 0;
      for (const candidate of candidates) {
        const { duplicate } = await createGameFromCandidate(user.id, candidate);
        if (!duplicate) createdForAccount++;
      }
      imported += createdForAccount;
      results.push({ username: account.username, imported: createdForAccount });
      await prisma.chessAccount.update({
        where: { id: account.id },
        data: { lastSyncedAt: new Date() },
      });
    } catch (err) {
      const message = err instanceof ImportError ? err.message : "Sync failed.";
      results.push({ username: account.username, imported: 0, error: message });
    }
  }

  return NextResponse.json({ imported, accounts: results });
}
