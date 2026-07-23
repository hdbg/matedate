"use client";

import { useEffect, useState } from "react";
import { useSupabase } from "@/app/providers/SupabaseProvider";
import type { ArchetypeJobRow, GameArchetypeRow } from "@/app/lib/supabase/types";
import { ARCHETYPES, type Archetype, type ArchetypeKey } from "./archetypes";

export type ArchetypeStatus = "loading" | "ready" | "failed";

export interface UseArchetypeResult {
  archetype: Archetype | null;
  status: ArchetypeStatus;
}

/** How long to wait for the archetype row before giving up and rendering the card without it.
 * The queue provides backpressure, so this is generous — it only covers a wedged/failed worker. */
const TIMEOUT_MS = 30_000;

function toArchetype(row: GameArchetypeRow): Archetype | null {
  const key = row.archetype as ArchetypeKey;
  if (!(key in ARCHETYPES)) return null;
  return {
    id: row.id,
    key,
    legendary: row.is_legendary,
    flavor: row.flavor_reason,
    memePositions: row.meme_positions ?? [],
  };
}

/**
 * Await the archetype row for a finished game/match. The backend mints its id at finish
 * (`archetypeId`) and the worker inserts it asynchronously; we catch-up query, then subscribe to
 * the realtime INSERT (owner RLS gates delivery). A terminal `failed` job — or a timeout —
 * resolves to `failed` so the loader never hangs. Pass a null id to stay idle (`loading`).
 */
export function useArchetype(archetypeId: string | null): UseArchetypeResult {
  const supabase = useSupabase();
  const [archetype, setArchetype] = useState<Archetype | null>(null);
  const [status, setStatus] = useState<ArchetypeStatus>("loading");

  useEffect(() => {
    if (!archetypeId) return;

    // Channel is created after awaits; a `cancelled` guard lets a torn-down mount (StrictMode
    // double-invoke) bail before subscribing (see useAnalysisNotifications). The reset to
    // loading/null happens inside the async body (not synchronously in the effect) so a changed
    // archetypeId re-shows the loader without a cascading-render lint warning.
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const settle = (row: GameArchetypeRow) => {
      const parsed = toArchetype(row);
      if (parsed) {
        setArchetype(parsed);
        setStatus("ready");
      } else {
        setStatus("failed");
      }
    };

    const timer = setTimeout(() => {
      if (!cancelled) setStatus((s) => (s === "ready" ? s : "failed"));
    }, TIMEOUT_MS);

    (async () => {
      setArchetype(null);
      setStatus("loading");
      const { data } = await supabase
        .from("game_archetypes")
        .select("*")
        .eq("id", archetypeId)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        settle(data as GameArchetypeRow);
        return; // already landed; no need to subscribe
      }

      channel = supabase
        .channel(`archetype:${archetypeId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "game_archetypes", filter: `id=eq.${archetypeId}` },
          (payload) => settle(payload.new as GameArchetypeRow),
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "archetype_jobs", filter: `archetype_id=eq.${archetypeId}` },
          (payload) => {
            if ((payload.new as ArchetypeJobRow).status === "failed") setStatus("failed");
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [supabase, archetypeId]);

  return { archetype, status };
}

/** A historic source to await a `game_archetypes` row for (profile "Share Card"). */
export type ArchetypeSource =
  | { kind: "game"; gameId: string }
  | { kind: "match"; matchId: string; side: "a" | "b" };

/**
 * Like `useArchetype`, but keyed off the SOURCE (a game / one PvP side) rather than a
 * pre-generated id — used when re-opening a card for a historic game whose archetype was
 * backfilled. Catch-up query on `game_archetypes` by source, then subscribe to its INSERT.
 */
export function useArchetypeBySource(source: ArchetypeSource | null): UseArchetypeResult {
  const supabase = useSupabase();
  const [archetype, setArchetype] = useState<Archetype | null>(null);
  const [status, setStatus] = useState<ArchetypeStatus>("loading");
  const key = source
    ? source.kind === "game"
      ? `game:${source.gameId}`
      : `match:${source.matchId}:${source.side}`
    : null;

  useEffect(() => {
    if (!source || !key) return;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const settle = (row: GameArchetypeRow) => {
      const parsed = toArchetype(row);
      if (parsed) {
        setArchetype(parsed);
        setStatus("ready");
      } else {
        setStatus("failed");
      }
    };

    const timer = setTimeout(() => {
      if (!cancelled) setStatus((s) => (s === "ready" ? s : "failed"));
    }, TIMEOUT_MS);

    (async () => {
      setArchetype(null);
      setStatus("loading");
      let query = supabase.from("game_archetypes").select("*");
      query =
        source.kind === "game"
          ? query.eq("game_id", source.gameId)
          : query.eq("match_id", source.matchId).eq("side", source.side);
      const { data } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (cancelled) return;
      if (data) {
        settle(data as GameArchetypeRow);
        return;
      }
      const filter =
        source.kind === "game"
          ? `game_id=eq.${source.gameId}`
          : `match_id=eq.${source.matchId}`;
      channel = supabase
        .channel(`archetype-src:${key}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "game_archetypes", filter },
          (payload) => {
            const row = payload.new as GameArchetypeRow;
            if (source.kind === "match" && row.side !== source.side) return;
            settle(row);
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [supabase, key, source]);

  return { archetype, status };
}
