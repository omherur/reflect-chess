import Link from "next/link";
import type { AdminOverview } from "@/server/admin";
import { AdminLockButton } from "./admin-lock-button";

function formatWhen(date: Date): string {
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="font-mono text-2xl font-semibold">{value}</div>
      <div className="mt-0.5 text-xs text-stone-500">{label}</div>
    </div>
  );
}

function SectionHeading({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-3 flex items-baseline gap-2">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <span className="text-sm text-stone-500">{count}</span>
    </div>
  );
}

/**
 * Server-rendered on purpose — this is a list of names and email addresses,
 * so there's no reason to ship it through a client fetch or leave it sitting
 * in a JSON payload in the page source.
 */
export function AdminOverviewView({ data }: { data: AdminOverview }) {
  const { users, waitlist, totals } = data;

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
          <p className="mt-1 text-sm text-stone-500">
            Everyone who has signed up, and everyone waiting on the full release.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/explanations"
            className="text-sm font-medium text-stone-500 hover:text-foreground"
          >
            Explanation log
          </Link>
          <AdminLockButton />
        </div>
      </div>

      <div className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Accounts" value={totals.users} />
        <Stat label="Games" value={totals.games} />
        <Stat label="Reflections" value={totals.reflections} />
        <Stat label="Waitlist" value={totals.waitlist} />
        <Stat label="Waitlist, 7 days" value={totals.waitlistLast7Days} />
      </div>

      <section className="mb-10">
        <SectionHeading title="Accounts" count={users.length} />
        {users.length === 0 ? (
          <p className="text-sm text-stone-500">Nobody has signed up yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="bg-muted/60 text-left text-xs text-stone-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Signed up</th>
                  <th className="px-4 py-2 text-right font-medium">Games</th>
                  <th className="px-4 py-2 text-right font-medium">Reflections</th>
                  <th className="px-4 py-2 font-medium">Chess.com</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-border">
                    <td className="px-4 py-2 font-medium">{u.name}</td>
                    <td className="px-4 py-2 text-stone-500">{formatWhen(u.createdAt)}</td>
                    <td className="px-4 py-2 text-right font-mono">{u.gameCount}</td>
                    <td className="px-4 py-2 text-right font-mono">{u.reflectionCount}</td>
                    <td className="px-4 py-2 text-stone-500">{u.chessAccount ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <SectionHeading title="Waitlist" count={waitlist.length} />
        {waitlist.length === 0 ? (
          <p className="text-sm text-stone-500">No waitlist signups yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[32rem] text-sm">
              <thead className="bg-muted/60 text-left text-xs text-stone-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">Came from</th>
                  <th className="px-4 py-2 font-medium">Signed up</th>
                </tr>
              </thead>
              <tbody>
                {waitlist.map((w) => (
                  <tr key={w.id} className="border-t border-border">
                    <td className="px-4 py-2 font-mono text-[0.8rem]">{w.email}</td>
                    <td className="px-4 py-2 text-stone-500">{w.source}</td>
                    <td className="px-4 py-2 text-stone-500">{formatWhen(w.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
