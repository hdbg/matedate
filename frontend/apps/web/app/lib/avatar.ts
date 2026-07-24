import { createClient } from "@/app/lib/supabase/client";

/** Uploaded avatars are square-cropped and downscaled to this edge before upload. */
const AVATAR_EDGE = 512;
const BUCKET = "avatars";

/** Public URL for a profiles.avatar_path (the bucket is public-read). */
export function avatarPublicUrl(path: string): string {
  return createClient().storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Center-crop + downscale a picked image to a square webp (jpeg where webp encoding is
 * unavailable), keeping uploads small and uniform regardless of what the user picked.
 */
export async function processAvatar(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const edge = Math.min(AVATAR_EDGE, side);
    const canvas = document.createElement("canvas");
    canvas.width = edge;
    canvas.height = edge;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d context unavailable");
    ctx.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      edge,
      edge,
    );
    for (const type of ["image/webp", "image/jpeg"]) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, type, 0.85),
      );
      if (blob && blob.type === type) return blob;
    }
    throw new Error("could not encode avatar");
  } finally {
    bitmap.close();
  }
}

/**
 * Upload a processed avatar under the caller's folder (storage RLS pins writes to
 * `{uid}/…`), point profiles.avatar_path at it, and best-effort delete the previous object.
 * The object name is timestamped so the public CDN URL changes on every replace.
 */
export async function uploadAvatar(userId: string, blob: Blob, previousPath: string | null) {
  const supabase = createClient();
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/avatar-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: blob.type });
  if (uploadError) throw uploadError;

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ avatar_path: path })
    .eq("id", userId);
  if (updateError) throw updateError;

  if (previousPath) void supabase.storage.from(BUCKET).remove([previousPath]);
  return path;
}

/** Clear the profile picture (back to the pawn placeholder) and drop the stored object. */
export async function removeAvatar(userId: string, path: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ avatar_path: null })
    .eq("id", userId);
  if (error) throw error;
  void supabase.storage.from(BUCKET).remove([path]);
}
