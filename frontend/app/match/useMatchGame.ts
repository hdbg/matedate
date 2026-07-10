"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MOVE_CLASSES,
  type GradedMove,
  type MoveClassKey,
  type Persona,
  type Suggestion,
  type VersusMode,
} from "@/app/lib/game/service";
import { SUGGESTIONS } from "@/app/lib/game/engine";
import {
  matchSocketUrl,
  resolveAccessToken,
  sendMove,
  type ServerMessage,
  type WireMove,
  type WirePersona,
} from "@/app/lib/game/live";
import { useMatchClock } from "./useMatchClock";

export type MessageSide = "you" | "match" | "system";

export interface Message {
  id: number;
  side: MessageSide;
  text: string;
  move?: GradedMove;
}

export interface VerdictState {
  id: number;
  classKey: MoveClassKey;
  swing: number;
}

const BASE_INTEREST = 58;
const clamp = (v: number) => Math.max(2, Math.min(98, v));

function toPersona(p: WirePersona): Persona {
  return { slug: p.slug, name: p.name, hint: p.hint, openingLine: p.opening_line };
}

function endReasonLabel(reason: string): string {
  if (reason === "timeout") return "Flagged on time ⏱";
  if (reason === "resignation") return "You left the date";
  if (reason === "blocked") return "You got blocked 🚫";
  return "Date wrapped";
}

/**
 * Drives the Match screen off the solo PvE backend over a WebSocket: the persona,
 * move grading, persona replies, and the server-authoritative per-move clock all
 * come from the server. `mode` only affects presentation (the backend is solo PvE
 * regardless; ranked PvH is a later layer).
 */
export function useMatchGame(mode: VersusMode) {
  const [persona, setPersona] = useState<Persona | null>(null);
  const [suggestions] = useState<Suggestion[]>(SUGGESTIONS);
  const [messages, setMessages] = useState<Message[]>([]);
  const [typing, setTyping] = useState(false);
  const [interest, setInterest] = useState(BASE_INTEREST);
  const [yourAcc, setYourAcc] = useState(0);
  const [oppAcc, setOppAcc] = useState(0);
  const [verdict, setVerdict] = useState<VerdictState | null>(null);
  const [flagged, setFlagged] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const idRef = useRef(0);
  const nextId = useCallback(() => ++idRef.current, []);
  const socketRef = useRef<WebSocket | null>(null);
  const budgetRef = useRef(30); // per-move budget (s), set from the server
  const moveCountRef = useRef(0);
  const oppCountRef = useRef(0);
  const pendingYouRef = useRef<number | null>(null);
  const overRef = useRef(false); // game finished/flagged — silences reconnect noise

  const appendMessage = useCallback(
    (msg: Omit<Message, "id">) => {
      const id = nextId();
      setMessages((prev) => [...prev, { ...msg, id }]);
      return id;
    },
    [nextId],
  );

  const handleFlag = useCallback(() => {
    // Local clock hit zero: end the round in the UI. The server is authoritative and
    // will finalize the timeout (with rating) the next time this user connects.
    overRef.current = true;
    setTyping(false);
    setFlagged((f) => {
      if (f) return f;
      appendMessage({ side: "system", text: "(you ran out of time — the round is over ⏱)" });
      return true;
    });
  }, [appendMessage]);

  const clock = useMatchClock(handleFlag);
  const { start: startClock, stop: stopClock } = clock;

  const scoreAccuracy = useCallback(
    (classKey: MoveClassKey) => {
      moveCountRef.current += 1;
      const quality = MOVE_CLASSES[classKey].quality;
      setYourAcc((prev) => (prev * (moveCountRef.current - 1) + quality) / moveCountRef.current);
      // Solo has no real opponent; keep a plausible cosmetic figure for the strip.
      oppCountRef.current += 1;
      const oppQuality = mode === "ranked" ? 70 + Math.random() * 20 : 60 + Math.random() * 18;
      setOppAcc((prev) => (prev * (oppCountRef.current - 1) + oppQuality) / oppCountRef.current);
    },
    [mode],
  );

  const rebuildFromMoves = useCallback(
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
      oppCountRef.current = count;
      setMessages(rebuilt);
      setInterest(running);
      setYourAcc(count ? accSum / count : 0);
      setOppAcc(count ? 68 : 0);
    },
    [nextId],
  );

  const handleMessage = useCallback(
    (msg: ServerMessage) => {
      switch (msg.type) {
        case "new_game": {
          budgetRef.current = Math.max(1, Math.round(msg.time / 1000));
          moveCountRef.current = 0;
          oppCountRef.current = 0;
          pendingYouRef.current = null;
          overRef.current = false;
          setPersona(toPersona(msg.persona));
          setMessages([{ id: nextId(), side: "match", text: msg.persona.opening_line }]);
          setInterest(BASE_INTEREST);
          setYourAcc(0);
          setOppAcc(0);
          setFlagged(false);
          setTyping(false);
          startClock(budgetRef.current);
          break;
        }
        case "game_state": {
          budgetRef.current = Math.max(1, Math.round(msg.time / 1000));
          pendingYouRef.current = null;
          overRef.current = false;
          setPersona(toPersona(msg.persona));
          rebuildFromMoves(msg.moves);
          setFlagged(false);
          setTyping(false);
          startClock(Math.max(1, Math.round(msg.time_left / 1000)));
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
          scoreAccuracy(graded.classKey);
          setTyping(false);
          appendMessage({ side: "match", text: msg.content });
          startClock(budgetRef.current);
          break;
        }
        case "finish": {
          overRef.current = true;
          stopClock();
          setTyping(false);
          setFlagged(true);
          setYourAcc(msg.accuracy);
          const sign = msg.rating_delta >= 0 ? "+" : "";
          appendMessage({
            side: "system",
            text: `${endReasonLabel(msg.end_reason)} — ${msg.accuracy.toFixed(0)}% accuracy · rizz ${sign}${msg.rating_delta}`,
          });
          break;
        }
        case "error": {
          // Non-fatal protocol errors (e.g. out of turn) — surface softly, keep playing.
          setTyping(false);
          pendingYouRef.current = null;
          appendMessage({ side: "system", text: `⚠ ${msg.message}` });
          break;
        }
      }
    },
    [nextId, appendMessage, scoreAccuracy, rebuildFromMoves, startClock, stopClock],
  );

  // Keep the latest handler in a ref so the mount-once socket effect always calls current logic.
  const handlerRef = useRef(handleMessage);
  useEffect(() => {
    handlerRef.current = handleMessage;
  }, [handleMessage]);

  // Open the socket once on mount; close it on unmount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await resolveAccessToken();
        if (cancelled) return;
        const socket = new WebSocket(matchSocketUrl(token));
        socketRef.current = socket;
        socket.onopen = () => {
          if (!cancelled) setReady(true);
        };
        socket.onmessage = (event) => {
          try {
            handlerRef.current(JSON.parse(event.data) as ServerMessage);
          } catch {
            /* ignore malformed frames */
          }
        };
        socket.onclose = (event) => {
          if (cancelled) return;
          setReady(false);
          if (event.code === 4401) {
            setError("Your session expired — refresh to sign back in.");
          } else if (event.code !== 4000 && !overRef.current) {
            // 4000 = replaced by another tab/socket; ignore that one.
            setError("Connection lost. Refresh to reconnect.");
          }
        };
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not connect.");
      }
    })();
    return () => {
      cancelled = true;
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, []);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      const socket = socketRef.current;
      if (!trimmed || flagged || typing || !socket || socket.readyState !== WebSocket.OPEN) {
        return;
      }
      stopClock();
      const youId = appendMessage({ side: "you", text: trimmed });
      pendingYouRef.current = youId;
      setTyping(true);
      sendMove(socket, trimmed);
    },
    [flagged, typing, appendMessage, stopClock],
  );

  const sendSuggestion = useCallback((suggestion: Suggestion) => send(suggestion.text), [send]);

  const warn = clock.running && clock.remaining <= 10;
  const inputDisabled = flagged || typing || !ready;

  return {
    persona,
    suggestions,
    messages,
    typing,
    interest,
    yourAcc,
    oppAcc,
    verdict,
    flagged,
    ready,
    error,
    inputDisabled,
    clock: { remaining: clock.remaining, running: clock.running, warn },
    send,
    sendSuggestion,
  };
}

export type MatchGame = ReturnType<typeof useMatchGame>;
