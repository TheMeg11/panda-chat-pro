"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Trash2 } from "lucide-react";
import { removeAvatarAction, uploadAvatarAction } from "@/app/actions/account";
import { Avatar } from "@/components/brand";
import { useI18n } from "@/components/i18n-provider";
import { ActionButton, ActionForm, useFormState } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * Avatar picker for the settings page: shows the current picture (or the
 * initials fallback), uploads a replacement via a hidden file input that
 * auto-submits, and removes the stored picture. The version prop busts the
 * browser cache; a local nonce handles same-version replacements.
 */
export function AvatarForm({
  userId,
  displayName,
  avatarVersion,
}: {
  userId: string;
  displayName: string;
  avatarVersion: number;
}) {
  const { t } = useI18n();
  // Bumped after a successful upload so a *replacement* picture (same
  // server-side version number) still re-fetches instead of hitting cache.
  const [nonce, setNonce] = useState(0);
  const src =
    avatarVersion > 0 ? `/api/users/${userId}/avatar?v=${avatarVersion}${nonce > 0 ? `&_=${nonce}` : ""}` : undefined;

  return (
    <div className="rounded-2xl border border-line bg-surface-2/50 p-4">
      <p className="text-sm font-bold text-ink">{t.account.avatar}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-muted">{t.account.avatarUploadHint}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Avatar name={displayName} size={64} src={src} />
        <ActionForm action={uploadAvatarAction}>
          <UploadButton onUploaded={() => setNonce((n) => n + 1)} />
        </ActionForm>
        {avatarVersion > 0 ? (
          <ActionButton action={removeAvatarAction} fields={{}} className="btn btn-ghost btn-sm text-rose-ink">
            <Trash2 className="size-4" />
            {t.account.avatarRemove}
          </ActionButton>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The file-picker button; lives inside <ActionForm> to read its state.
 *
 * The success effect must depend ONLY on `state`: `onUploaded` is an inline
 * arrow with a new identity on every render, and depending on it made the
 * effect re-run after its own re-render — an infinite loop of avatar
 * refetches + RSC refreshes (~50 req/s) that also swallowed every *further*
 * upload attempt. The callback is read through a ref instead.
 */
function UploadButton({ onUploaded }: { onUploaded: () => void }) {
  const { t } = useI18n();
  const { state, pending } = useFormState();
  const router = useRouter();
  const uploadedRef = useRef(onUploaded);
  uploadedRef.current = onUploaded;

  useEffect(() => {
    if (!state.ok) return;
    uploadedRef.current();
    router.refresh();
  }, [state, router]);

  return (
    <label className={cn("btn btn-secondary cursor-pointer", pending && "pointer-events-none opacity-60")}>
      {pending ? <span className="spinner" aria-hidden="true" /> : <ImagePlus className="size-4" />}
      {pending ? t.account.avatarUploading : t.account.avatarUpload}
      <input
        type="file"
        hidden
        accept="image/png,image/jpeg,image/webp"
        name="avatar"
        disabled={pending}
        onChange={onPickFile}
      />
    </label>
  );
}

/**
 * Phone photos are 3–10 MB — far past the old server caps, which made the
 * request fail with no visible feedback. Downscale to a ≤1024px JPEG before
 * the request leaves the browser; the original is kept when decoding fails.
 */
async function normalizeAvatarFile(file: File): Promise<File> {
  if (file.size <= 400 * 1024) return file;
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode failed"));
      el.src = url;
    });
    const scale = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/** File-pick handler: normalize oversized images, then auto-submit the form. */
async function onPickFile(event: React.ChangeEvent<HTMLInputElement>) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file) return;
  const normalized = await normalizeAvatarFile(file);
  if (normalized !== file) {
    const dt = new DataTransfer();
    dt.items.add(normalized);
    input.files = dt.files;
  }
  input.form?.requestSubmit();
}
