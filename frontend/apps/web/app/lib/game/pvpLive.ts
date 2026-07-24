"use client";

import type { MoveClassKey, TimeControl } from "./types";
import type { WireMove, WirePersona } from "./live";

/**
 * Wire protocol for the ranked PvP WebSocket backend (`backend/app/protocol.py`,
 * `/ws/match?token=…`). A connection either resumes an in-progress match
 * (`match_state`) or sends one intent — `queue`, `create_invite`, or `join_invite` —
 * then plays lockstep `move`s until a `match_finish`.
 */

export interface WireOpponent {
  username: string | null;
  display_name: string | null;
  avatar_path: string | null;
  /** Null on unrated (friend) matches. */
  ranked_elo: number | null;
}

/** A move in the OPPONENT's conversation. `content` is null while the live-transcript
 * gate (a future premium) is closed — glyph + swing still flow for the eval bar. */
export interface WireOppMove {
  position: number;
  speaker: "You" | "Match";
  content: string | null;
  classification?: MoveClassKey | null;
  swing?: number | null;
}

interface MatchMeta {
  match_id: string;
  your_side: "a" | "b";
  rated: boolean;
  time_control: TimeControl;
  time: number; // base Fischer bank per player, ms
  increment: number; // ms per submitted move
  max_exchanges: number;
  persona: WirePersona;
  opponent: WireOpponent;
}

export type PvpServerMessage =
  | { type: "queued"; time_control: TimeControl }
  | { type: "cancelled" }
  | { type: "invite_created"; code: string; time_control: TimeControl }
  | ({ type: "match_found" } & MatchMeta)
  | ({
      type: "match_state";
      your_moves: WireMove[];
      opp_moves: WireOppMove[];
      turn: "you" | "opponent" | "processing";
      your_time_left: number;
      opp_time_left: number;
    } & MatchMeta)
  | {
      type: "response";
      content: string;
      classification: MoveClassKey;
      swing: number;
      time_left: number;
    }
  | { type: "opp_move"; move: WireOppMove; reply: WireOppMove }
  | { type: "turn"; turn: "you" | "opponent"; time_left: number }
  | {
      type: "match_finish";
      match_id: string;
      result: "win" | "loss" | "draw";
      end_reason: string;
      your_accuracy: number;
      opp_accuracy: number;
      rating_delta: number;
      your_moves: WireMove[];
      opp_moves: WireMove[]; // full content — the post-match reveal
      opponent: WireOpponent;
      title: string;
      description: string;
      rating: number; // your post-match ranked elo (unchanged on unrated); prev = rating - delta
      archetype_id: string; // pre-generated game_archetypes.id for YOUR side — awaited over realtime
    }
  | { type: "error"; code: string; message: string };

// Derived from the solo WS base (`NEXT_PUBLIC_BACKEND_WS_URL`) by appending `/match`, so a
// single env var configures both endpoints and they can't drift. An explicit
// `NEXT_PUBLIC_BACKEND_WS_MATCH_URL` still overrides if the two ever need to diverge.
const WS_MATCH_URL =
  process.env.NEXT_PUBLIC_BACKEND_WS_MATCH_URL ??
  (process.env.NEXT_PUBLIC_BACKEND_WS_URL
    ? `${process.env.NEXT_PUBLIC_BACKEND_WS_URL}/match`
    : "ws://127.0.0.1:8000/ws/match");

export function pvpSocketUrl(token: string): string {
  const sep = WS_MATCH_URL.includes("?") ? "&" : "?";
  return `${WS_MATCH_URL}${sep}token=${encodeURIComponent(token)}`;
}

export function sendQueue(socket: WebSocket, timeControl: TimeControl): void {
  socket.send(JSON.stringify({ type: "queue", time_control: timeControl }));
}

export function sendCreateInvite(socket: WebSocket, timeControl: TimeControl): void {
  socket.send(JSON.stringify({ type: "create_invite", time_control: timeControl }));
}

export function sendJoinInvite(socket: WebSocket, code: string): void {
  socket.send(JSON.stringify({ type: "join_invite", code }));
}

export function sendCancel(socket: WebSocket): void {
  socket.send(JSON.stringify({ type: "cancel" }));
}
