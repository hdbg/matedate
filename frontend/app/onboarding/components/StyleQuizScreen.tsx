import { Button } from "@/app/components/ui/Button";
import { SelectOption } from "@/app/components/ui/SelectOption";
import type { TextingStyle } from "@/app/lib/supabase/types";
import { TEXTING_STYLES } from "../options";
import { BackButton, Eyebrow, OnboardingScreen, Spacer, Sub, Title } from "./chrome";

export function StyleQuizScreen({
  selected,
  onToggle,
  onBack,
  onContinue,
}: {
  selected: TextingStyle[];
  onToggle: (value: TextingStyle) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <OnboardingScreen>
      <BackButton onClick={onBack} />
      <Eyebrow>Step 3 of 3</Eyebrow>
      <Title>What&apos;s your texting style?</Title>
      <Sub>Pick all that sound like you. This shapes how the engine reads your moves.</Sub>

      <div className="flex flex-col gap-[11px]">
        {TEXTING_STYLES.map((opt) => (
          <SelectOption
            key={opt.value}
            icon={opt.icon}
            title={opt.title}
            description={opt.description}
            selected={selected.includes(opt.value)}
            onSelect={() => onToggle(opt.value)}
          />
        ))}
      </div>

      <Spacer />
      <Button disabled={selected.length === 0} onClick={onContinue}>
        Continue
      </Button>
    </OnboardingScreen>
  );
}
