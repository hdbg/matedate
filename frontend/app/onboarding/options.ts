import type { DatingGoal, TextingStyle } from "@/app/lib/supabase/types";

export interface OptionItem<T extends string> {
  value: T;
  icon: string;
  title: string;
  description: string;
}

export const DATING_GOALS: OptionItem<DatingGoal>[] = [
  { value: "serious", icon: "💍", title: "Something serious", description: "Real connection, long game" },
  { value: "casual", icon: "🍸", title: "Casual & fun", description: "Keep it light, keep it moving" },
  { value: "confidence", icon: "💪", title: "Build confidence", description: "Get better at opening & replying" },
  { value: "practice", icon: "🎯", title: "Just here to compete", description: "Climb the elo ladder" },
];

export const TEXTING_STYLES: OptionItem<TextingStyle>[] = [
  { value: "drywit", icon: "🌵", title: "Dry wit", description: "Deadpan, low-key, unbothered" },
  { value: "playful", icon: "😏", title: "Playful & flirty", description: "Banter, teasing, emoji-forward" },
  { value: "dark", icon: "🖤", title: "Dark humor", description: "Chaotic, unhinged, memey" },
  { value: "earnest", icon: "☀️", title: "Earnest & warm", description: "Say what you mean, mean it" },
];
