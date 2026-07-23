"use client";

import { createClient } from "../supabase/client";
import type { MoveClassKey, WireMove } from "@matedate/visuals";

/**
 * Wire protocol for the solo PvE WebSocket backend (`backend/app/protocol.py`).
 * The match screen connects to `/ws?token=<supabase access token>`, receives a
 * `new_game` (or `game_state` on reconnect), sends `move`s, and receives graded
 * `response`s until a `finish`.
 *
 * `WireMove` is the shared card/graph input, so it lives in `@matedate/visuals`; re-exported here
 * so existing `@/app/lib/game/live` imports keep resolving.
 */

export type { WireMove };

export interface WirePersona {
  slug: string;
  name: string;
  hint: string;
  opening_line: string;
  suggested_messages: string[];
}

export type ServerMessage =
  | { type: "new_game"; persona: WirePersona; time: number }
  | {
      type: "game_state";
      persona: WirePersona;
      moves: WireMove[];
      time: number;
      time_left: number;
      status: string;
    }
  | {
      type: "response";
      content: string;
      classification: MoveClassKey;
      swing: number;
      time_left: number;
    }
  | {
      type: "finish";
      end_reason: string;
      accuracy: number;
      rating_delta: number;
      moves: WireMove[];
      title: string;
      description: string;
      game_id: string;
      rating: number; // post-finish rizz rating (elo); previous = rating - rating_delta
      archetype_id: string; // pre-generated game_archetypes.id — await this row over realtime
    }
  | { type: "error"; code: string; message: string };

const WS_URL = process.env.NEXT_PUBLIC_BACKEND_WS_URL ?? "ws://127.0.0.1:8000/ws";

/**
 * Resolve a Supabase access token for the WS handshake. Falls back to an anonymous
 * session (mirrors onboarding's "skip") so a first-time visitor can still play.
 */
export async function resolveAccessToken(): Promise<string> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) return session.access_token;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  if (!data.session?.access_token) throw new Error("could not establish a session");
  return data.session.access_token;
}

export function matchSocketUrl(token: string): string {
  const sep = WS_URL.includes("?") ? "&" : "?";
  return `${WS_URL}${sep}token=${encodeURIComponent(token)}`;
}

export function sendMove(socket: WebSocket, content: string): void {
  socket.send(JSON.stringify({ type: "move", content }));
}
