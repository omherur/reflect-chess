-- A read-only mirror of subscription state, for querying billing from the
-- Supabase dashboard.
--
-- IMPORTANT: this table is NOT the source of truth. Stripe is, and the local
-- Prisma `User` row is the application's copy of it. Everything here is
-- written by src/server/billing/supabase-mirror.ts after the local row has
-- already been updated, so a Supabase outage can never stop a paying customer
-- being provisioned. Treat a disagreement between this table and the app as
-- "this table is stale", and repair it with:
--
--     npx tsx scripts/reconcile-supabase-subscriptions.ts
--
-- One row per application user, not per Stripe subscription: the local model
-- holds a single subscription per user, so `app_user_id` is the natural key
-- and re-subscribing after a cancellation updates the same row rather than
-- accumulating history.

create table if not exists public.subscriptions (
  -- The local Prisma User.id (a cuid, hence text not uuid).
  app_user_id            text        primary key,
  -- The Supabase auth user, when there is one. Nullable because seed and
  -- fixture accounts never authenticate.
  supabase_user_id       uuid        references auth.users (id) on delete cascade,
  email                  text,
  stripe_customer_id     text,
  stripe_subscription_id text,
  -- Stripe's own status string, verbatim: active | trialing | past_due |
  -- canceled | unpaid | incomplete | incomplete_expired | paused.
  status                 text,
  -- What that status actually entitles: 'free' or 'pro'. Denormalised on
  -- purpose so a dashboard query doesn't have to re-implement the access
  -- rule that src/lib/plans.ts owns.
  plan                   text        not null default 'free',
  price_id               text,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean     not null default false,
  -- When the mirror last wrote this row. If this is old, the row is suspect.
  synced_at              timestamptz not null default now()
);

create index if not exists subscriptions_supabase_user_id_idx
  on public.subscriptions (supabase_user_id);
create index if not exists subscriptions_status_idx
  on public.subscriptions (status);

-- RLS is not optional here. Without it the anon key — which ships to every
-- browser by design — could read every customer's billing state. The service
-- role used by the mirror bypasses RLS, so writes are unaffected.
alter table public.subscriptions enable row level security;

drop policy if exists "read own subscription" on public.subscriptions;
create policy "read own subscription"
  on public.subscriptions
  for select
  using (auth.uid() = supabase_user_id);

-- No insert/update/delete policies on purpose: nothing but the service role
-- may write this table, and the service role ignores RLS entirely.
