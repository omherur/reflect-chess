"use client";

import type { KeyMomentPublic, KeyMomentVerdict } from "@/lib/types";
import { classificationBorderClass, classificationClass, classificationLabel } from "@/lib/format";
import { CheckCircle2 } from "lucide-react";

interface MomentListProps {
  keyMoments: (KeyMomentPublic | KeyMomentVerdict)[];
  currentPly: number;
  onSelect: (ply: number) => void;
}

function isVerdict(km: KeyMomentPublic | KeyMomentVerdict): km is KeyMomentVerdict {
  return "classification" in km;
}

/**
 * Key-moments-only sidebar, always in chronological (ply) order — the
 * order the server sends them in, matching the game's actual sequence.
 * Severity is conveyed through color, not by reordering: a colored
 * left-edge strip plus a classification badge, once a moment has been
 * reflected on. Before that, only the move itself and review status are
 * shown — no classification, tier, or color hints at severity, same as
 * everywhere else in the app.
 */
export function MomentList({ keyMoments, currentPly, onSelect }: MomentListProps) {
  return (
    <div className="flex flex-col gap-1">
      <p className="mb-1 px-1 text-xs font-medium uppercase tracking-wide text-stone-500">
        Key moments
      </p>
      {keyMoments.map((km) => {
        const moveNumber = Math.ceil(km.ply / 2);
        const color = km.ply % 2 === 1 ? "w" : "b";
        const active = km.ply === currentPly;
        const reviewed = km.reviewStatus === "REVIEWED" && isVerdict(km);
        const borderClass = reviewed ? classificationBorderClass(km.classification) : "border-l-amber-300";

        return (
          <button
            key={km.id}
            onClick={() => onSelect(km.ply)}
            className={`flex items-center gap-2 rounded-md border-l-4 px-3 py-2 text-left text-sm transition-colors ${borderClass} ${
              active ? "bg-primary text-primary-foreground" : "hover:bg-stone-100"
            }`}
          >
            <span className="flex-1 truncate">
              {moveNumber}
              {color === "w" ? "." : "…"} {km.originalSan}
            </span>

            {reviewed ? (
              <span className="flex items-center gap-1">
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                    active
                      ? "border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground"
                      : classificationClass(km.classification)
                  }`}
                >
                  {classificationLabel(km.classification)}
                </span>
                <CheckCircle2 className={`size-3.5 ${active ? "text-primary-foreground/70" : "text-success"}`} />
              </span>
            ) : (
              <span
                className={`text-[10px] uppercase tracking-wide ${active ? "text-primary-foreground" : "text-stone-400"}`}
              >
                Awaiting
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
