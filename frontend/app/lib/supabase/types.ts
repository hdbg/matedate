/**
 * Hand-written slice of the database schema for the tables the frontend touches.
 * The full source of truth is supabase/migrations/20260710111217_initial.sql.
 * Regenerate a complete version later with:
 *   supabase gen types typescript --local > app/lib/supabase/database.types.ts
 */

export type DatingGoal = "serious" | "casual" | "confidence" | "practice";
export type TextingStyle = "drywit" | "playful" | "dark" | "earnest";

export interface ProfileRow {
  id: string;
  username: string | null;
  display_name: string | null;
  date_of_birth: string | null;
  age_verified_at: string | null;
  dating_goal: DatingGoal | null;
  texting_style: TextingStyle[];
  referral_code: string | null;
  referred_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlayerRatingsRow {
  user_id: string;
  rizz_rating: number;
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
  difficulty: number;
  is_boss: boolean;
  is_active: boolean;
  description: string | null;
  opening_line: string;
  created_at: string;
}

type ProfileUpdate = Partial<
  Pick<
    ProfileRow,
    "display_name" | "dating_goal" | "texting_style" | "age_verified_at" | "date_of_birth"
  >
>;

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
    };
    CompositeTypes: Record<string, never>;
  };
}
