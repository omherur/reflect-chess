import type { Metadata } from "next";
import Link from "next/link";
import { Inter, Newsreader, Geist_Mono } from "next/font/google";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { UserMenu } from "@/components/user-menu";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoMark } from "@/components/brand/logo";
import { getCurrentUser } from "@/server/auth";
import { isAdminUser } from "@/server/admin-auth";
import "./globals.css";

// Body text: a clean, neutral sans-serif.
const bodyFont = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

// Headings: a serif with real character — the "old chess book" feel.
const headingFont = Newsreader({
  variable: "--font-heading-serif",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

// Chess notation, moves, engine lines.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ReflectChess",
  description: "Capture what you were thinking, before the engine tells you what was true.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${bodyFont.variable} ${headingFont.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <header className="border-b border-border bg-card">
            <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
              <Link href="/" className="flex items-center gap-2.5">
                <LogoMark className="size-7" idPrefix="rc-header" />
                <span className="font-heading text-xl font-semibold tracking-tight">
                  ReflectChess
                </span>
              </Link>
              <div className="flex items-center gap-6">
                {user && (
                  <nav className="flex items-center gap-6 text-sm font-medium text-muted-foreground">
                    <Link href="/" className="hover:text-foreground">
                      Dashboard
                    </Link>
                    <Link href="/import" className="hover:text-foreground">
                      Import game
                    </Link>
                    <Link href="/performance" className="hover:text-foreground">
                      Performance
                    </Link>
                    {/* Only rendered for the allowlist — /admin 404s for
                        everyone else, so advertising it would be noise. */}
                    {isAdminUser(user) && (
                      <Link href="/admin" className="hover:text-foreground">
                        Admin
                      </Link>
                    )}
                  </nav>
                )}
                <ThemeToggle />
                {user ? (
                  <UserMenu name={user.name} />
                ) : (
                  <div className="flex items-center gap-2">
                    <Link href="/login">
                      <Button variant="ghost" size="sm">
                        Sign in
                      </Button>
                    </Link>
                    <Link href="/signup">
                      <Button size="sm">Sign up</Button>
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </header>
          <main className="flex flex-1 flex-col">{children}</main>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
