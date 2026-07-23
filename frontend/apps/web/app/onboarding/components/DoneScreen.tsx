import type { ReactNode } from "react";
import { Button } from "@/app/components/ui/Button";
import { MoveIcon } from "@/app/components/ui/MoveIcon";
import { OnboardingScreen, Spacer, Sub, Title } from "./chrome";

function Stat({ value, label, valueClassName }: { value: ReactNode; label: string; valueClassName?: string }) {
  return (
    <div className="text-center">
      <div className={`font-mono text-[26px] font-bold ${valueClassName ?? ""}`}>{value}</div>
      <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-mute">
        {label}
      </div>
    </div>
  );
}

export function DoneScreen({
  onPlay,
  onRestart,
}: {
  onPlay: () => void;
  onRestart: () => void;
}) {
  return (
    <OnboardingScreen>
      <div className="mt-2 flex flex-col items-center text-center">
        <div className="my-5 grid h-[104px] w-[104px] place-items-center rounded-full bg-rosy text-[52px] text-white shadow-[0_10px_0_var(--rosy-deep)]">
          ✓
        </div>
        <Title className="mb-1.5 text-center">You&apos;re in.</Title>
        <Sub className="text-center">
          Your profile&apos;s set. Time to make your first move.
        </Sub>
        <div className="mt-5 flex w-full justify-around rounded-2xl bg-cream p-[18px]">
          <Stat value="1200" label="Starting elo" />
          <Stat value="3" label="Free / day" />
          <Stat
            value={<MoveIcon classKey="brilliant" size={26} className="inline align-[-4px]" />}
            label="Best move locked"
          />
        </div>
      </div>

      <Spacer />
      <Button onClick={onPlay}>Pick your game mode →</Button>
      <Button variant="link" onClick={onRestart}>
        Restart onboarding
      </Button>
    </OnboardingScreen>
  );
}
