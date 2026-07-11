"use client";

import { useState } from "react";
import { Button } from "@/app/components/ui/Button";
import { Field } from "@/app/components/ui/Field";
import { BackButton, Eyebrow, OnboardingScreen, Spacer, Sub, Title } from "./chrome";

export function AccountScreen({
  submitting,
  error,
  onBack,
  onSubmit,
  onSkip,
}: {
  submitting: boolean;
  error: string | null;
  onBack: () => void;
  onSubmit: (email: string, password: string) => void;
  onSkip: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [oauthNote, setOauthNote] = useState<string | null>(null);

  const canSubmit = email.trim().length > 0 && password.length >= 6 && !submitting;

  return (
    <OnboardingScreen>
      <BackButton onClick={onBack} />
      <Eyebrow>Almost there</Eyebrow>
      <Title>Save your elo rating</Title>
      <Sub>Create an account to keep your rating, history, and streaks.</Sub>

      <Button
        variant="oauth"
        className="mb-[11px]"
        onClick={() => setOauthNote("Apple sign-in is coming soon — use email for now.")}
      >
         Continue with Apple
      </Button>
      <Button
        variant="oauth"
        onClick={() => setOauthNote("Google sign-in is coming soon — use email for now.")}
      >
        <span className="font-mono font-extrabold">G</span> Continue with Google
      </Button>
      {oauthNote && (
        <p className="mt-2 text-center text-[12px] text-ink-mute">{oauthNote}</p>
      )}

      <div className="my-4 flex items-center gap-3 text-[13px] text-ink-mute before:h-px before:flex-1 before:bg-ink/15 after:h-px after:flex-1 after:bg-ink/15">
        or
      </div>

      <Field
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="you@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Field
        label="Password"
        type="password"
        autoComplete="new-password"
        placeholder="•••••••• (min 6 chars)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && <p className="text-[13px] font-semibold text-rosy-deep">{error}</p>}

      <Spacer />
      <Button disabled={!canSubmit} onClick={() => onSubmit(email.trim(), password)}>
        {submitting ? "Creating account…" : "Create account"}
      </Button>
      <Button variant="link" disabled={submitting} onClick={onSkip}>
        Skip for now — <b className="text-rosy-deep">I&apos;ll save it later</b>
      </Button>
      <p className="mt-2.5 text-center font-mono text-[11px] leading-[1.5] text-ink-mute">
        By continuing you agree to our Terms. 3-day free trial, then $6.99/week. Cancel anytime.
      </p>
    </OnboardingScreen>
  );
}
