import type { ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="fade-up mb-7">
      {back ? (
        <Link href={back.href} className="mb-3 inline-flex items-center gap-1 text-sm font-bold text-muted transition hover:text-accent-ink">
          <ChevronLeft className="size-4 rtl:rotate-180" />
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-ink sm:text-[1.75rem]">{title}</h1>
          {subtitle ? <div className="mt-1.5 text-muted">{subtitle}</div> : null}
        </div>
        {actions}
      </div>
    </div>
  );
}

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "bg-accent-soft text-accent-ink",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-muted">{label}</p>
        <span className={cn("grid size-9 place-items-center rounded-xl", tone)}>
          <Icon className="size-[18px]" />
        </span>
      </div>
      <p className="mt-2 text-3xl font-extrabold leading-none text-ink">{value}</p>
      {hint ? <p className="mt-2 text-xs text-faint">{hint}</p> : null}
    </div>
  );
}

export function Section({
  title,
  icon: Icon,
  actions,
  children,
  className,
  tone = "bg-accent-soft text-accent-ink",
}: {
  title: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: string;
}) {
  return (
    <section className={cn("card overflow-hidden", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <h2 className="flex items-center gap-2.5 font-extrabold text-ink">
          {Icon ? (
            <span className={cn("grid size-8 place-items-center rounded-lg", tone)}>
              <Icon className="size-4" />
            </span>
          ) : null}
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}

export function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-10 text-center text-sm text-muted">
        {text}
      </td>
    </tr>
  );
}
