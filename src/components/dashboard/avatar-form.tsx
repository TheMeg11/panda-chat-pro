"use client";

import { useEffect, useState } from "react";
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

/** The file-picker button; lives inside <ActionForm> to read its state. */
function UploadButton({ onUploaded }: { onUploaded: () => void }) {
  const { t } = useI18n();
  const { state, pending } = useFormState();
  const router = useRouter();

  useEffect(() => {
    if (!state.ok) return;
    onUploaded();
    router.refresh();
  }, [state, onUploaded, router]);

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
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      />
    </label>
  );
}
