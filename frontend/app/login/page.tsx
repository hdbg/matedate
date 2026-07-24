"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthShell } from "@/app/components/ui/AuthShell";
import { Button } from "@/app/components/ui/Button";
import { Field } from "@/app/components/ui/Field";
import { Eyebrow, OnboardingScreen, Spacer, Sub, Title } from "@/app/onboarding/components/chrome";
import { safeNext } from "@/app/lib/auth/sessionGuard";
import { createClient } from "@/app/lib/supabase/client";

const LINK_ERRORS: Record<string, string> = {
  invalid_link: "That link is invalid. Log in below, or request a new email.",
  link_expired: "That link has expired. Log in below, or request a new one.",
};

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next")) ?? "/play";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(LINK_ERRORS[params.get("error") ?? ""] ?? null);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !submitting;

  async function signIn() {
    setSubmitting(true);
    setError(null);
    setNeedsConfirm(false);
    setNotice(null);
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        if (signInError.code === "email_not_confirmed") {
          setNeedsConfirm(true);
          setError("Confirm your email first — check your inbox or resend below.");
        } else {
          setError(signInError.message);
        }
        return;
      }
      router.push(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function resend() {
    setSubmitting(true);
    setNotice(null);
    try {
      const supabase = createClient();
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
        options: {
          emailRedirectTo:
            typeof window !== "undefined" ? `${window.location.origin}${next}` : undefined,
        },
      });
      if (resendError) throw resendError;
      setNotice("Confirmation email sent. Check your inbox.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't resend. Try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <OnboardingScreen>
      <Eyebrow>Welcome back</Eyebrow>
      <Title>Log in</Title>
      <Sub>Pick up your rating, history, and streaks.</Sub>

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
        autoComplete="current-password"
        placeholder="Your password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && canSubmit) signIn();
        }}
      />
      {error && <p className="text-[13px] font-semibold text-rosy-deep">{error}</p>}
      {notice && <p className="text-[13px] font-semibold text-ink-soft">{notice}</p>}

      <div className="mt-1">
        <Link href="/forgot-password" className="text-[13px] text-ink-mute">
          Forgot your password?
        </Link>
      </div>

      <Spacer />
      {needsConfirm && (
        <Button variant="ghost" className="mb-[11px]" disabled={submitting} onClick={resend}>
          {submitting ? "Sending…" : "Resend confirmation email"}
        </Button>
      )}
      <Button disabled={!canSubmit} onClick={signIn}>
        {submitting ? "Logging in…" : "Log in"}
      </Button>
      <Link href={`/onboarding?next=${encodeURIComponent(next)}`} className="mt-2 block">
        <Button variant="link">
          New here? <b className="text-rosy-deep">Create an account</b>
        </Button>
      </Link>
    </OnboardingScreen>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthShell />}>
      <AuthShell>
        <LoginForm />
      </AuthShell>
    </Suspense>
  );
}
