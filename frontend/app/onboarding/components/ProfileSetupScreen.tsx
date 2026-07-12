"use client";

import { useRef } from "react";
import { Avatar } from "@/app/components/ui/Avatar";
import { Button } from "@/app/components/ui/Button";
import { Field } from "@/app/components/ui/Field";
import { Eyebrow, OnboardingScreen, Spacer, Sub, Title } from "./chrome";

/**
 * Optional last step: photo + username. The account already exists here (this step runs
 * post-auth so the upload and profile write just work), hence no back button.
 */
export function ProfileSetupScreen({
  username,
  avatarPreview,
  submitting,
  error,
  onUsernameChange,
  onPickAvatar,
  onSave,
  onSkip,
}: {
  username: string;
  avatarPreview: string | null;
  submitting: boolean;
  error: string | null;
  onUsernameChange: (value: string) => void;
  onPickAvatar: (file: File | null) => void;
  onSave: () => void;
  onSkip: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const hasAnything = username.length > 0 || avatarPreview !== null;

  return (
    <OnboardingScreen>
      <Eyebrow>Finishing touch</Eyebrow>
      <Title>Show your best side</Title>
      <Sub>
        Add a photo and pick a handle — both optional. Skip and you&apos;ll play as the pawn.
      </Sub>

      <div className="mb-5 flex items-center gap-4">
        <Avatar path={null} previewUrl={avatarPreview} size={84} className="ring-4 ring-rosy/30" />
        <div className="flex flex-col items-start gap-1.5">
          <Button
            variant="oauth"
            disabled={submitting}
            onClick={() => fileInput.current?.click()}
          >
            {avatarPreview ? "Change photo" : "Add a photo"}
          </Button>
          {avatarPreview && (
            <Button variant="link" disabled={submitting} onClick={() => onPickAvatar(null)}>
              Remove
            </Button>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            onPickAvatar(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
      </div>

      <Field
        label="Username · optional"
        placeholder="e.g. rook_ie"
        autoComplete="username"
        value={username ? `@${username}` : ""}
        onChange={(e) => onUsernameChange(e.target.value.replace(/^@/, ""))}
      />
      {error && <p className="text-[13px] font-semibold text-rosy-deep">{error}</p>}

      <Spacer />
      <Button disabled={submitting || !hasAnything} onClick={onSave}>
        {submitting ? "Saving…" : "Save & continue"}
      </Button>
      <Button variant="link" disabled={submitting} onClick={onSkip}>
        Skip for now — <b className="text-rosy-deep">the pawn suits me</b>
      </Button>
    </OnboardingScreen>
  );
}
