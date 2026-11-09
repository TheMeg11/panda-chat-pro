"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  Check,
  Copy,
  Download,
  File as FileIcon,
  FileWarning,
  Image as ImageIcon,
  KeyRound,
  Lock,
  LockKeyhole,
  Music,
  Paperclip,
  Reply,
  Send,
  SendHorizontal,
  ShieldAlert,
  Trash2,
  Video,
  WifiOff,
  X,
} from "lucide-react";
import { Avatar } from "@/components/brand";
import { useI18n } from "@/components/i18n-provider";
import { useHydrated } from "@/components/ui";
import type { ChatMessage, ChatSnapshot } from "@/lib/chat";
import { errorText, formatDate, formatNumber } from "@/lib/i18n";
import { cn, fmt } from "@/lib/utils";

type Props = {
  endpoint: string;
  initial: ChatSnapshot;
  maxLength: number;
  headerStart?: ReactNode;
  headerActions?: ReactNode;
  className?: string;
};

type Item =
  | { kind: "day"; key: string; label: string }
  | { kind: "msg"; m: ChatMessage; cont: boolean };

const lastId = (list: ChatMessage[]) => list.reduce((max, m) => (m.id > max ? m.id : max), 0);
const GROUP_MS = 5 * 60_000;

function formatSize(bytes: number): string {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function linkify(text: string): ReactNode[] {
  return text.split(/(https?:\/\/[^\s<]+)/g).map((part, i) =>
    i % 2 === 1 ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow" className="break-all font-semibold underline decoration-1 underline-offset-2">
        {part}
      </a>
    ) : (
      part
    ),
  );
}

export function ChatView({ endpoint, initial, maxLength, headerStart, headerActions, className }: Props) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const hydrated = useHydrated();
  const me = initial.me;

  const [messages, setMessages] = useState<ChatMessage[]>(initial.messages);
  const [room, setRoom] = useState(initial.room);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [lost, setLost] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [unseen, setUnseen] = useState(0);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [expiredFiles, setExpiredFiles] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const versionRef = useRef(initial.stateVersion);
  const lastIdRef = useRef(lastId(initial.messages));
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const atBottomRef = useRef(true);
  const countRef = useRef(initial.messages.length);

  const apply = useCallback((snap: ChatSnapshot) => {
    versionRef.current = snap.stateVersion;
    setRoom(snap.room);
    if (snap.reset) {
      setMessages(snap.messages);
      lastIdRef.current = lastId(snap.messages);
    } else if (snap.messages.length) {
      setMessages((prev) => {
        const known = new Set(prev.map((m) => m.id));
        const fresh = snap.messages.filter((m) => !known.has(m.id));
        return fresh.length ? [...prev, ...fresh] : prev;
      });
      lastIdRef.current = Math.max(lastIdRef.current, lastId(snap.messages));
    }
  }, []);

  /* Polling loop — adaptive (2s visible, 8s hidden), stops when access changes. */
  useEffect(() => {
    let stopped = false;
    let busy = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (ms: number) => {
      clearTimeout(timer);
      if (!stopped) timer = setTimeout(tick, ms);
    };
    async function tick() {
      if (stopped || busy) return;
      busy = true;
      let next = document.hidden ? 8000 : 2000;
      try {
        const res = await fetch(`${endpoint}?after=${lastIdRef.current}&v=${versionRef.current}`, { cache: "no-store" });
        if ([401, 403, 404, 503].includes(res.status)) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          stopped = true;
          setLost(data.error ?? "gone");
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        apply((await res.json()) as ChatSnapshot);
        setOffline(false);
      } catch {
        setOffline(true);
        next = 5000;
      } finally {
        busy = false;
      }
      schedule(next);
    }
    schedule(1500);
    const onVisible = () => {
      if (!document.hidden) schedule(0);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [endpoint, apply, epoch]);

  const scrollToBottom = useCallback((smooth: boolean) => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  useLayoutEffect(() => {
    scrollToBottom(false);
  }, [scrollToBottom]);

  useLayoutEffect(() => {
    const added = messages.length - countRef.current;
    countRef.current = messages.length;
    if (atBottomRef.current) {
      scrollToBottom(true);
      setUnseen(0);
    } else if (added > 0) {
      setUnseen((n) => n + added);
    }
  }, [messages, scrollToBottom]);

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [draft]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
    atBottomRef.current = near;
    if (near) setUnseen(0);
  };

  const send = async () => {
    const body = draft.trim();
    if ((!body && !pendingFile) || sending) return;
    if (body.length > maxLength) return setError("messageTooLong");
    setSending(true);
    setError(null);
    try {
      let fileId: string | null = null;
      if (pendingFile) {
        setUploading(true);
        const form = new FormData();
        form.append("file", pendingFile);
        const upRes = await fetch(endpoint.replace(/\/messages$/, "/files"), { method: "POST", body: form });
        const upData = (await upRes.json().catch(() => ({}))) as { id?: string; error?: string };
        if (!upRes.ok || !upData.id) {
          setError(upData.error ?? "uploadFailed");
          return;
        }
        fileId = upData.id;
        setUploading(false);
      }
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body, fileId, replyToId: replyTo?.id ?? null, after: lastIdRef.current, v: versionRef.current }),
      });
      const data = (await res.json().catch(() => ({}))) as ChatSnapshot & { error?: string };
      if (!res.ok) {
        const code = data.error ?? "generic";
        if (res.status === 401 || res.status === 404 || res.status === 503 || (res.status === 403 && !["roomLocked", "unauthorized"].includes(code))) {
          setLost(code);
        } else {
          setError(code);
        }
        return;
      }
      setDraft("");
      setPendingFile(null);
      setReplyTo(null);
      atBottomRef.current = true;
      apply(data);
    } catch {
      setError("network");
    } finally {
      setSending(false);
      setUploading(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const remove = async (m: ChatMessage) => {
    setActiveId(null);
    if (!window.confirm(t.chat.deleteConfirm)) return;
    const res = await fetch(`${endpoint}?id=${m.id}`, { method: "DELETE" });
    if (res.ok) setMessages((prev) => prev.filter((x) => x.id !== m.id));
    else setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "generic");
  };

  const copy = async (m: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(m.body);
    } catch {
      /* clipboard unavailable */
    }
    setCopiedId(m.id);
    setTimeout(() => setCopiedId(null), 1300);
  };

  const startReply = (m: ChatMessage) => {
    setReplyTo(m);
    setActiveId(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const jumpTo = (id: number) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("animate-pulse");
    setTimeout(() => el.classList.remove("animate-pulse"), 1200);
  };

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    const now = new Date();
    const todayKey = now.toDateString();
    const yesterdayKey = new Date(now.getTime() - 86_400_000).toDateString();
    let prev: ChatMessage | null = null;
    for (const m of messages) {
      const d = new Date(m.createdAt);
      const newDay = !prev || new Date(prev.createdAt).toDateString() !== d.toDateString();
      if (hydrated && newDay) {
        const key = d.toDateString();
        const label =
          key === todayKey
            ? t.chat.today
            : key === yesterdayKey
              ? t.chat.yesterday
              : formatDate(d, lang, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
                });
        out.push({ kind: "day", key: `day-${key}`, label });
      }
      const cont = Boolean(
        prev &&
          !newDay &&
          prev.authorRole !== "system" &&
          m.authorRole !== "system" &&
          prev.memberId === m.memberId &&
          prev.authorName === m.authorName &&
          d.getTime() - new Date(prev.createdAt).getTime() < GROUP_MS,
      );
      out.push({ kind: "msg", m, cont });
      prev = m;
    }
    return out;
  }, [messages, hydrated, lang, t]);

  const systemText = (m: ChatMessage) => {
    const map: Record<string, string> = {
      joined: fmt(t.chat.joined, { name: m.authorName }),
      left: fmt(t.chat.left, { name: m.authorName }),
      removed: fmt(t.chat.removed, { name: m.authorName }),
      cleared: t.chat.cleared,
      locked: t.chat.locked,
      unlocked: t.chat.unlocked,
      dmCreated: t.chat.dmCreated,
    };
    return map[m.body] ?? m.body;
  };

  const lostText =
    (
      {
        password: t.chat.lostPassword,
        banned: t.chat.lostBanned,
        join: t.chat.lostJoin,
        unauthorized: t.chat.lostUnauthorized,
        maintenance: t.chat.lostMaintenance,
        disabled: t.chat.lostDisabled,
      } as Record<string, string>
    )[lost ?? ""] ?? t.chat.lostGone;

  const remaining = maxLength - draft.length;
  const composerLocked = room.isLocked && me.role === "guest";

  return (
    <div className={cn("relative flex h-full min-h-0 flex-col bg-canvas", className)}>
      {/* Room header */}
      <header className="z-10 flex shrink-0 items-center gap-3 border-b border-line bg-surface/90 px-3 py-2.5 backdrop-blur sm:px-5 sm:py-3">
        {headerStart}
        <Avatar name={room.name} size={40} square={!room.direct} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[0.98rem] font-extrabold text-ink" dir="auto">
            {room.name}
          </h1>
          {room.subtitle ? (
            <p className="truncate text-xs text-muted" dir="ltr">
              {room.subtitle}
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <span>{fmt(room.memberCount === 1 ? t.chat.membersCountOne : t.chat.membersCount, { n: formatNumber(room.memberCount, lang) })}</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-[#4cc79a]" aria-hidden="true" />
                {fmt(t.chat.onlineCount, { n: formatNumber(room.onlineCount, lang) })}
              </span>
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {room.hasPassword ? (
            <span className="badge badge-accent hidden sm:inline-flex">
              <KeyRound className="size-3" />
              {t.chat.protected}
            </span>
          ) : null}
          {room.isLocked ? (
            <span className="badge badge-amber">
              <Lock className="size-3" />
              {t.chat.lockedBadge}
            </span>
          ) : null}
          {headerActions}
        </div>
      </header>

      {/* Messages */}
      <div className="relative min-h-0 flex-1">
        {offline ? (
          <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center">
            <span className="badge badge-amber shadow-soft">
              <WifiOff className="size-3" />
              {t.chat.reconnecting}
            </span>
          </div>
        ) : null}
        <div ref={listRef} onScroll={onScroll} className="chat-surface h-full overflow-y-auto overscroll-contain px-3 py-5 sm:px-6">
          <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-end">
            <div className="mx-auto mb-6 mt-2 max-w-sm text-center">
              <Avatar name={room.name} size={58} square={!room.direct} className="mx-auto shadow-card" />
              <p className="mt-3 font-extrabold text-ink" dir="auto">
                {room.name}
              </p>
              {room.description ? (
                <p className="mt-1 text-sm leading-relaxed text-muted" dir="auto">
                  {room.description}
                </p>
              ) : null}
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface/90 px-3 py-1 text-[11px] font-semibold text-muted shadow-soft">
                <LockKeyhole className="size-3" />
                {t.invite.privateNote}
              </p>
              {messages.length === 0 ? (
                <div className="mt-8">
                  <p className="font-extrabold text-ink">{t.chat.emptyTitle}</p>
                  <p className="mt-1 text-sm text-muted">{t.chat.emptyText}</p>
                </div>
              ) : null}
            </div>

            {items.map((item) => {
              if (item.kind === "day") {
                return (
                  <div key={item.key} className="my-4 flex justify-center">
                    <span className="rounded-full border border-line bg-surface/90 px-3 py-1 text-[11px] font-bold text-muted shadow-soft backdrop-blur">
                      {item.label}
                    </span>
                  </div>
                );
              }
              const { m, cont } = item;
              if (m.authorRole === "system") {
                return (
                  <div key={m.id} className="my-2.5 flex justify-center">
                    <span className="rounded-full bg-surface-3/90 px-3 py-1 text-center text-[11.5px] font-semibold text-muted" dir="auto">
                      {systemText(m)}
                    </span>
                  </div>
                );
              }
              const mine = m.mine;
              const active = activeId === m.id;
              return (
                <div
                  key={m.id}
                  id={`msg-${m.id}`}
                  className={cn("group flex gap-2", mine ? "justify-end" : "justify-start", cont ? "mt-1" : "mt-4")}
                >
                  {!mine ? (
                    <div className="w-8 shrink-0">
                      {!cont ? <Avatar name={m.authorName} size={32} className="mt-[1.3rem]" /> : null}
                    </div>
                  ) : null}
                  <div className={cn("relative flex min-w-0 max-w-[min(82%,36rem)] flex-col", mine ? "items-end" : "items-start")}>
                    {!cont && !mine ? (
                      <div className="mb-1 flex max-w-full items-center gap-1.5 px-1 text-xs font-bold text-ink-2">
                        <span className="truncate" dir="auto">
                          {m.authorName}
                        </span>
                        {m.authorRole === "owner" ? (
                          <span className="badge badge-accent h-[1.15rem] rounded-md px-1.5 text-[10px]">{t.chat.ownerBadge}</span>
                        ) : null}
                      </div>
                    ) : null}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setActiveId(active ? null : m.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setActiveId(active ? null : m.id);
                        }
                      }}
                      className={cn(
                        "bubble cursor-default text-start outline-none transition-shadow",
                        mine ? "bubble-out" : "bubble-in",
                        !mine && m.authorRole === "owner" && "bubble-owner",
                        cont && "bubble-cont",
                        active && "shadow-[0_0_0_3px_var(--ring)]",
                      )}
                    >
                      {m.replyTo ? (
                        <span
                          className="bubble-quote cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            jumpTo(m.replyTo!.id);
                          }}
                        >
                          <span className="block font-bold text-accent-ink" dir="auto">
                            {m.replyTo.authorName || "—"}
                          </span>
                          <span className="line-clamp-2 opacity-80" dir="auto">
                            {m.replyTo.deleted ? t.chat.deletedMessage : m.replyTo.body}
                          </span>
                        </span>
                      ) : null}
                      {m.file ? <FileBubble m={m} expired={expiredFiles.has(m.file.id)} onExpired={() => setExpiredFiles((prev) => new Set(prev).add(m.file!.id))} /> : null}
                      {m.body ? (
                        <p dir="auto" className="whitespace-pre-wrap">
                          {linkify(m.body)}
                        </p>
                      ) : null}
                      <span className={cn("mt-0.5 flex items-center justify-end gap-1 text-[10.5px] leading-4", mine ? "opacity-60" : "text-faint")}>
                        {m.source === "telegram" ? (
                          <span title={t.chat.viaTelegram} className="inline-flex">
                            <Send className="size-3" aria-label={t.chat.viaTelegram} />
                          </span>
                        ) : null}
                        <time dateTime={m.createdAt}>{hydrated ? formatDate(m.createdAt, lang, { hour: "2-digit", minute: "2-digit" }) : ""}</time>
                      </span>
                    </div>
                    <div
                      className={cn(
                        "z-10 items-center gap-0.5 rounded-xl border border-line bg-surface p-1 shadow-card",
                        active ? "mt-1.5 flex md:flex" : "hidden md:group-hover:flex",
                        "md:absolute md:top-1/2 md:mt-0 md:-translate-y-1/2",
                        mine ? "md:end-full md:me-2" : "md:start-full md:ms-2",
                      )}
                    >
                      <ToolButton label={t.chat.reply} onClick={() => startReply(m)}>
                        <Reply className="size-4 rtl:-scale-x-100" />
                      </ToolButton>
                      <ToolButton label={t.chat.copy} onClick={() => copy(m)}>
                        {copiedId === m.id ? <Check className="size-4 text-mint-ink" /> : <Copy className="size-4" />}
                      </ToolButton>
                      {m.canDelete ? (
                        <ToolButton label={t.chat.delete} onClick={() => remove(m)} danger>
                          <Trash2 className="size-4" />
                        </ToolButton>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {unseen > 0 ? (
          <button
            type="button"
            onClick={() => {
              atBottomRef.current = true;
              scrollToBottom(true);
              setUnseen(0);
            }}
            className="pop-in absolute inset-x-0 bottom-4 mx-auto flex w-fit items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-2 text-xs font-bold text-accent-ink shadow-float"
          >
            <ArrowDown className="size-3.5" />
            {t.chat.newMessages} · {formatNumber(unseen, lang)}
          </button>
        ) : null}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-line bg-surface/92 px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:px-5">
        <div className="mx-auto max-w-3xl">
          {replyTo ? (
            <div className="pop-in mb-2 flex items-center gap-2.5 rounded-xl bg-accent-soft px-3 py-2 text-sm">
              <Reply className="size-4 shrink-0 text-accent-ink rtl:-scale-x-100" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-extrabold text-accent-ink">{fmt(t.chat.replyingTo, { name: replyTo.authorName })}</p>
                <p className="truncate text-xs text-muted" dir="auto">
                  {replyTo.body || replyTo.file?.name}
                </p>
              </div>
              <button type="button" onClick={() => setReplyTo(null)} className="btn btn-ghost btn-icon btn-sm" aria-label={t.chat.cancelReply}>
                <X className="size-4" />
              </button>
            </div>
          ) : null}
          {pendingFile ? (
            <div className="pop-in mb-2 flex items-center gap-2.5 rounded-xl bg-surface-3 px-3 py-2 text-sm">
              <FileTypeIcon mime={pendingFile.type} className="size-4 shrink-0 text-accent-ink" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-ink" dir="auto">
                  {pendingFile.name}
                </p>
                <p className="text-[11px] text-muted">
                  {uploading ? t.chat.uploading : formatSize(pendingFile.size)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPendingFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="btn btn-ghost btn-icon btn-sm"
                aria-label={t.common.cancel}
              >
                <X className="size-4" />
              </button>
            </div>
          ) : null}
          {composerLocked ? (
            <div className="notice notice-amber justify-center">
              <Lock className="mt-0.5 size-4 shrink-0" />
              {t.chat.lockedComposer}
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
              className="flex items-end gap-2 rounded-2xl border border-line-strong bg-surface p-1.5 ps-2.5 transition focus-within:border-accent focus-within:shadow-[0_0_0_4px_var(--ring)]"
            >
              <input
                ref={fileInputRef}
                type="file"
                hidden
                accept="image/*,video/*,audio/*,application/pdf,application/zip,.pdf,.zip,.txt"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setPendingFile(f && f.size > 0 ? f : null);
                  if (f && f.size > 64 * 1024 * 1024) setError("fileTooBig");
                  else if (error === "fileTooBig") setError(null);
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={composerLocked || sending}
                className="btn btn-ghost btn-icon size-10 shrink-0 rounded-xl"
                aria-label={t.chat.attach}
                title={t.chat.attach}
              >
                <Paperclip className="size-[18px]" />
              </button>
              <textarea
                ref={inputRef}
                rows={1}
                dir="auto"
                value={draft}
                maxLength={maxLength}
                onChange={(e) => {
                  setDraft(e.target.value);
                  if (error) setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder={t.chat.placeholder}
                aria-label={t.chat.placeholder}
                className="max-h-42 min-h-10 flex-1 resize-none bg-transparent py-2 text-[0.95rem] leading-6 text-ink outline-none placeholder:text-faint"
              />
              <button
                type="submit"
                disabled={(!draft.trim() && !pendingFile) || sending}
                className="btn btn-primary btn-icon size-10 shrink-0 rounded-xl"
                aria-label={t.chat.send}
                title={t.chat.send}
              >
                {sending ? <span className="spinner" aria-hidden="true" /> : <SendHorizontal className="size-[18px] rtl:-scale-x-100" />}
              </button>
            </form>
          )}
          <div className="mt-1.5 flex min-h-4 items-center justify-between gap-3 px-1 text-[11px] text-faint">
            <span className="hidden sm:inline">{composerLocked ? "" : t.chat.sendHint}</span>
            {error ? (
              <span className="font-semibold text-rose-ink">{errorText(t, error)}</span>
            ) : remaining < 200 ? (
              <span>{fmt(t.chat.charsLeft, { n: formatNumber(remaining, lang) })}</span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Access changed */}
      {lost ? (
        <div className="absolute inset-0 z-30 grid place-items-center bg-canvas/75 p-6 backdrop-blur-sm">
          <div className="card pop-in w-full max-w-sm p-7 text-center shadow-float">
            <span className="icon-tile mx-auto bg-amber-soft text-amber-ink">
              <ShieldAlert className="size-5" />
            </span>
            <h2 className="mt-4 text-lg font-extrabold text-ink">{t.chat.lostTitle}</h2>
            <p className="mt-2 text-sm text-muted">{lostText}</p>
            <button
              type="button"
              className="btn btn-primary mt-6"
              onClick={() => {
                setLost(null);
                setEpoch((e) => e + 1);
                router.refresh();
              }}
            >
              {t.chat.lostAction}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ToolButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "grid size-8 place-items-center rounded-lg text-muted transition",
        danger ? "hover:bg-rose-soft hover:text-rose-ink" : "hover:bg-surface-3 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

/** Inline media (sniffed-safe image/video/audio) or a download chip for anything else. */
function FileBubble({ m, expired, onExpired }: { m: ChatMessage; expired: boolean; onExpired: () => void }) {
  const { t } = useI18n();
  const file = m.file!;
  const url = `/api/files/${file.id}`;

  if (expired) {
    return (
      <span className="mb-1 flex items-center gap-2 rounded-xl border border-line bg-surface-3/70 px-3 py-2.5 text-xs font-semibold text-muted">
        <FileWarning className="size-4 shrink-0" />
        {t.chat.fileExpired}
      </span>
    );
  }

  if (file.mime.startsWith("image/")) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="mb-1 block overflow-hidden rounded-xl" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={file.name}
          loading="lazy"
          onError={onExpired}
          className="max-h-72 w-auto max-w-full cursor-zoom-in rounded-xl border border-line object-contain"
        />
      </a>
    );
  }

  if (file.mime.startsWith("video/")) {
    return (
      <video
        src={url}
        controls
        preload="metadata"
        onError={onExpired}
        className="mb-1 max-h-72 w-auto max-w-full rounded-xl border border-line"
      />
    );
  }

  if (file.mime.startsWith("audio/")) {
    return <audio src={url} controls preload="metadata" onError={onExpired} className="mb-1 w-64 max-w-full" />;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      onClick={(e) => e.stopPropagation()}
      className="mb-1 flex items-center gap-2.5 rounded-xl border border-line bg-surface-2 px-3 py-2.5 transition hover:border-accent/50"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-3 text-accent-ink">
        <FileTypeIcon mime={file.mime} className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-bold text-ink" dir="auto">
          {file.name}
        </span>
        <span className="text-[11px] text-muted">{formatSize(file.size)}</span>
      </span>
      <Download className="size-4 shrink-0 text-muted" />
    </a>
  );
}

function FileTypeIcon({ mime, className }: { mime: string; className?: string }) {
  if (mime.startsWith("image/")) return <ImageIcon className={className} />;
  if (mime.startsWith("video/")) return <Video className={className} />;
  if (mime.startsWith("audio/")) return <Music className={className} />;
  return <FileIcon className={className} />;
}
