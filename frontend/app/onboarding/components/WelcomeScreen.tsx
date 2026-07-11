import type { ReactNode } from "react";
import { Button } from "@/app/components/ui/Button";
import { HeroScene } from "@/app/components/ui/HeroScene";
import { Wordmark } from "@/app/components/ui/Wordmark";
import { OnboardingScreen, Spacer } from "./chrome";

function Feature({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-[13px] py-[11px]">
      <div className="grid h-[38px] w-[38px] flex-shrink-0 place-items-center rounded-[11px] bg-rosy/[0.16] font-mono text-[15px] font-bold text-rosy">
        {icon}
      </div>
      <div>
        <div className="text-[16px] font-bold">{title}</div>
        <div className="text-[14px] leading-[1.35] text-[#cfc6b6]">{children}</div>
      </div>
    </div>
  );
}

export function WelcomeScreen({
  onStart,
  onSignIn,
}: {
  onStart: () => void;
  onSignIn: () => void;
}) {
  return (
    <OnboardingScreen dark>
      {/* Hidden on desktop — the BrandPanel carries the hero + wordmark there. */}
      <div className="lg:hidden">
        <HeroScene className="mb-2 mt-6" />
        <Wordmark className="text-center text-[48px] leading-none text-king" />
        <p className="mt-3.5 text-center text-[16px] leading-[1.45] text-[#cfc6b6]">
          Flirting, graded like a chess engine. Every text gets a verdict —{" "}
          <span className="font-mono text-m-brilliant">!! Brilliant</span> to{" "}
          <span className="font-mono text-rosy">?? Blunder</span>.
        </p>
      </div>

      {/* On desktop the features headline the dark flow pane. */}
      <div className="mt-2 lg:mt-10">
        <Feature icon="!!" title="Get graded">
          Chess-style classification + accuracy % on every move.
        </Feature>
        <Feature icon="♟" title="Climb the ladder">
          Earn an elo rating. Play solo, ranked, or review real chats.
        </Feature>
        <Feature icon="🛡" title="Private by design">
          Screenshots are redacted &amp; never stored. It&apos;s for fun — be yourself.
        </Feature>
      </div>

      <Spacer />
      <Button onClick={onStart}>Get started</Button>
      <Button variant="link" onClick={onSignIn}>
        Already playing? <b className="text-rosy-deep">Sign in</b>
      </Button>
    </OnboardingScreen>
  );
}
