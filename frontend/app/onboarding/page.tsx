"use client";

import { useRouter } from "next/navigation";
import { AppShell } from "@/app/components/ui/AppShell";
import { ProgressBar } from "@/app/components/ui/ProgressBar";
import { cn } from "@/app/lib/utils";
import { AccountScreen } from "./components/AccountScreen";
import { AgeGateScreen } from "./components/AgeGateScreen";
import { BrandPanel } from "./components/BrandPanel";
import { DoneScreen } from "./components/DoneScreen";
import { GoalQuizScreen } from "./components/GoalQuizScreen";
import { IdentityScreen } from "./components/IdentityScreen";
import { ProfileSetupScreen } from "./components/ProfileSetupScreen";
import { StyleQuizScreen } from "./components/StyleQuizScreen";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { isDarkStep, progressValue, useOnboarding } from "./useOnboarding";

export default function OnboardingPage() {
  const router = useRouter();
  const flow = useOnboarding();
  const { step, goTo } = flow;

  const progress = progressValue(step);
  const dark = isDarkStep(step);

  return (
    <AppShell>
      <div className="flex h-full flex-col lg:flex-row">
        {/* Desktop marketing panel */}
        <BrandPanel className="hidden lg:flex lg:w-[44%] lg:max-w-[600px]" />

        {/* Flow pane. On desktop the welcome step keeps a dark surface so it
            reads as one hero with the brand panel; other steps are light. */}
        <div
          className={cn(
            "relative flex min-h-0 flex-1 flex-col overflow-hidden",
            dark && "lg:bg-ink",
          )}
        >
          {progress !== null && (
            <div className="pt-4 lg:mx-auto lg:w-full lg:max-w-[520px]">
              <ProgressBar value={progress} />
            </div>
          )}

          {/* key remounts the active screen so it replays the slide-in animation. */}
          <div
            key={step}
            className="animate-screen-in flex flex-1 flex-col overflow-hidden lg:mx-auto lg:w-full lg:max-w-[520px]"
          >
            {step === "welcome" && (
              <WelcomeScreen onStart={() => goTo("age")} onSignIn={() => goTo("account")} />
            )}
            {step === "age" && (
              <AgeGateScreen
                confirmed={flow.ageConfirmed}
                onToggle={() => flow.setAgeConfirmed(!flow.ageConfirmed)}
                onBack={() => goTo("welcome")}
                onContinue={() => goTo("identity")}
                onUnderage={() => window.alert("You must be 18+ to use MateDate.")}
              />
            )}
            {step === "identity" && (
              <IdentityScreen
                gender={flow.gender}
                seeking={flow.seeking}
                onSelectGender={flow.setGender}
                onSelectSeeking={flow.setSeeking}
                onBack={() => goTo("age")}
                onContinue={() => goTo("goal")}
              />
            )}
            {step === "goal" && (
              <GoalQuizScreen
                selected={flow.goal}
                onSelect={flow.setGoal}
                onBack={() => goTo("identity")}
                onContinue={() => goTo("style")}
              />
            )}
            {step === "style" && (
              <StyleQuizScreen
                selected={flow.styles}
                onToggle={flow.toggleStyle}
                onBack={() => goTo("goal")}
                onContinue={() => goTo("account")}
              />
            )}
            {step === "account" && (
              <AccountScreen
                submitting={flow.submitting}
                error={flow.error}
                onBack={() => goTo("style")}
                onSubmit={flow.createAccount}
                onSkip={flow.skipAccount}
              />
            )}
            {step === "profile" && (
              <ProfileSetupScreen
                username={flow.username}
                avatarPreview={flow.avatarPreview}
                submitting={flow.submitting}
                error={flow.error}
                onUsernameChange={flow.setUsername}
                onPickAvatar={flow.setAvatarFile}
                onSave={flow.saveProfileStep}
                onSkip={flow.skipProfileStep}
              />
            )}
            {step === "done" && (
              <DoneScreen onPlay={() => router.push("/play")} onRestart={() => goTo("welcome")} />
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
