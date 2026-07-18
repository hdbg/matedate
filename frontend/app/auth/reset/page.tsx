"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthShell } from "@/app/components/ui/AuthShell";
import { Button } from "@/app/components/ui/Button";
import { Field } from "@/app/components/ui/Field";
import { Eyebrow, OnboardingScreen, Spacer, Sub, Title } from "@/app/onboarding/components/chrome";
import { createClient } from "@/app/lib/supabase/client";

function ResetPasswordForm() {
  const router = useRouter();
  const [ready, setReady] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The recovery session was established by /auth/confirm before it redirected here.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setReady(!!data.user));
  }, []);

  async function submit() {
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      router.push("/play");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (ready === false) {
    return (
      <OnboardingScreen>
        <Eyebrow>Link expired</Eyebrow>
        <Title>Reset link invalid</Title>
        <Sub>This password reset link has expired or was already used. Request a new one.</Sub>
        <Spacer />
        <Link href="/forgot-password" className="block">
          <Button>Request a new link</Button>
        </Link>
        <Link href="/login" className="mt-2 block">
          <Button variant="link">Back to log in</Button>
        </Link>
      </OnboardingScreen>
    );
  }

  const canSubmit = password.length >= 6 && !submitting && ready === true;

  return (
    <OnboardingScreen>
      <Eyebrow>Almost there</Eyebrow>
      <Title>Set a new password</Title>
      <Sub>Choose a new password for your account.</Sub>

      <Field
        label="New password"
        type="password"
        autoComplete="new-password"
        placeholder="•••••••• (min 6 chars)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && canSubmit) submit();
        }}
      />
      {error && <p className="text-[13px] font-semibold text-rosy-deep">{error}</p>}

      <Spacer />
      <Button disabled={!canSubmit} onClick={submit}>
        {submitting ? "Saving…" : "Save new password"}
      </Button>
    </OnboardingScreen>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell>
      <ResetPasswordForm />
    </AuthShell>
  );
}
