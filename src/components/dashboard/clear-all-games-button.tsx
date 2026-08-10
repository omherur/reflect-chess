"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Trash2 } from "lucide-react";

export function ClearAllGamesButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function confirmClear() {
    setDeleting(true);
    try {
      const res = await fetch("/api/games", { method: "DELETE" });
      if (!res.ok) throw new Error("Could not clear games.");
      const data = await res.json();
      toast.success(`Cleared ${data.deleted} game${data.deleted === 1 ? "" : "s"}.`);
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not clear games.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" disabled={disabled} className="gap-2 text-red-700 hover:bg-red-50 hover:text-red-800">
            <Trash2 className="size-4" />
            Clear all games
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Clear all games?</DialogTitle>
          <DialogDescription>
            This will permanently delete every imported game, along with their moves, key
            moments, and reflections. <span className="font-medium text-foreground">This
            cannot be undone.</span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirmClear} disabled={deleting}>
            {deleting ? "Clearing…" : "Yes, delete everything"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
