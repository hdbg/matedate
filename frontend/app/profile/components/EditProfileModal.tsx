"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/app/components/ui/Avatar";
import { Field } from "@/app/components/ui/Field";
import { processAvatar, removeAvatar, uploadAvatar } from "@/app/lib/avatar";
import { createClient } from "@/app/lib/supabase/client";
import type { DatingGoal, TextingStyle } from "@/app/lib/supabase/types";
import { isValidUsername, normalizeUsername, usernameSaveError } from "@/app/lib/username";
import { cn } from "@/app/lib/utils";
import { DATING_GOALS, TEXTING_STYLES } from "@/app/onboarding/options";
import type { ProfileData } from "../profileData";

interface EditProfileModalProps {
  data: ProfileData;
  /** Called after a successful save (or avatar change) so the page can reload the profile. */
  onSaved: (toast: string) => void;
  onClose: () => void;
}

/**
 * Edit the user-ownable profile slice: photo, display name, username, and the quiz
 * preferences. Gender/seeking are deliberately absent — they drive matchmaking and stay
 * as onboarded. Avatar changes apply eagerly (they're already stored objects); the text +
 * preference fields save together on submit.
 */
export function EditProfileModal({ data, onSaved, onClose }: EditProfileModalProps) {
  const [displayName, setDisplayName] = useState(data.rawDisplayName ?? "");
  const [username, setUsername] = useState(data.username ?? "");
  const [goal, setGoal] = useState<DatingGoal | null>(data.prefs.goal);
  const [styles, setStyles] = useState<TextingStyle[]>(data.prefs.styles);
  const [avatarPath, setAvatarPath] = useState(data.avatarPath);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const changeAvatar = async (file: File) => {
    setAvatarBusy(true);
    setError(null);
    try {
      const blob = await processAvatar(file);
      const path = await uploadAvatar(data.userId, blob, avatarPath);
      setAvatarPath(path);
      onSaved("Photo updated");
    } catch {
      setError("Couldn't upload that photo. Try another one.");
    } finally {
      setAvatarBusy(false);
    }
  };

  const clearAvatar = async () => {
    if (!avatarPath) return;
    setAvatarBusy(true);
    setError(null);
    try {
      await removeAvatar(data.userId, avatarPath);
      setAvatarPath(null);
      onSaved("Photo removed");
    } catch {
      setError("Couldn't remove the photo. Try again.");
    } finally {
      setAvatarBusy(false);
    }
  };

  const save = async () => {
    if (username && !isValidUsername(username)) {
      setError("Username: 3–20 characters — lowercase letters, numbers, underscores.");
      return;
    }
    setSaving(true);
    setError(null);
    const { error: updateError } = await createClient()
      .from("profiles")
      .update({
        display_name: displayName.trim() || null,
        username: username || null,
        dating_goal: goal,
        texting_style: styles,
      })
      .eq("id", data.userId);
    setSaving(false);
    if (updateError) {
      setError(usernameSaveError(updateError.code) ?? "Couldn't save. Try again.");
      return;
    }
    onSaved("Profile updated");
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/70 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit profile"
        onClick={(e) => e.stopPropagation()}
        className="animate-after-game-pop relative m-auto w-full max-w-[440px] rounded-[30px] bg-paper p-[26px_22px_22px] shadow-[0_40px_90px_rgba(0,0,0,0.5)] lg:p-[30px_28px_26px]"
      >
        <button
          type="button"
          title="Close"
          onClick={onClose}
          className="absolute right-4 top-4 grid h-[34px] w-[34px] cursor-pointer place-items-center rounded-full border-none bg-ink/[0.08] text-[16px] text-ink hover:bg-ink/[0.16]"
        >
          ✕
        </button>

        <h1 className="mb-4 text-[24px] font-extrabold tracking-[-0.03em]">Edit profile</h1>

        <div className="mb-5 flex items-center gap-4">
          <Avatar path={avatarPath} size={72} className="ring-[3px] ring-rosy" />
          <div className="flex flex-col items-start gap-1">
            <button
              type="button"
              disabled={avatarBusy}
              onClick={() => fileInput.current?.click()}
              className="cursor-pointer rounded-pill border border-ink/[0.14] bg-white px-4 py-2 text-[13px] font-bold text-ink hover:border-rosy disabled:opacity-60"
            >
              {avatarBusy ? "Working…" : avatarPath ? "Change photo" : "Add a photo"}
            </button>
            {avatarPath && !avatarBusy && (
              <button
                type="button"
                onClick={clearAvatar}
                className="cursor-pointer p-1 font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-ink-mute hover:text-rosy-deep"
              >
                Remove — back to the pawn
              </button>
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void changeAvatar(file);
              e.target.value = "";
            }}
          />
        </div>

        <Field
          label="Display name"
          placeholder="How you appear in games"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <Field
          label="Username"
          placeholder="e.g. rook_ie"
          autoComplete="username"
          value={username ? `@${username}` : ""}
          onChange={(e) => setUsername(normalizeUsername(e.target.value.replace(/^@/, "")))}
        />

        <div className="mb-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-ink-mute">
          Dating goal
        </div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {DATING_GOALS.map((opt) => (
            <PillOption
              key={opt.value}
              selected={goal === opt.value}
              onClick={() => setGoal(opt.value)}
            >
              {opt.icon} {opt.title}
            </PillOption>
          ))}
        </div>

        <div className="mb-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-ink-mute">
          Texting style
        </div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {TEXTING_STYLES.map((opt) => (
            <PillOption
              key={opt.value}
              selected={styles.includes(opt.value)}
              onClick={() =>
                setStyles((prev) =>
                  prev.includes(opt.value)
                    ? prev.filter((s) => s !== opt.value)
                    : [...prev, opt.value],
                )
              }
            >
              {opt.icon} {opt.title}
            </PillOption>
          ))}
        </div>

        {error && <p className="mb-2 text-[13px] font-semibold text-rosy-deep">{error}</p>}

        <button
          type="button"
          disabled={saving || avatarBusy}
          onClick={save}
          className="w-full cursor-pointer rounded-full border-none bg-rosy px-[22px] py-[14px] text-[16px] font-bold text-white shadow-[0_6px_0_var(--rosy-deep)] transition hover:bg-rosy-deep active:translate-y-[3px] active:shadow-[0_3px_0_var(--rosy-deep)] disabled:cursor-default disabled:opacity-80 disabled:active:translate-y-0"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

function PillOption({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-pill border px-3.5 py-2 text-[13px] font-semibold transition-colors",
        selected
          ? "border-rosy bg-rosy text-white"
          : "border-ink/[0.14] bg-white text-ink hover:border-rosy",
      )}
    >
      {children}
    </button>
  );
}
