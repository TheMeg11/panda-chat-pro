export type ActionState = {
  ok?: boolean;
  /** key of dictionary.errors */
  error?: string;
  /** dotted dictionary path (e.g. "room.saved") or plain text */
  message?: string;
  /** extra payload (e.g. generated values, arrays like recovery codes) */
  data?: Record<string, unknown>;
};

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => (key in vars ? String(vars[key]) : `{${key}}`));
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const a = Array.from(parts[0])[0] ?? "";
  const b = parts.length > 1 ? (Array.from(parts[1])[0] ?? "") : (Array.from(parts[0])[1] ?? "");
  return (a + b).toUpperCase();
}

const PASTELS: Array<[string, string]> = [
  ["#C7D2FE", "#DDD6FE"],
  ["#BAE6FD", "#C7D2FE"],
  ["#BBF0DA", "#BAE6FD"],
  ["#F5D0E6", "#DDD6FE"],
  ["#FDE7B0", "#F8D3DF"],
  ["#DDD6FE", "#BAE6FD"],
  ["#C9F0E4", "#D9D3FB"],
];

export function pastelFor(seed: string): [string, string] {
  let h = 0;
  for (const ch of seed) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return PASTELS[h % PASTELS.length];
}

export function shortId(id: string): string {
  return id.replace(/-/g, "").slice(0, 6);
}
