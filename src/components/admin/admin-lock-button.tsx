"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";

/** Clears the admin cookie — useful on a shared or borrowed machine. */
export function AdminLockButton() {
  const router = useRouter();

  async function lock() {
    await fetch("/api/admin/unlock", { method: "DELETE" });
    router.refresh();
  }

  return (
    <Button variant="outline" size="sm" onClick={lock}>
      <Lock className="size-3.5" />
      Lock
    </Button>
  );
}
