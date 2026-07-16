"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MOVE_CLASSES,
  type GradedMove,
  type MoveClassKey,
  type Persona,
  type TimeControl,
} from "@/app/lib/game/service";
import { resolveAccessToken, sendMove, type WireMove } from "@/app/lib/game/live";
import {
  pvpSocketUrl,
  sendCancel,
  sendCreateInvite,
  sendJoinInvite,
  sendQueue,
  type PvpServerMessage,
  type WireOppMove,
  type WireOpponent,
} from "@/app/lib/game/pvpLive";
import { useMatchClock } from "./useMatchClock";
import { playSound, preloadSounds } from "@/app/lib/sound";
import type { Message } from "./useMatchGame";

/** What this socket is here to do, derived from the /match query params. */
export type PvpAction =
  | { kind: "queue"; tc: TimeControl }
  | { kind: "create"; tc: TimeControl }
  | { kind: "join"; code: string };

export type PvpPhase =
  | "connecting"
  | "searching"
  | "inviteWaiting"
  | "intro"
  | "playing"
  | "finished";

export interface PvpOpponent {
  username: string | null;
  displayName: string | null;
  avatarPath: string | null;
  rankedElo: number | null;
}

/** The finished-match payload that drives the PvP result modal. */
export interface PvpResult {
  matchId: string;
  result: "win" | "loss" | "draw";
  endReason: string;
  title: string;
  description: string;
  yourAccuracy: number;
  oppAccuracy: number;
  ratingDelta: number;
  rated: boolean;
  interest: number;
  yourMoves: WireMove[];
  oppMoves: WireMove[]; // full content — the post-match reveal
  opponent: PvpOpponent;
}

const BASE_INTEREST = 58;
const clamp = (v: number) => Math.max(2, Math.min(98, v));

function toPersona(p: { slug: string; name: string; hint: string; opening_line: string; suggested_messages: string[] }): Persona {
  return {
    slug: p.slug,
    name: p.name,
    hint: p.hint,
    openingLine: p.opening_line,
    suggestions: p.suggested_messages ?? [],
  };
}

function toOpponent(o: WireOpponent): PvpOpponent {
  return {
    username: o.username,
    displayName: o.display_name,
    avatarPath: o.avatar_path,
    rankedElo: o.ranked_elo,
  };
}

/**
 * Drives the PvP match screen off `/ws/match`: matchmaking / friend invites, the lockstep
 * turn state, both server-authoritative clocks (display-only here), the opponent's gated
 * move feed, and the finish payload. Mirrors `useMatchGame`, which stays solo-only.
 */
export function usePvpGame(action: PvpAction) {
  const [phase, setPhase] = useState<PvpPhase>("connecting");
  const [persona, setPersona] = useState<Persona | null>(null);
  const [opponent, setOpponent] = useState<PvpOpponent | null>(null);
  const [rated, setRated] = useState(true);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [oppMoves, setOppMoves] = useState<WireOppMove[]>([]);
  const [turn, setTurn] = useState<"you" | "opponent" | "processing">("opponent");
  const [typing, setTyping] = useState(false);
  const [interest, setInterest] = useState(BASE_INTEREST);
  const [oppInterest, setOppInterest] = useState(BASE_INTEREST);
  const [yourAcc, setYourAcc] = useState(0);
  const [oppAcc, setOppAcc] = useState(0);
  const [verdict, setVerdict] = useState<{ id: number; classKey: MoveClassKey; swing: number } | null>(null);
  const [flagged, setFlagged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [result, setResult] = useState<PvpResult | null>(null);

  const idRef = useRef(0);
  const nextId = useCallback(() => ++idRef.current, []);
  const socketRef = useRef<WebSocket | null>(null);
  const budgetRef = useRef(40); // base bank (s), from the server
  const pendingYouRef = useRef<number | null>(null);
  const overRef = useRef(false);
  const interestRef = useRef(BASE_INTEREST);
  const moveCountRef = useRef(0);
  const oppCountRef = useRef(0);
  // The first `turn` frame lands during the intro; hold it so beginPlay starts the right clock.
  const heldTurnRef = useRef<{ turn: "you" | "opponent"; timeLeft: number } | null>(null);
  const introRef = useRef(false);

  const appendMessage = useCallback(
    (msg: Omit<Message, "id">) => {
      const id = nextId();
      setMessages((prev) => [...prev, { ...msg, id }]);
      return id;
    },
    [nextId],
  );

  const handleFlag = useCallback(() => {
    // Local clock hit zero: the server's timer is authoritative and pushes the real
    // match_finish moments later; freeze the composer meanwhile.
    setTyping(false);
    setFlagged(true);
    appendMessage({ side: "system", text: "(you ran out of time — flag falls ⏱)" });
  }, [appendMessage]);

  const yourClock = useMatchClock(handleFlag, () => playSound("lowTime"));
  const oppClock = useMatchClock(() => {});
  const { start: startYour, stop: stopYour, set: setYour } = yourClock;
  const { start: startOpp, stop: stopOpp, set: setOpp } = oppClock;

  // Warm the sound clips as soon as the screen mounts, so nothing downloads lazily mid-match.
  useEffect(() => {
    preloadSounds();
  }, []);

  useEffect(() => {
    interestRef.current = interest;
  }, [interest]);

  const scoreYourMove = useCallback((classKey: MoveClassKey) => {
    moveCountRef.current += 1;
    const quality = MOVE_CLASSES[classKey].quality;
    setYourAcc((prev) => (prev * (moveCountRef.current - 1) + quality) / moveCountRef.current);
  }, []);

  const scoreOppMove = useCallback((classKey: MoveClassKey, swing: number) => {
    oppCountRef.current += 1;
    const quality = MOVE_CLASSES[classKey].quality;
    setOppAcc((prev) => (prev * (oppCountRef.current - 1) + quality) / oppCountRef.current);
    setOppInterest((v) => clamp(v + swing * 7));
  }, []);

  const applyTurn = useCallback(
    (who: "you" | "opponent", timeLeftMs: number) => {
      setTurn(who);
      const seconds = Math.max(1, Math.round(timeLeftMs / 1000));
      if (who === "you") {
        stopOpp();
        startYour(seconds);
      } else {
        stopYour();
        startOpp(seconds);
      }
    },
    [startYour, stopYour, startOpp, stopOpp],
  );

  const rebuildOwnThread = useCallback(
    (moves: WireMove[]) => {
      let running = BASE_INTEREST;
      let count = 0;
      let accSum = 0;
      const rebuilt: Message[] = moves.map((mv) => {
        if (mv.side === "You") {
          const swing = mv.swing ?? 0;
          running = clamp(running + swing * 7);
          if (mv.classification) {
            count += 1;
            accSum += MOVE_CLASSES[mv.classification].quality;
          }
          return {
            id: nextId(),
            side: "you" as const,
            text: mv.content,
            move: mv.classification ? { classKey: mv.classification, swing } : undefined,
          };
        }
        return { id: nextId(), side: "match" as const, text: mv.content };
      });
      moveCountRef.current = count;
      setMessages(rebuilt);
      setInterest(running);
      setYourAcc(count ? accSum / count : 0);
    },
    [nextId],
  );

  const rebuildOppThread = useCallback((moves: WireOppMove[]) => {
    let running = BASE_INTEREST;
    let count = 0;
    let accSum = 0;
    for (const mv of moves) {
      if (mv.speaker === "You" && mv.classification) {
        running = clamp(running + (mv.swing ?? 0) * 7);
        count += 1;
        accSum += MOVE_CLASSES[mv.classification].quality;
      }
    }
    oppCountRef.current = count;
    setOppMoves(moves);
    setOppInterest(running);
    setOppAcc(count ? accSum / count : 0);
  }, []);

  const handleMessage = useCallback(
    (msg: PvpServerMessage) => {
      switch (msg.type) {
        case "queued": {
          setPhase("searching");
          break;
        }
        case "cancelled": {
          setCancelled(true);
          break;
        }
        case "invite_created": {
          setInviteCode(msg.code);
          setPhase("inviteWaiting");
          break;
        }
        case "match_found": {
          budgetRef.current = Math.max(1, Math.round(msg.time / 1000));
          moveCountRef.current = 0;
          oppCountRef.current = 0;
          pendingYouRef.current = null;
          overRef.current = false;
          setPersona(toPersona(msg.persona));
          setOpponent(toOpponent(msg.opponent));
          setRated(msg.rated);
          setMessages([{ id: nextId(), side: "match", text: msg.persona.opening_line }]);
          setOppMoves([{ position: 0, speaker: "Match", content: null }]);
          setInterest(BASE_INTEREST);
          setOppInterest(BASE_INTEREST);
          setYourAcc(0);
          setOppAcc(0);
          setFlagged(false);
          setTyping(false);
          // Hold both clocks across the intro (the server bakes a matching grace into the
          // first deadline); beginPlay starts the right one from the held turn frame.
          setYour(budgetRef.current);
          setOpp(budgetRef.current);
          introRef.current = true;
          setPhase("intro");
          break;
        }
        case "match_state": {
          budgetRef.current = Math.max(1, Math.round(msg.time / 1000));
          pendingYouRef.current = null;
          overRef.current = false;
          setPersona(toPersona(msg.persona));
          setOpponent(toOpponent(msg.opponent));
          setRated(msg.rated);
          rebuildOwnThread(msg.your_moves);
          rebuildOppThread(msg.opp_moves);
          setFlagged(false);
          setTyping(false);
          introRef.current = false;
          setPhase("playing");
          if (msg.turn === "processing") {
            setTurn("processing");
            stopYour();
            stopOpp();
            setYour(Math.max(1, Math.round(msg.your_time_left / 1000)));
            setOpp(Math.max(1, Math.round(msg.opp_time_left / 1000)));
          } else if (msg.turn === "you") {
            setOpp(Math.max(0, Math.round(msg.opp_time_left / 1000)));
            applyTurn("you", msg.your_time_left);
          } else {
            setYour(Math.max(0, Math.round(msg.your_time_left / 1000)));
            applyTurn("opponent", msg.opp_time_left);
          }
          break;
        }
        case "response": {
          const graded: GradedMove = { classKey: msg.classification, swing: msg.swing };
          const youId = pendingYouRef.current;
          if (youId !== null) {
            setMessages((prev) => prev.map((m) => (m.id === youId ? { ...m, move: graded } : m)));
            pendingYouRef.current = null;
          }
          setVerdict({ id: nextId(), classKey: graded.classKey, swing: graded.swing });
          setInterest((v) => clamp(v + graded.swing * 7));
          scoreYourMove(graded.classKey);
          setTyping(false);
          playSound("capture");
          appendMessage({ side: "match", text: msg.content });
          // Your bank at rest for the next turn (leftover + increment); the clock itself
          // restarts when the server's `turn` frame says it's you again.
          setYour(Math.max(1, Math.round(msg.time_left / 1000)));
          break;
        }
        case "opp_move": {
          setOppMoves((prev) => [...prev, msg.move, msg.reply]);
          if (msg.move.classification) {
            scoreOppMove(msg.move.classification, msg.move.swing ?? 0);
          }
          break;
        }
        case "turn": {
          if (introRef.current) {
            heldTurnRef.current = { turn: msg.turn, timeLeft: msg.time_left };
          } else {
            applyTurn(msg.turn, msg.time_left);
          }
          break;
        }
        case "match_finish": {
          overRef.current = true;
          stopYour();
          stopOpp();
          setTyping(false);
          setFlagged(true);
          setYourAcc(msg.your_accuracy);
          setOppAcc(msg.opp_accuracy);
          setPhase("finished");
          if (msg.result === "win") playSound("victory");
          else if (msg.result === "loss") playSound("defeat");
          setResult({
            matchId: msg.match_id,
            result: msg.result,
            endReason: msg.end_reason,
            title: msg.title,
            description: msg.description,
            yourAccuracy: msg.your_accuracy,
            oppAccuracy: msg.opp_accuracy,
            ratingDelta: msg.rating_delta,
            rated,
            interest: interestRef.current,
            yourMoves: msg.your_moves,
            oppMoves: msg.opp_moves,
            opponent: msg.opponent ? toOpponent(msg.opponent) : (opponent ?? {
              username: null,
              displayName: null,
              avatarPath: null,
              rankedElo: null,
            }),
          });
          socketRef.current?.close(1000, "match over");
          break;
        }
        case "error": {
          // "busy" answers the intent we optimistically sent before learning the server was
          // resuming a live match — the match_state already superseded it.
          if (msg.code === "busy") break;
          if (
            phase === "connecting" ||
            phase === "searching" ||
            phase === "inviteWaiting"
          ) {
            setError(msg.message);
          } else {
            setTyping(false);
            pendingYouRef.current = null;
            appendMessage({ side: "system", text: `⚠ ${msg.message}` });
          }
          break;
        }
      }
    },
    [
      nextId,
      appendMessage,
      applyTurn,
      rebuildOwnThread,
      rebuildOppThread,
      scoreYourMove,
      scoreOppMove,
      stopYour,
      stopOpp,
      setYour,
      setOpp,
      rated,
      opponent,
      phase,
    ],
  );

  const handlerRef = useRef(handleMessage);
  useEffect(() => {
    handlerRef.current = handleMessage;
  }, [handleMessage]);

  const actionRef = useRef(action);

  // Open the socket once on mount; close it on unmount.
  useEffect(() => {
    let cancelledEffect = false;
    (async () => {
      try {
        const token = await resolveAccessToken();
        if (cancelledEffect) return;
        const socket = new WebSocket(pvpSocketUrl(token));
        socketRef.current = socket;
        socket.onopen = () => {
          if (cancelledEffect) return;
          // Declare intent straight away. If the server is resuming a live match instead,
          // it replies to this with a harmless "busy" error we ignore.
          const a = actionRef.current;
          if (a.kind === "queue") sendQueue(socket, a.tc);
          else if (a.kind === "create") sendCreateInvite(socket, a.tc);
          else sendJoinInvite(socket, a.code);
        };
        socket.onmessage = (event) => {
          try {
            handlerRef.current(JSON.parse(event.data) as PvpServerMessage);
          } catch {
            /* ignore malformed frames */
          }
        };
        socket.onclose = (event) => {
          if (cancelledEffect) return;
          if (event.code === 4401) {
            setError("Your session expired — refresh to sign back in.");
          } else if (event.code !== 4000 && !overRef.current) {
            setError("Connection lost. Refresh to reconnect.");
          }
        };
      } catch (err) {
        if (!cancelledEffect) setError(err instanceof Error ? err.message : "Could not connect.");
      }
    })();
    return () => {
      cancelledEffect = true;
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, []);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      const socket = socketRef.current;
      if (
        !trimmed ||
        flagged ||
        typing ||
        turn !== "you" ||
        !socket ||
        socket.readyState !== WebSocket.OPEN
      ) {
        return;
      }
      stopYour();
      setTurn("processing");
      const youId = appendMessage({ side: "you", text: trimmed });
      pendingYouRef.current = youId;
      setTyping(true);
      playSound("move");
      sendMove(socket, trimmed);
    },
    [flagged, typing, turn, appendMessage, stopYour],
  );

  const cancel = useCallback(() => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) sendCancel(socket);
    else setCancelled(true);
  }, []);

  // Called when the "opponent found" intro finishes: release the held first turn.
  const beginPlay = useCallback(() => {
    if (!introRef.current) return;
    introRef.current = false;
    setPhase("playing");
    const held = heldTurnRef.current;
    heldTurnRef.current = null;
    if (held) applyTurn(held.turn, held.timeLeft);
  }, [applyTurn]);

  const dismissResult = useCallback(() => setResult(null), []);

  const warnYour = yourClock.running && yourClock.remaining <= 10;
  const inputDisabled = flagged || typing || turn !== "you" || phase !== "playing";

  return {
    phase,
    persona,
    opponent,
    rated,
    inviteCode,
    suggestions: persona?.suggestions ?? [],
    messages,
    oppMoves,
    turn,
    typing,
    interest,
    oppInterest,
    yourAcc,
    oppAcc,
    verdict,
    flagged,
    error,
    cancelled,
    result,
    inputDisabled,
    yourClock: { remaining: yourClock.remaining, running: yourClock.running, warn: warnYour },
    oppClock: { remaining: oppClock.remaining, running: oppClock.running },
    send,
    cancel,
    beginPlay,
    dismissResult,
  };
}

export type PvpGame = ReturnType<typeof usePvpGame>;
