"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/app/components/ui/AppShell";
import { createClient } from "@/app/lib/supabase/client";
import { MOVE_CLASSES, type MoveClassKey } from "@/app/lib/game/service";
import type { GameAnalysisMoveRow, GameAnalysisRow } from "@/app/lib/supabase/types";

/** Derive the move rank from the stored swing (eval_delta/10) — mirrors backend grading.py. */
function classifyKey(evalDelta: number | null): MoveClassKey {
  const swing = (evalDelta ?? 0) / 10;
  if (swing >= 2.0) return "brilliant";
  if (swing >= 1.0) return "great";
  if (swing >= 0.2) return "good";
  if (swing >= -1.0) return "inaccuracy";
  if (swing >= -2.5) return "mistake";
  return "blunder";
}

/**
 * Analysis View — STUB. A functional placeholder that renders the deep-review data (title,
 * description, tags, and each re-scored "You" move) until the Game Review mock exists and the
 * real screen is built. Reads the owner-scoped rows with the browser client (RLS-gated).
 */
export default function AnalysisPage() {
  const router = useRouter();
  const id = String(useParams().id);
  const [analysis, setAnalysis] = useState<GameAnalysisRow | null>(null);
  const [moves, setMoves] = useState<GameAnalysisMoveRow[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: a } = await supabase
        .from("game_analyses")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (!a) {
        setState("missing");
        return;
      }
      const { data: m } = await supabase
        .from("game_analysis_moves")
        .select("*")
        .eq("analysis_id", id)
        .order("position");
      setAnalysis(a as GameAnalysisRow);
      setMoves((m ?? []) as GameAnalysisMoveRow[]);
      setState("ready");
    })();
  }, [id]);

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-8">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-mute">
            Game review · stub
          </span>
          <button
            type="button"
            onClick={() => router.push("/play")}
            className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.06em] text-rosy-deep hover:text-rosy"
          >
            New game →
          </button>
        </div>

        {state === "loading" && (
          <p className="font-mono text-[13px] text-ink-mute">Loading review…</p>
        )}
        {state === "missing" && (
          <p className="font-mono text-[13px] text-m-blunder">
            Analysis not found (or not yours).
          </p>
        )}

        {state === "ready" && analysis && (
          <>
            <header className="flex flex-col gap-2">
              <h1 className="text-[28px] font-extrabold tracking-[-0.035em]">{analysis.title}</h1>
              <p className="text-[15px] text-ink-soft">{analysis.description}</p>
              {analysis.tags.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {analysis.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-cream-2 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-soft"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </header>

            <ol className="flex flex-col gap-3">
              {moves.map((move) => {
                const meta = MOVE_CLASSES[classifyKey(move.eval_delta)];
                const swing = (move.eval_delta ?? 0) / 10;
                return (
                  <li
                    key={move.id}
                    className="rounded-2xl border border-ink/[0.08] bg-paper p-4 shadow-[var(--sh-1)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[14px] text-ink">“{move.content}”</p>
                      <span
                        className="shrink-0 rounded-full px-2 py-1 font-mono text-[11px] font-bold text-white"
                        style={{ background: meta.color }}
                      >
                        {meta.glyph} {swing >= 0 ? "+" : ""}
                        {swing.toFixed(1)}
                      </span>
                    </div>
                    <p className="mt-2 text-[13px] text-ink-soft">{move.comment}</p>
                    {move.best_line && (
                      <p className="mt-2 rounded-lg bg-rosy-tint/60 px-3 py-2 text-[13px] text-ink">
                        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-rosy-deep">
                          Best line ·{" "}
                        </span>
                        {move.best_line}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </div>
    </AppShell>
  );
}
