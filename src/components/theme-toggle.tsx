"use client";

import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";

/**
 * A reading room at night, not a generic inverted theme — same warm mood
 * either way.
 *
 * The icon is chosen by CSS, not by `resolvedTheme`, on purpose. `resolvedTheme`
 * is undefined on the server and only becomes real on the client (next-themes
 * reads localStorage/matchMedia in its state initializer), so rendering from it
 * hydrates a Sun over a server-rendered Moon for anyone resolving to dark — a
 * real mismatch, and `suppressHydrationWarning` on <html> only covers that
 * element's own attributes, not this subtree. Rendering both icons and letting
 * the `dark` class decide is deterministic across server and client, and picks
 * the right one before first paint (next-themes sets the class in a blocking
 * inline script), so there's no placeholder flash either.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Toggle dark mode"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Moon className="size-4 dark:hidden" />
      <Sun className="hidden size-4 dark:block" />
    </Button>
  );
}
