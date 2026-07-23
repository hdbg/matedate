import { Button } from "@/app/components/ui/Button";
import { cn } from "@/app/lib/utils";
import { BackButton, Eyebrow, OnboardingScreen, Spacer, Sub, Title } from "./chrome";

export function AgeGateScreen({
  confirmed,
  onToggle,
  onBack,
  onContinue,
  onUnderage,
}: {
  confirmed: boolean;
  onToggle: () => void;
  onBack: () => void;
  onContinue: () => void;
  onUnderage: () => void;
}) {
  return (
    <OnboardingScreen>
      <BackButton onClick={onBack} />
      <Eyebrow>Quick check</Eyebrow>
      <div className="mx-auto mb-1 mt-4 grid h-24 w-24 place-items-center rounded-full bg-rosy-tint text-[34px] font-extrabold tracking-[-0.03em] text-rosy-deep">
        18+
      </div>
      <Title className="text-center">Are you 18 or older?</Title>
      <Sub className="text-center">
        MateDate is an 18+ product. We never knowingly collect data from anyone under 18.
      </Sub>

      <button
        type="button"
        onClick={onToggle}
        aria-pressed={confirmed}
        className="flex cursor-pointer items-start gap-3 px-1 py-3.5 text-left"
      >
        <span
          className={cn(
            "mt-px grid h-6 w-6 flex-shrink-0 place-items-center rounded-[7px] border-2 text-white transition-[background,border-color] duration-150",
            confirmed ? "border-rosy bg-rosy" : "border-ink/25",
          )}
        >
          ✓
        </span>
        <span className="text-[14px] leading-[1.4] text-ink-soft">
          I confirm I&apos;m <b>18 years or older</b> and I agree to the Terms &amp; Privacy Policy.
        </span>
      </button>

      <div className="mt-2 rounded-[14px] bg-cream px-4 py-3.5 text-[13px] leading-[1.5] text-ink-mute">
        <b>Just so we&apos;re clear:</b> MateDate is for entertainment and communication practice —
        not manipulation. The verdict grades the message, never a person. Be yourself. 💛
      </div>

      <Spacer />
      <Button disabled={!confirmed} onClick={onContinue}>
        Continue
      </Button>
      <Button variant="link" onClick={onUnderage}>
        I&apos;m under 18
      </Button>
    </OnboardingScreen>
  );
}
