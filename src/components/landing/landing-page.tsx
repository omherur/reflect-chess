import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ExplanationCard } from "@/components/explanation-card";
import { LogoFigure, LogoWordmark } from "@/components/brand/logo";
import { WaitlistForm } from "@/components/landing/waitlist-form";

/**
 * The one thing on the page that has to be unmissable. Deliberately built on
 * --primary rather than a custom gold gradient: the theme tokens are already
 * contrast-checked in both modes (see src/lib/contrast.test.ts), and a
 * hand-rolled gradient here would quietly opt out of that. The "pop" comes
 * from size, a coloured shadow, a ring, and lift on hover instead.
 */
const PRIMARY_CTA_CLASS =
  "h-12 w-full px-8 text-base font-semibold shadow-lg shadow-primary/30 ring-2 ring-primary/25 " +
  "transition-transform hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/40 sm:w-auto";

/**
 * Still clearly second to the primary, but not a flat outline that reads as
 * disabled next to it — both CTAs are meant to be noticed.
 */
const SECONDARY_CTA_CLASS =
  "h-12 w-full border-primary/45 px-8 text-base font-semibold shadow-sm transition-transform " +
  "hover:-translate-y-0.5 hover:border-primary/70 hover:bg-primary/10 sm:w-auto";
import {
  Download,
  MessageCircleHeart,
  Eye,
  LineChart,
  Target,
  TriangleAlert,
  Lightbulb,
  Sparkles,
} from "lucide-react";

const STEPS = [
  {
    icon: Download,
    title: "Import your games",
    body: "Connect your Chess.com account or paste a PGN. New games sync automatically after that.",
  },
  {
    icon: MessageCircleHeart,
    title: "Record your thinking, before reveal",
    body: "At each key moment, write what you were actually thinking and what you'd play with a second look — before the engine says a word.",
  },
  {
    icon: Eye,
    title: "See the verdict, and why",
    body: "Only now does the engine's take appear — with a concrete explanation of the chess mechanics, not just an evaluation number.",
  },
  {
    icon: LineChart,
    title: "See your patterns over time",
    body: "The same kind of mistake, showing up across games, is easy to miss one at a time and hard to miss in aggregate.",
  },
];

const DIFFERENTIATORS = [
  {
    title: "Engine-only tools grade the move. ReflectChess grades the gap.",
    body: "A best-move arrow and an eval bar tell you what was wrong. They never find out what you actually believed when you played it — which is the only thing you can actually fix.",
  },
  {
    title: "The reveal comes second, not first.",
    body: "If you see the verdict before you've committed to your own reasoning, you're not reflecting — you're just reading. The order is the whole point.",
  },
  {
    title: "Explanations name the pieces and squares, not just the score.",
    body: "\"+1.4 vs -3.0\" isn't a reason. A hanging piece on a named square, a pin along a named diagonal — that's something you can actually learn from next time.",
  },
];

export function LandingPage() {
  return (
    <div className="flex flex-col">
      {/* Hero — sized to fit a laptop viewport without scrolling: the
          one-liner, the sub-head, both CTAs and the waitlist all have to be
          visible on open, so the mark is a background watermark rather than a
          block of vertical space, and the wordmark carries the brand instead. */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <LogoFigure className="h-[34rem] w-auto opacity-[0.055] dark:opacity-[0.07]" />
        </div>

        <div className="relative mx-auto w-full max-w-4xl px-6 py-12 text-center sm:py-16">
          <LogoWordmark className="text-lg sm:text-xl" />
          <h1 className="mt-7 text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
            Chess engines analyze the position.
            <br />
            ReflectChess analyzes <span className="text-[var(--brand-gold-2)]">the player</span>.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            Record your thought process before the engine. Learn from your reasoning, not just your
            mistakes.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/signup" className="w-full sm:w-auto">
              <Button size="lg" className={PRIMARY_CTA_CLASS}>
                Get started — it&apos;s free!
              </Button>
            </Link>
            <Link href="/signup?demo=1" className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className={SECONDARY_CTA_CLASS}>
                Analyze a free demo game
              </Button>
            </Link>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Sign up and your first game comes back analyzed — every mistake, and the thinking
            behind it.
          </p>

          {/* No intro line here on purpose — the button label and the form's
              own helper text already say what this is, and the hero has to
              stay above the fold on a 640px-tall viewport. */}
          <div className="mt-8 flex flex-col items-center border-t border-border/70 pt-6">
            <WaitlistForm source="landing-hero" />
          </div>
        </div>
      </section>

      {/* Walkthrough */}
      <section className="border-y border-border bg-card/60">
        <div className="mx-auto w-full max-w-5xl px-6 py-16">
          <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
            How it actually works
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <div key={step.title} className="flex flex-col items-start gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <step.icon className="size-5" />
                </div>
                <div className="text-xs font-medium text-muted-foreground">Step {i + 1}</div>
                <h3 className="text-base font-semibold">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Real example */}
      <section className="mx-auto w-full max-w-4xl px-6 py-16">
        <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
          A real explanation, not a mockup
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
          This is the actual four-section card every key moment gets, with real sample content
          from a real game.
        </p>

        <div className="mt-8 rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="rounded-full border border-[#B8860B]/35 bg-[#B8860B]/12 px-2.5 py-1 text-xs font-medium text-[#8A6108]">
              Blunder
            </span>
            <span>You played Nd4 · Engine&apos;s best was Nc2</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ExplanationCard
              icon={Target}
              label="What your move did"
              text="Nd4 heads for a strong, centralized outpost, eyeing b3, c2, and f5 — a reasonable-looking plan on its own."
              tint="bg-primary/8 border-primary/20"
              iconClass="text-primary"
            />
            <ExplanationCard
              icon={TriangleAlert}
              label="What it missed"
              text="The bishop on g7 already controls the long dark-square diagonal all the way to d4, and nothing White has covers that square. Bxd4 just wins the knight outright, for free."
              tint="bg-[#B8860B]/10 border-[#B8860B]/25"
              iconClass="text-[#8A6108]"
            />
            <ExplanationCard
              icon={Lightbulb}
              label="Why the recommended move is stronger"
              text="Nc2 aims at the exact same outpost but gets there through a square the bishop doesn't touch. The engine's line runs Nc2 Rb8 Nd4 — the knight reaches d4 two moves later, completely safely. (engine: +0.3 vs -3.1)"
              tint="bg-[#2F4F3D]/10 border-[#2F4F3D]/25"
              iconClass="text-[#2F4F3D]"
            />
            <ExplanationCard
              icon={Sparkles}
              label="What to remember"
              text="Before parking a piece on a square, trace every diagonal running through it — a long-diagonal bishop is exactly the kind of thing that's invisible if you're only looking near your own pieces."
              tint="bg-[#6B4A6B]/10 border-[#6B4A6B]/25"
              iconClass="text-[#6B4A6B]"
            />
          </div>
        </div>
      </section>

      {/* Why this is different */}
      <section className="border-y border-border bg-card/60">
        <div className="mx-auto w-full max-w-4xl px-6 py-16">
          <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
            Why this is different
          </h2>
          <div className="mt-10 flex flex-col gap-8">
            {DIFFERENTIATORS.map((d) => (
              <div key={d.title}>
                <h3 className="text-lg font-semibold">{d.title}</h3>
                <p className="mt-1 text-muted-foreground">{d.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Founder note */}
      <section className="mx-auto w-full max-w-2xl px-6 py-16">
        <h2 className="text-2xl font-semibold tracking-tight">A note from the person who built this</h2>
        <div className="mt-4 flex flex-col gap-4 text-muted-foreground">
          <p>
            I got tired of finishing a game, running it through an engine, and staring at a red
            arrow that told me a move was bad — without ever being asked what I actually thought
            was happening on the board when I played it.
          </p>
          <p>
            That gap between what you believed and what was true is where the actual learning
            lives. Most tools skip straight past it. ReflectChess is my attempt to slow that step
            down instead of skipping it.
          </p>
          <p>
            This is a small, early product. It doesn&apos;t have a user base or a leaderboard to
            show you — just a mechanism I think is worth trying, built by someone who plays and
            loses plenty of games himself.
          </p>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="border-t border-border">
        <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 px-6 py-16 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">
            Play your next game. Write down what you were thinking. See what you find.
          </h2>
          <Link href="/signup">
            <Button size="lg" className={PRIMARY_CTA_CLASS}>
              Get started — it&apos;s free!
            </Button>
          </Link>

          <div className="flex w-full flex-col items-center gap-4 border-t border-border pt-8">
            <div>
              <h3 className="text-base font-semibold">Or wait for the full release</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                What&apos;s here works today, but it&apos;s early. Leave your email and we&apos;ll
                tell you once it&apos;s finished.
              </p>
            </div>
            <WaitlistForm source="landing-closing" />
          </div>
        </div>
      </section>
    </div>
  );
}
