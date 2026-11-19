import { Check, CheckCheck, FileText, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand";

/* Copied from the ui-redesign theme (Avatar PALETTE) — used by ProductPreview. */
export const PALETTE = ["#5B3BFF", "#16A34A", "#1F2152", "#F59E0B", "#EC4899", "#0EA5E9", "#EF4444", "#14B8A6"];

/* Theme Button (ui.tsx) — pill button used across the theme landing page. */
type Variant = "primary" | "secondary" | "soft" | "ghost" | "danger" | "dangerSoft";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-white shadow-brand hover:bg-brand-600",
  secondary: "bg-surface text-ink border border-line shadow-card hover:bg-surface-2",
  soft: "bg-brand-soft text-accent-ink hover:bg-surface-3",
  ghost: "text-ink-2 hover:bg-surface-2",
  danger: "bg-rose-ink text-white hover:opacity-90",
  dangerSoft: "bg-rose-ink/10 text-rose-ink hover:bg-rose-ink/15",
};
const SIZES: Record<Size, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-5 text-[15px]",
  lg: "h-12 px-7 text-base",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  type = "button",
  ...rest
}: React.ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition active:scale-[.98] disabled:pointer-events-none disabled:opacity-55",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Decorative, theme-aware illustration of the desktop + phone experience (not interactive). */
export function ProductPreview() {
  const rows = [0, 1, 3, 5];
  return (
    <div className="relative mx-auto w-full max-w-4xl" aria-hidden="true">
      {/* desktop window */}
      <div className="overflow-hidden rounded-[22px] border border-line bg-surface shadow-pop">
        <div className="flex items-center gap-1.5 border-b border-line bg-surface-2 px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex h-[250px] sm:h-[340px] md:h-[380px]">
          <div className="hidden w-[24%] shrink-0 flex-col gap-2 bg-side p-3 sm:flex">
            <Logo size={22} href={null} onDark className="[&_span:last-child]:text-[11px]" />
            <div className="mt-2 h-7 rounded-lg bg-brand" />
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-5 rounded-md bg-white/10" />
            ))}
          </div>
          <div className="w-[38%] shrink-0 border-e border-line p-2.5 sm:w-[30%] sm:p-3">
            <div className="mb-2.5 flex h-7 items-center gap-1.5 rounded-lg bg-surface-2 px-2 text-muted">
              <Search className="size-3" />
              <div className="h-1.5 w-12 rounded bg-line" />
            </div>
            {rows.map((c, i) => (
              <div key={i} className={`mb-1 flex items-center gap-2 rounded-xl p-1.5 ${i === 0 ? "bg-brand-soft" : ""}`}>
                <span className="size-8 shrink-0 rounded-full" style={{ background: PALETTE[c] }} />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="h-2 w-3/4 rounded bg-ink/20" />
                  <div className="h-1.5 w-1/2 rounded bg-line" />
                </div>
                {i < 2 && <span className="size-4 rounded-full bg-brand" />}
              </div>
            ))}
          </div>
          <div className="chat-pattern flex min-w-0 flex-1 flex-col gap-2.5 p-3 sm:p-4">
            <div className="flex items-center gap-2">
              <span className="size-7 rounded-full bg-brand" />
              <div className="space-y-1">
                <div className="h-2 w-20 rounded bg-ink/25" />
                <div className="h-1.5 w-12 rounded bg-line" />
              </div>
            </div>
            <div className="w-3/5 rounded-2xl rounded-es-md bg-bubble-in p-2.5 shadow-card">
              <div className="h-2 w-full rounded bg-ink/20" />
            </div>
            <div className="ms-auto flex w-3/5 items-end justify-end gap-1 rounded-2xl rounded-ee-md bg-bubble-out p-2.5">
              <div className="h-2 flex-1 rounded bg-white/70" />
              <CheckCheck className="size-3 text-white/80" />
            </div>
            <div className="flex w-1/2 items-center gap-2 rounded-2xl bg-bubble-in p-2.5 shadow-card">
              <span className="grid size-8 place-items-center rounded-lg bg-brand text-white">
                <FileText className="size-4" />
              </span>
              <div className="space-y-1">
                <div className="h-2 w-16 rounded bg-ink/25" />
                <div className="h-1.5 w-8 rounded bg-line" />
              </div>
            </div>
            <div className="mt-auto flex items-center gap-2">
              <div className="h-8 flex-1 rounded-full border border-line bg-surface" />
              <span className="grid size-8 place-items-center rounded-full bg-brand text-white">
                <Check className="size-3.5" />
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* phone */}
      <div className="absolute -bottom-6 end-2 w-[34%] max-w-[200px] rounded-[28px] border-[5px] border-ink bg-surface p-2 shadow-pop dark:border-[#2d3260] sm:end-6">
        <div className="mx-auto mb-2 h-1 w-8 rounded-full bg-ink/20" />
        <div className="mb-2 flex items-center justify-between">
          <div className="h-2 w-14 rounded bg-ink/30" />
          <Search className="size-3 text-muted" />
        </div>
        <div className="mb-2 flex gap-1">
          <div className="h-1.5 flex-1 rounded bg-brand" />
          <div className="h-1.5 flex-1 rounded bg-line" />
          <div className="h-1.5 flex-1 rounded bg-line" />
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="mb-1.5 flex items-center gap-1.5">
            <span className="size-6 shrink-0 rounded-full" style={{ background: PALETTE[[0, 1, 3][i]] }} />
            <div className="flex-1 space-y-1">
              <div className="h-1.5 w-3/4 rounded bg-ink/25" />
              <div className="h-1 w-1/2 rounded bg-line" />
            </div>
          </div>
        ))}
        <div className="mt-2 flex justify-around border-t border-line pt-1.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className={`size-3 rounded-full ${i === 0 ? "bg-brand" : "bg-line"}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
