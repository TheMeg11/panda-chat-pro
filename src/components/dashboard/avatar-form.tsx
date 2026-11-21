"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Trash2 } from "lucide-react";
import { removeAvatarAction, uploadAvatarAction } from "@/app/actions/account";
import { Avatar } from "@/components/brand";
import { useI18n } from "@/components/i18n-provider";
import { errorText } from "@/lib/i18n";
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
  // v2.4.0 — undecodable picks (HEIC on old Android, etc.) surface inline.
  const [pickError, setPickError] = useState<string | null>(null);
  useEffect(() => {
    const onErr = (e: Event) => setPickError((e as CustomEvent<string>).detail ?? "avatarInvalid");
    window.addEventListener("pc-avatar-error", onErr);
    return () => window.removeEventListener("pc-avatar-error", onErr);
  }, []);
  const src =
    avatarVersion > 0 ? `/api/users/${userId}/avatar?v=${avatarVersion}${nonce > 0 ? `&_=${nonce}` : ""}` : undefined;

  return (
    <div className="rounded-2xl border border-line bg-surface-2/50 p-4">
      <p className="text-sm font-bold text-ink">{t.account.avatar}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-muted">{t.account.avatarUploadHint}</p>
      {pickError ? <p className="mt-2 text-xs font-semibold text-rose-ink">{errorText(t, pickError)}</p> : null}
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

const SERVER_ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

/**
 * Phone photos are 3–10 MB — far past the old server caps, which made the
 * request fail with no visible feedback. Downscale to a ≤1024px JPEG before
 * the request leaves the browser; the original is kept when decoding fails.
 *
 * v2.4.0 — non-portable types (iPhone HEIC/HEIF, unknown MIME from some
 * gallery pickers) are ALWAYS canvas-converted to JPEG, not just big files:
 * a small .heic used to pass through and bounce off the server's strict MIME
 * allowlist, which looked like "my avatar never shows up". If the browser
 * cannot decode it at all, a clear inline error replaces the silent failure.
 */
async function normalizeAvatarFile(file: File): Promise<{ file: File; error?: string }> {
  if (SERVER_ACCEPTED.includes(file.type) && file.size <= 400 * 1024) return { file };
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode failed"));
      el.src = url;
    });
    // v2.5.0 (B-08): the server rejects images under 512px with a terse error;
    // check the dimensions up front so the user knows the real reason.
    if (Math.min(img.naturalWidth, img.naturalHeight) < 512) {
      URL.revokeObjectURL(url);
      return { file, error: "avatarMinSize" };
    }
    const scale = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) return { file };
    return { file: new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" }) };
  } catch {
    // Undecodable and not server-accepted (e.g. HEIC on old Android) — surface
    // an honest error instead of auto-submitting a doomed upload.
    if (!SERVER_ACCEPTED.includes(file.type)) {
      return { file, error: "avatarInvalid" };
    }
    return { file };
  }
}

/** File-pick handler: normalize (downscale/convert), then auto-submit. */
async function onPickFile(event: React.ChangeEvent<HTMLInputElement>) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file) return;
  const { file: normalized, error } = await normalizeAvatarFile(file);
  if (error) {
    input.value = "";
    window.dispatchEvent(new CustomEvent("pc-avatar-error", { detail: error }));
    return;
  }
  if (normalized !== file) {
    const dt = new DataTransfer();
    dt.items.add(normalized);
    input.files = dt.files;
  }
  input.form?.requestSubmit();
}
