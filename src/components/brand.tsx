import Link from "next/link";
import { cn, initials, pastelFor } from "@/lib/utils";

/** Panda Chat mark — the official panda sticker. */
export function PandaMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/icons/panda-mark.png"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className={`inline-block select-none ${className ?? ""}`}
      style={{ width: size, height: size }}
      draggable={false}
    />
  );
}

export function Logo({
  size = 34,
  href = "/",
  className,
  subtitle,
}: {
  size?: number;
  href?: string | null;
  className?: string;
  subtitle?: string;
}) {
  const content = (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <PandaMark size={size} className="shrink-0 drop-shadow-[0_6px_14px_rgba(115,133,244,0.28)]" />
      <span className="flex flex-col leading-none" dir="ltr">
        <span className="text-[1.06rem] font-extrabold tracking-tight text-ink">
          Panda <span className="text-accent-ink">Chat</span>
        </span>
        {subtitle ? <span className="mt-1 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-muted">{subtitle}</span> : null}
      </span>
    </span>
  );
  if (!href) return content;
  return (
    <Link href={href} className="rounded-xl outline-offset-4" aria-label="Panda Chat">
      {content}
    </Link>
  );
}

export function Avatar({
  name,
  size = 36,
  className,
  square = false,
}: {
  name: string;
  size?: number;
  className?: string;
  square?: boolean;
}) {
  const [from, to] = pastelFor(name);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-grid shrink-0 select-none place-items-center font-extrabold text-[#2f3647]",
        square ? "rounded-[30%]" : "rounded-full",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * 0.36)),
        backgroundImage: `linear-gradient(135deg, ${from}, ${to})`,
      }}
    >
      {initials(name)}
    </span>
  );
}
