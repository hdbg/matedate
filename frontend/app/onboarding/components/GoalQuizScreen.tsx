import { Button } from "@/app/components/ui/Button";
import { SelectOption } from "@/app/components/ui/SelectOption";
import type { DatingGoal } from "@/app/lib/supabase/types";
import { DATING_GOALS } from "../options";
import { BackButton, Eyebrow, OnboardingScreen, Spacer, Sub, Title } from "./chrome";

export function GoalQuizScreen({
  selected,
  onSelect,
  onBack,
  onContinue,
}: {
  selected: DatingGoal | null;
  onSelect: (value: DatingGoal) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <OnboardingScreen>
      <BackButton onClick={onBack} />
      <Eyebrow>Step 1 of 2</Eyebrow>
      <Title>What are you playing for?</Title>
      <Sub>We&apos;ll tune your AI dates and puzzles to match.</Sub>

      <div className="flex flex-col gap-[11px]">
        {DATING_GOALS.map((opt) => (
          <SelectOption
            key={opt.value}
            icon={opt.icon}
            title={opt.title}
            description={opt.description}
            selected={selected === opt.value}
            onSelect={() => onSelect(opt.value)}
          />
        ))}
      </div>

      <Spacer />
      <Button disabled={selected === null} onClick={onContinue}>
        Continue
      </Button>
    </OnboardingScreen>
  );
}
