"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export function UserMenu({ name }: { name: string }) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/signout", { method: "POST" });
      // Back to the landing page rather than the sign-in form: signing out
      // is not usually a prelude to signing straight back in.
      router.push("/");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="flex items-center gap-2 text-sm text-stone-600">
      <span className="hidden max-w-[12rem] truncate sm:inline">{name}</span>
      <Button variant="ghost" size="sm" onClick={signOut} disabled={signingOut} className="gap-1.5">
        <LogOut className="size-3.5" />
        {signingOut ? "Signing out…" : "Sign out"}
      </Button>
    </div>
  );
}
