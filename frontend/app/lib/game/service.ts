import { mockGameService } from "./mock";
import { supabaseGameService } from "./supabase";
import type { GameService } from "./types";

/**
 * Whether to use the in-app mock engine. Defaults to true (mock) so local dev
 * works without a scoring backend; set NEXT_PUBLIC_USE_MOCK=false to route
 * reads to Supabase.
 */
export const usingMockEngine = process.env.NEXT_PUBLIC_USE_MOCK !== "false";

export const gameService: GameService = usingMockEngine
  ? mockGameService
  : supabaseGameService;

export * from "./types";
