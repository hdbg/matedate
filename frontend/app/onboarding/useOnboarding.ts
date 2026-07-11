"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/app/lib/supabase/client";
import type { DatingGoal, Gender, TextingStyle } from "@/app/lib/supabase/types";

export type OnboardingStep =
  | "welcome"
  | "age"
  | "identity"
  | "goal"
  | "style"
  | "account"
  | "done";

/** Steps that show the progress bar, and their index within it. */
export const PROGRESS_STEPS: Partial<Record<OnboardingStep, number>> = {
  age: 0,
  identity: 1,
  goal: 2,
  style: 3,
  account: 4,
};
const PROGRESS_TOTAL = 5;
const DARK_STEPS = new Set<OnboardingStep>(["welcome"]);

export function isDarkStep(step: OnboardingStep): boolean {
  return DARK_STEPS.has(step);
}

export function progressValue(step: OnboardingStep): number | null {
  const idx = PROGRESS_STEPS[step];
  return idx === undefined ? null : idx / PROGRESS_TOTAL;
}

export function useOnboarding() {
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [gender, setGender] = useState<Gender | null>(null);
  const [seeking, setSeeking] = useState<Gender | null>(null);
  const [goal, setGoal] = useState<DatingGoal | null>(null);
  const [styles, setStyles] = useState<TextingStyle[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goTo = useCallback((next: OnboardingStep) => {
    setError(null);
    setStep(next);
  }, []);

  const toggleStyle = useCallback((value: TextingStyle) => {
    setStyles((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value],
    );
  }, []);

  /** Persist the quiz answers onto the signed-in user's profile row. */
  const saveProfile = useCallback(async () => {
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    await supabase
      .from("profiles")
      .update({
        dating_goal: goal,
        texting_style: styles,
        gender,
        seeking,
        age_verified_at: new Date().toISOString(),
      })
      .eq("id", userData.user.id);
  }, [goal, styles, gender, seeking]);

  const createAccount = useCallback(
    async (email: string, password: string) => {
      setSubmitting(true);
      setError(null);
      try {
        const supabase = createClient();
        const { error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        await saveProfile();
        setStep("done");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [saveProfile],
  );

  /**
   * "Skip for now" still creates a real (anonymous) session so the rating and
   * quiz answers persist. The account can be upgraded to email/password later.
   */
  const skipAccount = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInAnonymously();
      if (authError) throw authError;
      await saveProfile();
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }, [saveProfile]);

  return {
    step,
    ageConfirmed,
    gender,
    seeking,
    goal,
    styles,
    submitting,
    error,
    goTo,
    setAgeConfirmed,
    setGender,
    setSeeking,
    setGoal,
    toggleStyle,
    createAccount,
    skipAccount,
  };
}

export type OnboardingController = ReturnType<typeof useOnboarding>;
