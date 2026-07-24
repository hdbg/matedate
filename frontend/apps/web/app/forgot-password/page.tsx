"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthShell } from "@/app/components/ui/AuthShell";
import { Button } from "@/app/components/ui/Button";
import { Field } from "@/app/components/ui/Field";
import { Eyebrow, OnboardingScreen, Spacer, Sub, Title } from "@/app/onboarding/components/chrome";
import { createClient } from "@/app/lib/supabase/client";

function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const supabase = createClient();
      // The recovery link lands on /auth/confirm (type=recovery), which verifies the
      // token and forwards to /auth/reset to set a new password.
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo:
          typeof window !== "undefined" ? `${window.location.origin}/auth/reset` : undefined,
      });
      if (resetError) throw resetError;
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = email.trim().length > 0 && !submitting;

  if (sent) {
    return (
      <OnboardingScreen>
        <div className="mt-6 text-center text-[56px] leading-none">📬</div>
        <Eyebrow>Check your email</Eyebrow>
        <Title>Reset link sent</Title>
        <Sub>
          If an account exists for <b className="text-ink">{email.trim()}</b>, we sent a link to
          reset your password. It may take a minute to arrive.
        </Sub>
        <Spacer />
        <Link href="/login" className="block">
          <Button variant="ghost">Back to log in</Button>
        </Link>
      </OnboardingScreen>
    );
  }

  return (
    <OnboardingScreen>
      <Eyebrow>Forgot password</Eyebrow>
      <Title>Reset your password</Title>
      <Sub>Enter your email and we&apos;ll send you a link to set a new one.</Sub>

      <Field
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="you@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && canSubmit) submit();
        }}
      />
      {error && <p className="text-[13px] font-semibold text-rosy-deep">{error}</p>}

      <Spacer />
      <Button disabled={!canSubmit} onClick={submit}>
        {submitting ? "Sending…" : "Send reset link"}
      </Button>
      <Link href="/login" className="mt-2 block">
        <Button variant="link">Back to log in</Button>
      </Link>
    </OnboardingScreen>
  );
}

export default function ForgotPasswordPage() {
  return (
    <AuthShell>
      <ForgotPasswordForm />
    </AuthShell>
  );
}
