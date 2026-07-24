"use client";

import { useCallback, useState } from "react";
import { processAvatar, uploadAvatar } from "@/app/lib/avatar";
import { createClient } from "@/app/lib/supabase/client";
import type { DatingGoal, Gender, TextingStyle } from "@/app/lib/supabase/types";
import { isValidUsername, normalizeUsername, usernameSaveError } from "@/app/lib/username";

export type OnboardingStep =
  | "welcome"
  | "age"
  | "identity"
  | "goal"
  | "style"
  | "account"
  | "verify"
  | "profile"
  | "done";

/** Steps that show the progress bar, and their index within it. */
export const PROGRESS_STEPS: Partial<Record<OnboardingStep, number>> = {
  age: 0,
  identity: 1,
  goal: 2,
  style: 3,
  account: 4,
  profile: 5,
};
const PROGRESS_TOTAL = 6;
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
  const [username, setUsernameState] = useState("");
  const [avatarFile, setAvatarFileState] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  const setUsername = useCallback((raw: string) => {
    setUsernameState(normalizeUsername(raw));
  }, []);

  const setAvatarFile = useCallback((file: File | null) => {
    setAvatarFileState(file);
    setAvatarPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
  }, []);

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

  /**
   * Email/password signup. With email confirmation ON, `signUp` returns no session
   * until the user clicks the link, so we CAN'T PATCH the profile inline. Instead the
   * quiz answers ride along as user metadata — the `handle_new_user()` DB trigger seeds
   * the profile row from them the instant the auth user is created (cross-device safe).
   * `emailRedirectTo` carries the post-confirmation destination (`next`) through the
   * email so deep-links like `/join/<code>` survive; the `/auth/confirm` handler forwards
   * to it. On success we land on the "check your email" step, not the profile step.
   */
  const createAccount = useCallback(
    async (email: string, password: string, next: string) => {
      setSubmitting(true);
      setError(null);
      try {
        const supabase = createClient();
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo:
              typeof window !== "undefined" ? `${window.location.origin}${next}` : undefined,
            data: {
              gender,
              seeking,
              dating_goal: goal,
              texting_style: styles,
              age_verified_at: new Date().toISOString(),
            },
          },
        });
        if (signUpError) throw signUpError;
        setPendingEmail(email);
        setStep("verify");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [gender, seeking, goal, styles],
  );

  /** Re-send the confirmation email for the pending signup (rate-limited server-side). */
  const resendConfirmation = useCallback(
    async (next: string) => {
      if (!pendingEmail) return;
      setSubmitting(true);
      setError(null);
      try {
        const supabase = createClient();
        const { error: resendError } = await supabase.auth.resend({
          type: "signup",
          email: pendingEmail,
          options: {
            emailRedirectTo:
              typeof window !== "undefined" ? `${window.location.origin}${next}` : undefined,
          },
        });
        if (resendError) throw resendError;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't resend. Try again in a moment.");
      } finally {
        setSubmitting(false);
      }
    },
    [pendingEmail],
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
      setStep("profile");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }, [saveProfile]);

  /**
   * Persist the optional profile step (photo + username). Both are skippable; a username
   * conflict keeps the player on the step with an inline error instead of failing the flow.
   */
  const saveProfileStep = useCallback(async () => {
    if (username && !isValidUsername(username)) {
      setError("3–20 characters: lowercase letters, numbers, underscores.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not signed in.");
      if (avatarFile) {
        const blob = await processAvatar(avatarFile);
        await uploadAvatar(userData.user.id, blob, null);
      }
      if (username) {
        const { error: updateError } = await supabase
          .from("profiles")
          .update({ username })
          .eq("id", userData.user.id);
        if (updateError) {
          setError(usernameSaveError(updateError.code) ?? "Couldn't save that username. Try again.");
          return;
        }
      }
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }, [avatarFile, username]);

  const skipProfileStep = useCallback(() => {
    setError(null);
    setStep("done");
  }, []);

  return {
    step,
    ageConfirmed,
    gender,
    seeking,
    goal,
    styles,
    username,
    avatarPreview,
    submitting,
    error,
    pendingEmail,
    goTo,
    setAgeConfirmed,
    setGender,
    setSeeking,
    setGoal,
    toggleStyle,
    setUsername,
    setAvatarFile,
    createAccount,
    resendConfirmation,
    skipAccount,
    saveProfileStep,
    skipProfileStep,
  };
}

export type OnboardingController = ReturnType<typeof useOnboarding>;
