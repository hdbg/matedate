/**
 * Hand-written slice of the database schema for the tables the frontend touches.
 * The full source of truth is supabase/migrations/20260710111217_initial.sql.
 * Regenerate a complete version later with:
 *   supabase gen types typescript --local > app/lib/supabase/database.types.ts
 */

export type DatingGoal = "serious" | "casual" | "confidence" | "practice";
export type TextingStyle = "drywit" | "playful" | "dark" | "earnest";
/** Gender identity and preference are both single-select ("men or women"). */
export type Gender = "man" | "woman";

export interface ProfileRow {
  id: string;
  username: string | null;
  display_name: string | null;
  /** Path inside the public `avatars` bucket (never a URL); null → pawn placeholder. */
  avatar_path: string | null;
  date_of_birth: string | null;
  age_verified_at: string | null;
  dating_goal: DatingGoal | null;
  texting_style: TextingStyle[];
  gender: Gender | null;
  seeking: Gender | null;
  referral_code: string | null;
  referred_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlayerRatingsRow {
  user_id: string;
  elo_rating: number;
  ranked_elo: number;
  casual_rating: number;
  ranked_tier: string | null;
  ranked_wins: number;
  ranked_losses: number;
  updated_at: string;
}

export interface PersonaRow {
  id: string;
  slug: string;
  name: string;
  gender: Gender;
  difficulty: number;
  is_boss: boolean;
  is_active: boolean;
  description: string | null;
  opening_line: string;
  suggested_messages: string[];
  created_at: string;
}

type ProfileUpdate = Partial<
  Pick<
    ProfileRow,
    | "username"
    | "display_name"
    | "avatar_path"
    | "dating_goal"
    | "texting_style"
    | "gender"
    | "seeking"
    | "age_verified_at"
    | "date_of_birth"
  >
>;

/** Source game of a solo analysis (owner-readable). Supplies the review's summary + date. */
export interface GameRow {
  id: string;
  user_id: string | null;
  mode: string;
  status: string;
  end_reason: string | null;
  accuracy: number | null;
  title: string | null;
  description: string | null;
  created_at: string;
  ended_at: string | null;
}

/** Solo-specific columns: the elo delta and which persona was played. */
export interface SoloGameRow {
  game_id: string;
  persona_id: string | null;
  rating_delta: number;
  /** Disclosed-AI casual game (SPEC §2.3) — doesn't touch the rated ladder. */
  is_practice: boolean;
  base_seconds: number;
  increment_seconds: number;
}

export type RatingKind = "elo" | "ranked" | "casual";

/** One rating change (owner-readable). Peak ELO = max(rating_after) where kind='elo'. */
export interface RatingHistoryRow {
  id: number;
  user_id: string;
  kind: RatingKind;
  rating_before: number;
  rating_after: number;
  delta: number;
  source_kind: string | null;
  source_id: string | null;
  created_at: string;
}

/** Column slice of `moves` used by the profile's brilliants/highlight derivation. */
export interface MoveEvalRow {
  game_id: string;
  eval_delta: number | null;
  eval_after: number | null;
}

/** Lifecycle row for a queued analysis. Owner-readable; the notifications bell watches it. */
export interface AnalysisJobRow {
  id: string;
  kind: string;
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
  user_id: string | null;
  game_id: string | null;
  analysis_id: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

/** A finished game's deep-review header. Written by the analysis worker; owner-readable. */
export interface GameAnalysisRow {
  id: string;
  job_id: string | null;
  game_id: string | null;
  match_id: string | null;
  title: string;
  description: string;
  tags: string[];
  model: string;
  prompt_version: string;
  latency_ms: number | null;
  created_at: string;
}

/** A re-scored "You" move within an analysis. Quality is the numeric eval; rank derives from it.
 * The best line is NOT here — it's the paid reveal in `game_analysis_move_reveals`. */
export interface GameAnalysisMoveRow {
  id: string;
  analysis_id: string;
  position: number;
  side: "You" | "Match";
  move_id: string | null;
  content: string;
  eval_before: number | null;
  eval_after: number | null;
  eval_delta: number | null;
  comment: string;
  created_at: string;
}

/** The paid "best line" for an analysis move — RLS-gated: only returned when the game is unlocked. */
export interface GameAnalysisMoveRevealRow {
  analysis_move_id: string;
  analysis_id: string;
  best_line: string;
}

export type MatchEndReason =
  | "scored"
  | "timeout"
  | "resignation"
  | "abandoned"
  | "blocked"
  | "date_landed";

/** Shared parent of a versus match (participant-readable). One contest, no rounds. */
export interface MatchRow {
  id: string;
  mode: "pvp" | "ai" | "ghost";
  persona_id: string;
  status: "active" | "completed" | "abandoned";
  time_control: "bullet" | "rapid" | "classical";
  base_seconds: number;
  increment_seconds: number;
  max_exchanges: number;
  /** False on friend-invite matches — no ranked ELO at stake. */
  rated: boolean;
  opening_line: string;
  /** Null until decided; stays null on a draw. */
  winner_side: "a" | "b" | null;
  end_reason: MatchEndReason | null;
  created_at: string;
  completed_at: string | null;
}

/** PvP sides + result snapshot (participant-readable; lockstep state is backend-only). */
export interface PvpMatchRow {
  match_id: string;
  player_a: string;
  player_b: string;
  player_a_accuracy: number | null;
  player_b_accuracy: number | null;
  player_a_elo_before: number | null;
  player_a_elo_after: number | null;
  player_b_elo_before: number | null;
  player_b_elo_after: number | null;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Partial<ProfileRow> & { id: string };
        Update: ProfileUpdate;
        Relationships: [];
      };
      player_ratings: {
        Row: PlayerRatingsRow;
        Insert: Partial<PlayerRatingsRow> & { user_id: string };
        Update: Partial<PlayerRatingsRow>;
        Relationships: [];
      };
      personas: {
        Row: PersonaRow;
        Insert: Partial<PersonaRow> & { slug: string; name: string; opening_line: string };
        Update: Partial<PersonaRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      game_mode: "solo" | "screenshot" | "puzzle";
      time_control: "bullet" | "rapid" | "classical";
      gender: Gender;
    };
    CompositeTypes: Record<string, never>;
  };
}
