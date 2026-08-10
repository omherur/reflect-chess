"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export function UserMenu({ name }: { name: string }) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="flex items-center gap-2 text-sm text-stone-600">
      <span className="hidden sm:inline">{name}</span>
      <Button variant="ghost" size="sm" onClick={logout} disabled={loggingOut} className="gap-1.5">
        <LogOut className="size-3.5" />
        Log out
      </Button>
    </div>
  );
}
