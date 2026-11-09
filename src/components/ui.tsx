"use client";

import {
  createContext,
  startTransition,
  useActionState,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Check, Copy, Eye, EyeOff, Languages, Moon, Sun, X } from "lucide-react";
import { useI18n } from "./i18n-provider";
import { errorText, formatDate, formatRelative, LANG_COOKIE, tr } from "@/lib/i18n";
import { cn, type ActionState } from "@/lib/utils";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

/* ------------------------------------------------------------------ */
/* Hydration helper                                                    */
/* ------------------------------------------------------------------ */

const noopSubscribe = () => () => {};
export function useHydrated() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

const NOW_STEP = 15_000;
const subscribeNow = (callback: () => void) => {
  const id = setInterval(callback, NOW_STEP);
  return () => clearInterval(id);
};
const nowSnapshot = () => Math.floor(Date.now() / NOW_STEP) * NOW_STEP;
/** Current time at 15s resolution, without impure calls during render (0 during SSR/hydration). */
export function useNow() {
  return useSyncExternalStore(subscribeNow, nowSnapshot, () => 0);
}

/* ------------------------------------------------------------------ */
/* Theme & language                                                    */
/* ------------------------------------------------------------------ */

export function ThemeToggle({ className }: { className?: string }) {
  const { t } = useI18n();
  const toggle = () => {
    const root = document.documentElement;
    const dark = !root.classList.contains("dark");
    root.classList.toggle("dark", dark);
    root.style.colorScheme = dark ? "dark" : "light";
    try {
      localStorage.setItem("pc-theme", dark ? "dark" : "light");
    } catch {
      /* private mode */
    }
  };
  return (
    <button type="button" onClick={toggle} className={cn("btn btn-ghost btn-icon", className)} aria-label={t.common.toggleTheme} title={t.common.toggleTheme}>
      <Moon className="size-[18px] dark:hidden" />
      <Sun className="hidden size-[18px] dark:block" />
    </button>
  );
}

export function LangToggle({ className, compact = false }: { className?: string; compact?: boolean }) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const switchLang = () => {
    const next = lang === "fa" ? "en" : "fa";
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => router.refresh());
  };
  return (
    <button
      type="button"
      onClick={switchLang}
      className={cn("btn btn-ghost", compact ? "btn-icon" : "px-3", className)}
      aria-label={t.common.switchLanguageLabel}
      title={t.common.switchLanguageLabel}
    >
      <Languages className="size-[18px]" />
      {compact ? null : <span className="text-[0.8rem]">{t.common.switchLanguage}</span>}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Server-action forms (no automatic reset, pending state, messages)   */
/* ------------------------------------------------------------------ */

const FormCtx = createContext<{ pending: boolean; state: ActionState }>({ pending: false, state: {} });

export function ActionForm({
  action,
  children,
  className,
  confirm,
  resetOnSuccess = false,
  showMessage = true,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  confirm?: string;
  resetOnSuccess?: boolean;
  showMessage?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && resetOnSuccess) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <FormCtx.Provider value={{ pending, state }}>
      <form
        ref={formRef}
        className={className}
        onSubmit={(event) => {
          event.preventDefault();
          if (confirm && !window.confirm(confirm)) return;
          const data = new FormData(event.currentTarget);
          startTransition(() => formAction(data));
        }}
      >
        {children}
        {showMessage ? <FormMessage /> : null}
      </form>
    </FormCtx.Provider>
  );
}

export function useFormState() {
  return useContext(FormCtx);
}

export function FormMessage({ className }: { className?: string }) {
  const { state, pending } = useContext(FormCtx);
  const { t } = useI18n();
  if (pending) return null;
  if (state.error) {
    return (
      <p role="alert" className={cn("notice notice-rose pop-in mt-3", className)}>
        {errorText(t, state.error)}
      </p>
    );
  }
  if (state.ok && state.message) {
    return (
      <p role="status" className={cn("notice notice-mint pop-in mt-3", className)}>
        <Check className="mt-0.5 size-4 shrink-0" />
        {tr(t, state.message)}
      </p>
    );
  }
  return null;
}

export function SubmitButton({
  children,
  className = "btn btn-primary",
  disabled,
  title,
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  title?: string;
}) {
  const { pending } = useContext(FormCtx);
  return (
    <button type="submit" className={className} disabled={pending || disabled} aria-busy={pending} title={title}>
      {pending ? <span className="spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

/** A single-button form posting hidden fields to a server action. */
export function ActionButton({
  action,
  fields,
  confirm,
  className = "btn btn-secondary btn-sm",
  children,
  title,
}: {
  action: Action;
  fields: Record<string, string>;
  confirm?: string;
  className?: string;
  children: ReactNode;
  title?: string;
}) {
  return (
    <ActionForm action={action} confirm={confirm} showMessage={false} className="inline-flex flex-col items-start">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <SubmitButton className={className} title={title}>
        {children}
      </SubmitButton>
      <InlineError />
    </ActionForm>
  );
}

function InlineError() {
  const { state, pending } = useContext(FormCtx);
  const { t } = useI18n();
  if (pending || !state.error) return null;
  return <span className="mt-1 text-xs font-semibold text-rose-ink">{errorText(t, state.error)}</span>;
}

/* ------------------------------------------------------------------ */
/* Small utilities                                                     */
/* ------------------------------------------------------------------ */

export function CopyButton({
  value,
  className = "btn btn-secondary btn-sm",
  label,
}: {
  value: string;
  className?: string;
  label?: string;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const area = document.createElement("textarea");
      area.value = value;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <button type="button" onClick={copy} className={className} aria-live="polite">
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      {copied ? t.common.copied : (label ?? t.common.copy)}
    </button>
  );
}

export function LocalTime({
  iso,
  mode = "datetime",
  className,
}: {
  iso: string | null | undefined;
  mode?: "datetime" | "date" | "relative" | "time";
  className?: string;
}) {
  const { lang, t } = useI18n();
  const hydrated = useHydrated();
  if (!iso) return <span className={className}>{t.common.never}</span>;
  let text = "";
  if (hydrated) {
    if (mode === "relative") text = formatRelative(iso, lang);
    else if (mode === "date") text = formatDate(iso, lang, { dateStyle: "medium" });
    else if (mode === "time") text = formatDate(iso, lang, { hour: "2-digit", minute: "2-digit" });
    else text = formatDate(iso, lang, { dateStyle: "medium", timeStyle: "short" });
  }
  return (
    <time dateTime={iso} className={className} title={hydrated ? formatDate(iso, lang, { dateStyle: "full", timeStyle: "short" }) : undefined}>
      {text || "\u00a0"}
    </time>
  );
}

export function PasswordInput({
  name,
  placeholder,
  autoComplete = "current-password",
  required = true,
  minLength,
  id,
}: {
  name: string;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  id?: string;
}) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        id={id ?? name}
        name={name}
        type={visible ? "text" : "password"}
        className="input pe-11"
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        dir="ltr"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 end-0 grid w-11 place-items-center text-faint transition hover:text-ink"
        aria-label={visible ? t.common.hide : t.common.show}
      >
        {visible ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
      </button>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  // Portalled to <body> AND propagation-stopped: modals can be opened from
  // inside clickable cards (e.g. the room-card "⋯" button). React portals keep
  // bubbling synthetic events through the React tree, so without stopPropagation
  // every click inside the dialog would also reach the parent <Link>/<button>.
  return createPortal(
    // The outer container is the scroll area, so a dialog taller than the viewport
    // (small phones, landscape, zoomed text) scrolls instead of being cut off.
    <div
      className="fixed inset-0 z-50 overflow-y-auto overscroll-contain"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onSubmit={(e) => e.stopPropagation()}
    >
      <div className="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-6">
        <button type="button" aria-label={t.common.close} onClick={onClose} className="fixed inset-0 bg-[#1b1f2e]/30 backdrop-blur-[3px] dark:bg-black/50" />
        <div className="pop-in relative my-auto w-full max-w-lg rounded-t-3xl border border-line bg-surface p-6 shadow-float sm:my-0 sm:rounded-2xl sm:p-7">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-extrabold text-ink">{title}</h2>
              {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
            </div>
            <button type="button" onClick={onClose} className="btn btn-ghost btn-icon btn-sm -me-2 -mt-1" aria-label={t.common.close}>
              <X className="size-4" />
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
