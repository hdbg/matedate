"use client";

import { cn } from "@/app/lib/utils";
import { avatarPublicUrl } from "@/app/lib/avatar";

interface AvatarProps {
  /** profiles.avatar_path; null renders the pawn placeholder. */
  path: string | null;
  /** Rendered edge in px. */
  size: number;
  className?: string;
  /** Object URL of a not-yet-uploaded pick (preview wins over `path`). */
  previewUrl?: string | null;
}

/** Round profile picture, falling back to the pawn mock when no photo is set. */
export function Avatar({ path, size, className, previewUrl }: AvatarProps) {
  const src = previewUrl ?? (path ? avatarPublicUrl(path) : null);
  if (!src) {
    return (
      <span
        aria-hidden
        className={cn(
          "grid shrink-0 place-items-center overflow-hidden rounded-full bg-ink/[0.08]",
          className,
        )}
        style={{ width: size, height: size }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assets/white-pawn.svg"
          alt=""
          style={{ width: size * 0.72, height: size * 0.72 }}
        />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="Profile picture"
      className={cn("shrink-0 rounded-full object-cover", className)}
      style={{ width: size, height: size }}
    />
  );
}
