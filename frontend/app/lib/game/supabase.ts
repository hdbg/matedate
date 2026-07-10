import { createClient } from "../supabase/client";
import type { PersonaRow } from "../supabase/types";
import type { GameService, Persona, Suggestion } from "./types";

const ENGINE_PENDING =
  "Live grading is not implemented yet — the analysis engine is pending. " +
  "Set NEXT_PUBLIC_USE_MOCK=true to play against the mock engine.";

/**
 * Supabase-backed gameplay service. Reads real personas from the database but
 * defers move scoring to the analysis engine, which does not exist yet. This
 * keeps the seam in place so grading can be wired up without touching the UI.
 */
export const supabaseGameService: GameService = {
  async getPersona(slug) {
    const supabase = createClient();
    const query = supabase
      .from("personas")
      .select("slug, name, opening_line")
      .eq("is_active", true);

    const { data, error } = slug
      ? await query.eq("slug", slug).maybeSingle()
      : await query.order("difficulty").limit(1).maybeSingle();

    if (error) throw error;
    if (!data) throw new Error(`Persona not found${slug ? `: ${slug}` : ""}`);

    const row = data as Pick<PersonaRow, "slug" | "name" | "opening_line">;
    const persona: Persona = {
      slug: row.slug,
      name: row.name,
      hint: "🎭 persona type: hidden — read them",
      openingLine: row.opening_line,
    };
    return persona;
  },
  getSuggestions(): Suggestion[] {
    return [];
  },
  async gradeMove() {
    throw new Error(ENGINE_PENDING);
  },
  async getPersonaReply() {
    throw new Error(ENGINE_PENDING);
  },
};
