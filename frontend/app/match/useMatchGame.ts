"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  gameService,
  MOVE_CLASSES,
  TIME_CONTROL_SECONDS,
  type GradedMove,
  type MoveClassKey,
  type Persona,
  type Suggestion,
  type TimeControl,
  type VersusMode,
} from "@/app/lib/game/service";
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

const PERSONA_REPLY_DELAY_MS = 1400;
const clamp = (v: number) => Math.max(2, Math.min(98, v));

export function useMatchGame(mode: VersusMode, timeControl: TimeControl) {
  const seconds = TIME_CONTROL_SECONDS[timeControl];

  const [persona, setPersona] = useState<Persona | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [typing, setTyping] = useState(false);
  const [interest, setInterest] = useState(58);
  const [yourAcc, setYourAcc] = useState(0);
  const [oppAcc, setOppAcc] = useState(0);
  const [verdict, setVerdict] = useState<VerdictState | null>(null);
  const [flagged, setFlagged] = useState(false);

  const idRef = useRef(0);
  const moveCountRef = useRef(0);
  const oppCountRef = useRef(0);
  const nextId = () => ++idRef.current;

  const appendMessage = useCallback((msg: Omit<Message, "id">) => {
    setMessages((prev) => [...prev, { ...msg, id: nextId() }]);
  }, []);

  const handleFlag = useCallback(() => {
    if (mode !== "ranked") return;
    setFlagged(true);
    appendMessage({
      side: "system",
      text: "(you ran out of time — opponent takes the round on the clock ⏱)",
    });
  }, [mode, appendMessage]);

  const clock = useMatchClock(handleFlag);
  const { start: startClock, stop: stopClock, set: setClock } = clock;

  // Initialize the match once.
  useEffect(() => {
    let active = true;
    (async () => {
      const p = await gameService.getPersona();
      if (!active) return;
      setPersona(p);
      setSuggestions(gameService.getSuggestions());
      setMessages([{ id: nextId(), side: "match", text: p.openingLine }]);
      setInterest(58);
      if (mode === "ranked") startClock(seconds);
      else setClock(seconds);
    })();
    return () => {
      active = false;
    };
    // Intentionally run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const playMove = useCallback(
    (text: string, graded: GradedMove) => {
      if (flagged) return;
      stopClock();

      appendMessage({ side: "you", text, move: graded });
      setVerdict({ id: nextId(), classKey: graded.classKey, swing: graded.swing });
      setInterest((v) => clamp(v + graded.swing * 7));

      moveCountRef.current += 1;
      const quality = MOVE_CLASSES[graded.classKey].quality;
      setYourAcc((prev) => (prev * (moveCountRef.current - 1) + quality) / moveCountRef.current);

      oppCountRef.current += 1;
      const oppQuality =
        mode === "ranked" ? 70 + Math.random() * 20 : 60 + Math.random() * 18;
      setOppAcc((prev) => (prev * (oppCountRef.current - 1) + oppQuality) / oppCountRef.current);

      setTyping(true);
      window.setTimeout(async () => {
        const reply = await gameService.getPersonaReply();
        setTyping(false);
        appendMessage({ side: "match", text: reply });
        if (mode === "ranked") startClock(seconds);
      }, PERSONA_REPLY_DELAY_MS);
    },
    [flagged, mode, seconds, appendMessage, stopClock, startClock],
  );

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || flagged) return;
      const graded = await gameService.gradeMove(trimmed);
      playMove(trimmed, graded);
    },
    [flagged, playMove],
  );

  const sendSuggestion = useCallback(
    (suggestion: Suggestion) => {
      playMove(suggestion.text, { classKey: suggestion.classKey, swing: suggestion.swing });
    },
    [playMove],
  );

  const warn = mode === "ranked" && clock.running && clock.remaining <= 10;

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
    clock: { remaining: clock.remaining, running: clock.running, warn },
    send,
    sendSuggestion,
  };
}

export type MatchGame = ReturnType<typeof useMatchGame>;
