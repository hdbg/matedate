import { createClient } from "../supabase/client";
import type { PersonaRow } from "../supabase/types";
import { gradeText, randomReply, SUGGESTIONS } from "./engine";
import type { GameService, Persona } from "./types";

/**
 * Gameplay data source. Personas are read from Supabase (the local CLI instance
 * during dev); move scoring is graded client-side by the interim engine until a
 * real analysis backend exists. See ./engine for that seam.
 */
export const gameService: GameService = {
  async getPersona(slug) {
    const supabase = createClient();
    const query = supabase
      .from("personas")
      .select("slug, name, opening_line, suggested_messages")
      .eq("is_active", true);

    const { data, error } = slug
      ? await query.eq("slug", slug).maybeSingle()
      : await query.order("difficulty").limit(1).maybeSingle();

    if (error) throw error;
    if (!data) throw new Error(`Persona not found${slug ? `: ${slug}` : ""}`);

    const row = data as Pick<PersonaRow, "slug" | "name" | "opening_line" | "suggested_messages">;
    return {
      slug: row.slug,
      name: row.name,
      hint: "🎭 persona type: hidden — read them",
      openingLine: row.opening_line,
      suggestions: row.suggested_messages ?? [],
    } satisfies Persona;
  },
  getSuggestions() {
    return SUGGESTIONS;
  },
  async gradeMove(text) {
    return gradeText(text);
  },
  async getPersonaReply() {
    return randomReply();
  },
};

export * from "./types";
