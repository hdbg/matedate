import { Button } from "@/app/components/ui/Button";
import { SelectOption } from "@/app/components/ui/SelectOption";
import type { Gender } from "@/app/lib/supabase/types";
import { GENDERS, SEEKING } from "../options";
import { BackButton, Eyebrow, OnboardingScreen, Spacer, Sub, Title } from "./chrome";

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 mt-1 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-ink-mute">
      {children}
    </div>
  );
}

export function IdentityScreen({
  gender,
  seeking,
  onSelectGender,
  onSelectSeeking,
  onBack,
  onContinue,
}: {
  gender: Gender | null;
  seeking: Gender | null;
  onSelectGender: (value: Gender) => void;
  onSelectSeeking: (value: Gender) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <OnboardingScreen>
      <BackButton onClick={onBack} />
      <Eyebrow>Step 1 of 3</Eyebrow>
      <Title>Who are you here to meet?</Title>
      <Sub>This sets who you date, solve puzzles against, and get matched with.</Sub>

      <GroupLabel>I am</GroupLabel>
      <div className="flex flex-col gap-[11px]">
        {GENDERS.map((opt) => (
          <SelectOption
            key={opt.value}
            icon={opt.icon}
            title={opt.title}
            description={opt.description}
            selected={gender === opt.value}
            onSelect={() => onSelectGender(opt.value)}
          />
        ))}
      </div>

      <GroupLabel>Looking for</GroupLabel>
      <div className="flex flex-col gap-[11px]">
        {SEEKING.map((opt) => (
          <SelectOption
            key={opt.value}
            icon={opt.icon}
            title={opt.title}
            description={opt.description}
            selected={seeking === opt.value}
            onSelect={() => onSelectSeeking(opt.value)}
          />
        ))}
      </div>

      <Spacer />
      <Button disabled={gender === null || seeking === null} onClick={onContinue}>
        Continue
      </Button>
    </OnboardingScreen>
  );
}
