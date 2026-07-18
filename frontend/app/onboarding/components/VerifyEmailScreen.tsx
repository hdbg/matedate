"use client";

import Link from "next/link";
import { Button } from "@/app/components/ui/Button";
import { Eyebrow, OnboardingScreen, Spacer, Sub, Title } from "./chrome";

export function VerifyEmailScreen({
  email,
  submitting,
  error,
  onResend,
}: {
  email: string | null;
  submitting: boolean;
  error: string | null;
  onResend: () => void;
}) {
  return (
    <OnboardingScreen>
      <div className="mt-6 text-center text-[56px] leading-none">📬</div>
      <Eyebrow>One last step</Eyebrow>
      <Title>Check your email</Title>
      <Sub>
        We sent a confirmation link{email ? " to " : ""}
        {email && <b className="text-ink">{email}</b>}. Click it to activate your account and start
        playing — your rating and quiz answers are already saved.
      </Sub>

      {error && <p className="text-[13px] font-semibold text-rosy-deep">{error}</p>}

      <Spacer />
      <Button variant="ghost" disabled={submitting} onClick={onResend}>
        {submitting ? "Sending…" : "Resend confirmation email"}
      </Button>
      <Link href="/login" className="mt-2 block">
        <Button variant="link">
          Already confirmed? <b className="text-rosy-deep">Log in</b>
        </Button>
      </Link>
    </OnboardingScreen>
  );
}
