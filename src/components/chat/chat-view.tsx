"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  File as FileIcon,
  FileWarning,
  Image as ImageIcon,
  ImagePlay,
  KeyRound,
  Lock,
  LockKeyhole,
  Mic,
  Music,
  RotateCcw,
  Square,
  Paperclip,
  Plus,
  Search,
  Smile,
  Timer,
  Unlock,
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
import { EmojiPicker } from "@/components/chat/emoji-picker";
import { GifPicker } from "@/components/chat/gif-picker";
import { useVoiceRecorder, VoiceBars, VoicePlayer, formatSecs } from "@/components/chat/voice";
import type { ChatMessage, ChatSnapshot } from "@/lib/chat";
import { errorText, formatDate, formatNumber } from "@/lib/i18n";
import { cn, fmt, relative } from "@/lib/utils";
import { useLocalFlag } from "@/lib/local-store";
import {
  cacheUnlocked,
  decryptFile,
  decryptMessage,
  encryptFile,
  encryptMessage,
  getUnlocked,
  unwrapPrivateKey,
  type E2eeIdentity,
} from "@/lib/e2ee-client";

type Props = {
  endpoint: string;
  initial: ChatSnapshot;
  maxLength: number;
  headerStart?: ReactNode;
  headerActions?: ReactNode;
  className?: string;
  /**
   * v1.7.0 — tap the header title/avatar to open the profile/info panel.
   * Replaces the v1.5.3 hold-to-hide gesture on the title: the hold is gone,
   * hiding lives in the panel's ☰ menu instead.
   */
  onHeaderOpen?: () => void;
  /** v1.8.0 — DMs are peer-to-peer: no member is an "owner", no owner badge. */
  suppressOwnerBadge?: boolean;
  /** v2.3.0 — fires on every snapshot with the peer's lastSeenAt (DMs) so the
      profile panel can show a LIVE "online / last seen" line. */
  onPeerSeen?: (iso: string | null) => void;
  /** v1.8.0 — peer avatar URL (Telegram-style header + incoming bubbles in DMs) */
  peerAvatarSrc?: string;
  /** v1.8.0 — true for user-to-user chats: swaps member/online counts for the last-seen line */
  directPeer?: boolean;
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

/** v2.0 — highlights the active in-chat search query inside a message body. */
function highlight(text: string, query: string, active: boolean): ReactNode {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return text;
  const lower = text.toLowerCase();
  const at = lower.indexOf(q);
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <mark className={`rounded px-0.5 text-inherit ${active ? "bg-amber-300 text-[#171a3c]" : "bg-amber-200/80 text-[#171a3c]"}`}>
        {text.slice(at, at + q.length)}
      </mark>
      {text.slice(at + q.length)}
    </>
  );
}

export function ChatView({
  endpoint,
  initial,
  maxLength,
  headerStart,
  headerActions,
  className,
  onHeaderOpen,
  onPeerSeen,
  suppressOwnerBadge,
  peerAvatarSrc,
  directPeer,
}: Props) {
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
  const [retryable, setRetryable] = useState(false);
  // v2.3.0 — Telegram-style voice recording (mic → stop/send/trash → send)
  const voice = useVoiceRecorder();
  const [expiredFiles, setExpiredFiles] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  /* ---- Swipe-to-reply (touch): tracks one gesture at a time ---- */
  const swipeRef = useRef<{ x: number; y: number; el: HTMLElement | null; locked: "h" | "v" | null; moved: number }>({
    x: 0,
    y: 0,
    el: null,
    locked: null,
    moved: 0,
  });
  /** true right after a swipe — the follow-up tap must not toggle the toolbar */
  const suppressClickRef = useRef(false);
  /* ---- Double-tap-to-reply (touch): a second tap within 320ms on the same
     bubble replies to it. Mirrors Telegram's gesture; the first tap still
     toggles the action toolbar, the second one replies. ---- */
  const lastTapRef = useRef<{ id: number; at: number }>({ id: 0, at: 0 });

  /* ---- E2EE (§4.1): keys fetched per conversation, unlocked per session ---- */
  const roomId = initial.room.id;
  const [e2eeIdentity, setE2eeIdentity] = useState<{ me: E2eeIdentity | null; peer: { publicKeyJwk: string } | null } | null>(null);
  const [e2eeUnlocked, setE2eeUnlocked] = useState(() => Boolean(getUnlocked(roomId)));
  const [e2eePassword, setE2eePassword] = useState("");
  const [e2eeError, setE2eeError] = useState<string | null>(null);
  const [plainBodies, setPlainBodies] = useState<Map<number, string>>(new Map());

  /* ---- Self-destruct (§4.2) & watermark (§4.11) ---- */
  const [ttlChoice, setTtlChoice] = useState<string>("default");
  const watermark = useLocalFlag("pc-watermark");

  /* ---- v2.0 in-chat search: query, matched ids, active match, open state ---- */
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);

  /** The plain, searchable text of a message (decrypted payload when E2EE). */
  const searchableText = useCallback(
    (m: ChatMessage): string => {
      if (m.authorRole === "system") return "";
      if (m.encrypted) {
        const dec = plainBodies.get(m.id);
        if (dec === undefined) return "";
        try {
          const parsed = JSON.parse(dec) as { text?: string; file?: { name?: string } };
          return `${parsed.text ?? ""} ${parsed.file?.name ?? ""}`.trim();
        } catch {
          return dec;
        }
      }
      return `${m.body ?? ""} ${m.file?.name ?? ""}`.trim();
    },
    [plainBodies],
  );

  const matches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) return [] as number[];
    return messages.filter((m) => searchableText(m).toLowerCase().includes(q)).map((m) => m.id);
  }, [messages, searchQuery, searchableText]);

  /** True when THIS message id is the currently focused search result (index auto-clamped). */
  const activeMatch = searchOpen && matches.length > 0 ? matches[Math.min(matchIndex, matches.length - 1)] : null;

  const jumpMatch = (dir: 1 | -1) => {
    if (matches.length === 0) return;
    const next = (matchIndex + dir + matches.length) % matches.length;
    setMatchIndex(next);
    const el = document.getElementById(`msg-${matches[next]}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const runSearch = (value: string) => {
    setSearchQuery(value);
    setMatchIndex(0);
    const q = value.trim().toLowerCase();
    if (q.length < 2) return;
    const first = messages.find((m) => searchableText(m).toLowerCase().includes(q));
    if (first) document.getElementById(`msg-${first.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };


  /* ---- v1.8.0 mobile composer: the "+" sheet + controlled pickers ---- */
  const [sheetOpen, setSheetOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);

  const versionRef = useRef(initial.stateVersion);
  const lastIdRef = useRef(lastId(initial.messages));
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const atBottomRef = useRef(true);
  const countRef = useRef(initial.messages.length);

  const apply = useCallback(
    (snap: ChatSnapshot) => {
    versionRef.current = snap.stateVersion;
    setRoom(snap.room);
    if (snap.room.direct && onPeerSeen) onPeerSeen(snap.room.peerLastSeenAt ?? null);
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
    },
    [onPeerSeen],
  );

  /* Fetch E2EE key material for this conversation (DM only, session-scoped). */
  useEffect(() => {
    if (!initial.room.direct) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/rooms/${roomId}/e2ee`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          e2eeEnabled: boolean;
          me: E2eeIdentity | null;
          peer: { publicKeyJwk: string } | null;
        };
        if (cancelled) return;
        setE2eeIdentity({ me: data.me, peer: data.peer });
      } catch {
        /* offline */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId, initial.room.direct]);

  /* Decrypt incoming E2EE envelopes with the unlocked private key. */
  useEffect(() => {
    if (!room.e2eeEnabled || !e2eeUnlocked) return;
    const unlocked = getUnlocked(roomId);
    if (!unlocked) return;
    const targets = messages.filter((m) => m.encrypted && !plainBodies.has(m.id));
    if (targets.length === 0) return;
    void (async () => {
      const updates = new Map<number, string>();
      for (const m of targets) {
        try {
          updates.set(m.id, await decryptMessage(unlocked.privateKey, unlocked.peerPublicKeyJwk, roomId, m.body));
        } catch {
          updates.set(m.id, ""); // undecryptable — show a locked placeholder
        }
      }
      setPlainBodies((prev) => {
        const next = new Map(prev);
        for (const [k, v] of updates) next.set(k, v);
        return next;
      });
    })();
  }, [messages, room.e2eeEnabled, e2eeUnlocked, roomId, plainBodies]);

  /** Unlocks the E2EE private key with the account password (browser-side only). */
  const unlockE2ee = async () => {
    if (!e2eeIdentity?.me || !e2eeIdentity.peer) return;
    setE2eeError(null);
    try {
      const peerJwk = JSON.parse(e2eeIdentity.peer.publicKeyJwk) as JsonWebKey;
      const privateKey = await unwrapPrivateKey(e2eeIdentity.me, e2eePassword);
      cacheUnlocked(roomId, privateKey, peerJwk);
      setE2eeUnlocked(true);
      setE2eePassword("");
    } catch {
      setE2eeError("e2eeUnlockFailed");
    }
  };

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
        // Mark-as-read rides along on every visible poll (initial load included);
        // hidden tabs must NOT clear unread flags — the notify runtime and the
        // chat-list unread dots rely on them.
        const read = document.visibilityState === "visible" ? "&read=1" : "";
        // v2.3.0 — weak networks: a hung request must not freeze the poll
        // cycle; abort after 12s so the next tick retries promptly.
        const res = await fetch(`${endpoint}?after=${lastIdRef.current}&v=${versionRef.current}${read}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(12_000),
        });
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

  const send = async (voiceOverride?: File) => {
    const rawBody = draft.trim();
    const file = voiceOverride ?? pendingFile;
    if ((!rawBody && !file) || sending) return;
    setRetryable(false);
    if (rawBody.length > maxLength) return setError("messageTooLong");
    setSending(true);
    setError(null);
    try {
      // E2EE conversations: encrypt BEFORE anything leaves the browser (§4.1).
      const unlocked = room.e2eeEnabled ? getUnlocked(roomId) : null;
      if (room.e2eeEnabled && !unlocked) {
        setE2eeError("e2eeUnlockFailed");
        return;
      }

      let body = rawBody;
      let fileId: string | null = null;
      let fileIv: string | null = null;
      let fileName: string | null = null;
      let fileMime: string | null = null;
      if (file) {
        setUploading(true);
        let uploadBlob: Blob = file;
        if (unlocked) {
          // Encrypt the file bytes with the conversation key; metadata travels
          // inside the encrypted message body, never in the clear.
          const enc = await encryptFile(unlocked.privateKey, unlocked.peerPublicKeyJwk, roomId, await file.arrayBuffer());
          uploadBlob = enc.blob;
          fileIv = enc.iv;
        }
        fileName = file.name;
        fileMime = file.type || "application/octet-stream";
        const form = new FormData();
        form.append("file", new File([uploadBlob], unlocked ? "encrypted.bin" : file.name, { type: unlocked ? "application/octet-stream" : file.type }));
        const upRes = await fetch(endpoint.replace(/\/messages$/, "/files"), { method: "POST", body: form, signal: AbortSignal.timeout(30_000) });
        const upData = (await upRes.json().catch(() => ({}))) as { id?: string; error?: string };
        if (!upRes.ok || !upData.id) {
          setError(upData.error ?? "uploadFailed");
          return;
        }
        fileId = upData.id;
        setUploading(false);
      }
      if (unlocked) {
        const payload = { text: body, ...(fileIv ? { file: { name: fileName, mime: fileMime, iv: fileIv } } : {}) };
        body = await encryptMessage(unlocked.privateKey, unlocked.peerPublicKeyJwk, roomId, JSON.stringify(payload));
      }
      // Self-destruct: per-send override, else the conversation default (§4.2).
      const ttl = ttlChoice === "default" ? undefined : ttlChoice === "off" ? 0 : Number(ttlChoice);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        // v2.3.0 — weak networks: bound the request so the user gets a retry
        // affordance instead of a spinner that never resolves.
        signal: AbortSignal.timeout(20_000),
        body: JSON.stringify({ body, fileId, replyToId: replyTo?.id ?? null, after: lastIdRef.current, v: versionRef.current, ...(ttl !== undefined ? { ttl } : {}) }),
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
      // v2.3.0 — network failure keeps draft + attachment intact and offers
      // an explicit "retry" affordance in the composer footer.
      setError("network");
      setRetryable(true);
    } finally {
      setSending(false);
      setUploading(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  /**
   * Sends a GIF message — mirrors the text-send fetch/headers (after/v params
   * included) but the body only carries {gifId}; the API rejects GIFs for
   * guests and E2EE rooms, so the trigger is gated to authenticated members
   * of non-E2EE conversations (see the composer).
   */
  /** Finalize the recording and hand it to the normal send path (also stored
      in pendingFile so the retry affordance works on weak networks). */
  const sendVoice = () => {
    const f = voice.take();
    if (!f) return;
    voice.discard();
    setPendingFile(f);
    void send(f);
  };

  const sendGif = async (gifId: string) => {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gifId, replyToId: replyTo?.id ?? null, after: lastIdRef.current, v: versionRef.current }),
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
      setReplyTo(null);
      atBottomRef.current = true;
      apply(data);
    } catch {
      // v2.3.0 — network failure keeps draft + attachment intact and offers
      // an explicit "retry" affordance in the composer footer.
      setError("network");
      setRetryable(true);
    } finally {
      setSending(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  /** Inserts a picked emoji at the caret (falls back to append). */
  const insertEmoji = (emoji: string) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    setDraft(draft.slice(0, start) + emoji + draft.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      const pos = start + emoji.length;
      el?.setSelectionRange(pos, pos);
    });
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

  /** Decrypted payload of an E2EE message: { text?, file? {name, mime, iv} }. */
  const decryptedOf = (m: ChatMessage): { text: string; file: { name: string; mime: string; iv: string } | null } | null => {
    if (!m.encrypted) return null;
    const plain = plainBodies.get(m.id);
    if (plain === undefined) return null;
    if (!plain) return { text: "", file: null };
    try {
      const parsed = JSON.parse(plain) as { text?: string; file?: { name?: string; mime?: string; iv?: string } };
      return {
        text: typeof parsed.text === "string" ? parsed.text : "",
        file: parsed.file?.iv && parsed.file?.name ? { name: parsed.file.name, mime: parsed.file.mime ?? "application/octet-stream", iv: parsed.file.iv } : null,
      };
    } catch {
      return { text: plain, file: null };
    }
  };

  /** §4.11 — download an E2EE file: fetch ciphertext, decrypt, save locally. */
  const downloadEncrypted = async (m: ChatMessage, meta: { name: string; iv: string }) => {
    const unlocked = getUnlocked(roomId);
    if (!unlocked || !m.file) return;
    try {
      const res = await fetch(`/api/files/${m.file.id}`, { cache: "no-store" });
      if (!res.ok) throw new Error("fetch failed");
      const blob = await decryptFile(unlocked.privateKey, unlocked.peerPublicKeyJwk, roomId, meta.iv, await res.arrayBuffer());
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = meta.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch {
      setError("network");
    }
  };

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
      <header className="z-10 flex shrink-0 items-center gap-2 border-b border-line bg-surface/90 px-2 py-2.5 backdrop-blur sm:px-5 sm:py-3">
        {headerStart}
        {/* v2.0 in-chat search bar (replaces the plain header while open) */}
        {searchOpen ? (
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-faint" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => runSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    jumpMatch(e.shiftKey ? -1 : 1);
                  }
                  if (e.key === "Escape") setSearchOpen(false);
                }}
                placeholder={t.chat.searchLabel}
                aria-label={t.chat.searchLabel}
                className="input h-10 rounded-full ps-9"
                autoFocus
              />
            </div>
            {searchQuery.trim().length >= 2 ? (
              <span className="shrink-0 text-xs font-bold text-muted" dir="ltr">
                {matches.length === 0
                  ? fmt(t.chat.searchNoResults, { q: searchQuery.trim().slice(0, 24) })
                  : fmt(t.chat.searchCount, { n: String(matchIndex + 1), m: String(matches.length) })}
              </span>
            ) : null}
            <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => jumpMatch(-1)} disabled={matches.length === 0} aria-label={t.common.back}>
              <ChevronUp className="size-4" />
            </button>
            <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => jumpMatch(1)} disabled={matches.length === 0} aria-label={t.common.open}>
              <ChevronDown className="size-4" />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm"
              onClick={() => {
                setSearchOpen(false);
                setSearchQuery("");
                setMatchIndex(0);
              }}
              aria-label={t.common.close}
            >
              <X className="size-4" />
            </button>
          </div>
        ) : (
          (() => {
          const titleBlock = (
            <>
              <Avatar
                name={room.name}
                size={40}
                square={!room.direct}
                src={room.direct ? peerAvatarSrc : undefined}
                className="shrink-0"
              />
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-[0.98rem] font-extrabold text-ink" dir="auto">
                  {room.name}
                </h1>
                {room.direct ? (
                  /* v2.3.0 — live presence: the snapshot carries the peer's
                     lastSeenAt on every poll, so this flips to "online" the
                     moment they open the chat (the old header froze the @username
                     from page load and never showed presence). */
                  (() => {
                    const seen = room.peerLastSeenAt;
                    const online = Boolean(seen) && Date.now() - new Date(seen!).getTime() < 90_000;
                    return (
                      <p className={cn("flex items-center gap-1.5 text-xs font-semibold", online ? "text-[#2ea36f]" : "text-muted")}>
                        <span className={cn("size-1.5 rounded-full", online ? "bg-[#4cc79a]" : "bg-faint")} aria-hidden="true" />
                        {online
                          ? t.dm.lastSeenOnline
                          : seen
                            ? fmt(t.dm.lastSeenAt, { time: relative(seen, lang) })
                            : t.dm.lastSeenRecently}
                      </p>
                    );
                  })()
                ) : room.subtitle ? (
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
            </>
          );
          // v1.7.0 — tapping the title/avatar opens the profile/info panel
          // (Telegram-style). The old 5-second hold-to-hide on the title is
          // gone; hiding now lives in the panel's ☰ menu.
          return onHeaderOpen ? (
            <button
              type="button"
              onClick={onHeaderOpen}
              className="-m-1 flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 text-start transition hover:bg-surface-2"
              aria-haspopup="dialog"
            >
              {titleBlock}
            </button>
          ) : (
            titleBlock
          );
        })()
        )}
        <div className="flex shrink-0 items-center gap-1.5">
          {!searchOpen ? (
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm"
              onClick={() => setSearchOpen(true)}
              aria-label={t.chat.searchLabel}
              title={t.chat.searchLabel}
            >
              <Search className="size-[18px]" />
            </button>
          ) : null}
          {room.e2eeEnabled ? (
            <span className="badge badge-accent hidden sm:inline-flex" title={t.e2ee.subtitle}>
              {t.e2ee.badge}
            </span>
          ) : null}
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
        {watermark ? <WatermarkOverlay username={me.nickname} /> : null}
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
                      {!cont ? (
                        <Avatar name={m.authorName} size={32} src={room.direct ? peerAvatarSrc : undefined} className="mt-[1.3rem]" />
                      ) : null}
                    </div>
                  ) : null}
                  <div className={cn("relative flex min-w-0 max-w-[min(82%,36rem)] flex-col", mine ? "items-end" : "items-start")}>
                    {!cont && !mine ? (
                      <div className="mb-1 flex max-w-full items-center gap-1.5 px-1 text-xs font-bold text-ink-2">
                        <span className="truncate" dir="auto">
                          {m.authorName}
                        </span>
                        {/* v1.8.0 — DMs are peer-to-peer: nobody owns the
                            conversation, so the owner badge never shows there. */}
                        {m.authorRole === "owner" && !suppressOwnerBadge ? (
                          <span className="badge badge-accent h-[1.15rem] rounded-md px-1.5 text-[10px]">{t.chat.ownerBadge}</span>
                        ) : null}
                      </div>
                    ) : null}
                    <div
                      role="button"
                      tabIndex={0}
                      /* Swipe-to-reply: a horizontal drag nudges the bubble sideways and
                         ≥72px of committed movement (either direction — works in RTL and
                         LTR alike) starts a reply. Vertical scrolling stays native
                         (touch-action: pan-y); nothing is ever preventDefault-ed. */
                      onClick={() => {
                        // A swipe just ended — swallow the trailing synthetic tap.
                        if (suppressClickRef.current) {
                          suppressClickRef.current = false;
                          return;
                        }
                        setActiveId(active ? null : m.id);
                      }}
                      /* Desktop: double-click a bubble to reply to it (the
                         single click still toggles the action toolbar). */
                      onDoubleClick={() => startReply(m)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setActiveId(active ? null : m.id);
                        }
                      }}
                      style={{ touchAction: "pan-y" }}
                      onTouchStart={(e) => {
                        const t = e.touches[0];
                        // Double-tap-to-reply: second tap within 320ms on the
                        // same bubble → reply. The toolbar stays untouched.
                        const now = Date.now();
                        if (lastTapRef.current.id === m.id && now - lastTapRef.current.at < 320) {
                          lastTapRef.current = { id: 0, at: 0 };
                          suppressClickRef.current = true;
                          startReply(m);
                        } else {
                          lastTapRef.current = { id: m.id, at: now };
                        }
                        swipeRef.current = { x: t.clientX, y: t.clientY, el: e.currentTarget, locked: null, moved: 0 };
                      }}
                      onTouchMove={(e) => {
                        const s = swipeRef.current;
                        if (!s.el) return;
                        const t = e.touches[0];
                        const dx = t.clientX - s.x;
                        const dy = t.clientY - s.y;
                        if (!s.locked) {
                          if (Math.abs(dx) > 12 && Math.abs(dx) > 2 * Math.abs(dy)) s.locked = "h";
                          else if (Math.abs(dy) > 12) s.locked = "v";
                        }
                        if (s.locked === "h") {
                          s.moved = dx;
                          const c = Math.max(-90, Math.min(90, dx)) * 0.35;
                          s.el.style.transition = "none";
                          s.el.style.transform = `translateX(${c}px)`;
                        }
                      }}
                      onTouchEnd={() => {
                        const s = swipeRef.current;
                        if (s.el) {
                          s.el.style.transition = "transform .18s ease";
                          s.el.style.transform = "";
                        }
                        // The Reply ToolButton is unconditional for message bubbles,
                        // so every bubble is swipe-replyable.
                        if (s.locked === "h" && Math.abs(s.moved) >= 72) startReply(m);
                        if (Math.abs(s.moved) > 10) suppressClickRef.current = true;
                        s.locked = null;
                        s.moved = 0;
                      }}
                      onTouchCancel={() => {
                        const s = swipeRef.current;
                        if (s.el) {
                          s.el.style.transition = "transform .18s ease";
                          s.el.style.transform = "";
                        }
                        if (Math.abs(s.moved) > 10) suppressClickRef.current = true;
                        s.locked = null;
                        s.moved = 0;
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
                            {/* A live (non-deleted) quote with an empty preview body can only be a
                                GIF message — text carries a body, files render "📎 name". */}
                            {m.replyTo.deleted ? t.chat.deletedMessage : m.replyTo.body || "GIF"}
                          </span>
                        </span>
                      ) : null}
                      {(() => {
                        const dec = decryptedOf(m);
                        if (m.encrypted) {
                          if (!dec) {
                            return (
                              <p className="flex items-center gap-1.5 text-xs font-semibold text-muted" dir="auto">
                                <LockKeyhole className="size-3.5" />
                                {e2eeUnlocked ? t.chat.decrypting : t.e2ee.locked}
                              </p>
                            );
                          }
                          return (
                            <>
                              {dec.file ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void downloadEncrypted(m, dec.file!);
                                  }}
                                  className="mb-1 flex items-center gap-2.5 rounded-xl border border-line bg-surface-2 px-3 py-2.5 transition hover:border-accent/50"
                                >
                                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-3 text-accent-ink">
                                    <LockKeyhole className="size-4" />
                                  </span>
                                  <span className="min-w-0 flex-1 text-start">
                                    <span className="block truncate text-xs font-bold text-ink" dir="auto">
                                      {dec.file.name}
                                    </span>
                                    <span className="text-[11px] text-muted">{t.e2ee.fileEncrypted} · {m.file ? formatSize(m.file.size) : ""}</span>
                                  </span>
                                  <Download className="size-4 shrink-0 text-muted" />
                                </button>
                              ) : null}
                              {dec.text ? (
                                <p dir="auto" className="whitespace-pre-wrap">
                                  {searchOpen && searchQuery.trim().length >= 2
                                    ? highlight(dec.text, searchQuery, activeMatch === m.id)
                                    : linkify(dec.text)}
                                </p>
                              ) : null}
                            </>
                          );
                        }
                        return (
                          <>
                            {m.file ? <FileBubble m={m} expired={expiredFiles.has(m.file.id)} onExpired={() => setExpiredFiles((prev) => new Set(prev).add(m.file!.id))} /> : null}
                            {m.gifId ? (
                              // GIFs never ride along with text or files (the API rejects both
                              // combos) and stream through the same-origin proxy, so CSP
                              // img-src stays 'self'.
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={`/api/gifs/media/${m.gifId}`} alt="GIF" loading="lazy" className="max-w-[min(280px,70vw)] rounded-xl" />
                            ) : null}
                            {m.body ? (
                              <p dir="auto" className="whitespace-pre-wrap">
                                {searchOpen && searchQuery.trim().length >= 2
                                  ? highlight(m.body, searchQuery, activeMatch === m.id)
                                  : linkify(m.body)}
                              </p>
                            ) : null}
                          </>
                        );
                      })()}
                      {m.expiresAt ? (
                        <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-surface-3/80 px-1.5 py-0.5 text-[10px] font-semibold text-muted" title={t.selfdestruct.subtitle}>
                          <Timer className="size-3" />
                          {formatDate(m.expiresAt, lang, { hour: "2-digit", minute: "2-digit" })}
                        </span>
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
                  {replyTo.body || replyTo.file?.name || (replyTo.gifId ? "GIF" : "")}
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
          {room.e2eeEnabled && !e2eeUnlocked ? (
            <div className="pop-in mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-accent/40 bg-accent-soft/60 px-3 py-2.5">
              <Unlock className="size-4 shrink-0 text-accent-ink" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-extrabold text-accent-ink">{t.e2ee.unlock}</p>
                <p className="text-[11px] leading-relaxed text-muted">{t.e2ee.unlockHint}</p>
              </div>
              <input
                type="password"
                className="input h-9 w-40"
                value={e2eePassword}
                onChange={(e) => setE2eePassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void unlockE2ee();
                  }
                }}
                placeholder={t.auth.password}
                dir="ltr"
                autoComplete="current-password"
              />
              <button type="button" className="btn btn-primary btn-sm h-9" onClick={() => void unlockE2ee()}>
                <Unlock className="size-3.5" />
                {t.e2ee.unlock}
              </button>
              {e2eeError ? <span className="w-full text-[11px] font-semibold text-rose-ink">{errorText(t, e2eeError)}</span> : null}
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
              data-tutorial="composer"
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
              {/* ---- v1.8.0 mobile composer: ONE "+" button instead of the
                 emoji/attach/GIF/TTL row that crowded phones. Telegram-style
                 bottom sheet carries the extras; desktop keeps the old bar. ---- */}
              <div className={cn("relative shrink-0 md:hidden", voice.phase !== "idle" && "hidden")}>
                <button
                  type="button"
                  onClick={() => setSheetOpen((v) => !v)}
                  className="btn btn-ghost btn-icon size-10 rounded-xl"
                  aria-label={t.chat.moreTools}
                  title={t.chat.moreTools}
                  aria-expanded={sheetOpen}
                >
                  <Plus className={cn("size-[22px] transition-transform", sheetOpen && "rotate-45")} />
                </button>
                {sheetOpen ? (
                  <>
                    <button type="button" className="fixed inset-0 z-30 cursor-default" onClick={() => setSheetOpen(false)} aria-hidden="true" tabIndex={-1} />
                    <div className="pop-in absolute bottom-full mb-2 start-0 z-40 w-56 rounded-2xl border border-line bg-surface p-1.5 shadow-float">
                      <SheetItem
                        icon={<Smile className="size-[18px]" />}
                        label="Emoji"
                        onClick={() => {
                          setSheetOpen(false);
                          setEmojiOpen(true);
                        }}
                      />
                      <SheetItem
                        icon={<Paperclip className="size-[18px]" />}
                        label={t.chat.attach}
                        onClick={() => {
                          setSheetOpen(false);
                          fileInputRef.current?.click();
                        }}
                      />
                      {me.role !== "guest" && !room.e2eeEnabled ? (
                        <SheetItem
                          icon={<ImagePlay className="size-[18px]" />}
                          label="GIF"
                          onClick={() => {
                            setSheetOpen(false);
                            setGifOpen(true);
                          }}
                        />
                      ) : null}
                      <div className="my-1 border-t border-line" />
                      <label className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-ink transition hover:bg-surface-3">
                        <Timer className="size-[18px] text-muted" />
                        <span className="flex-1 text-start">{t.selfdestruct.title}</span>
                        <select
                          value={ttlChoice}
                          onChange={(e) => setTtlChoice(e.target.value)}
                          className="h-8 cursor-pointer rounded-lg border border-line bg-surface-2 px-1.5 text-[11px] font-semibold text-muted outline-none"
                          aria-label={t.selfdestruct.title}
                        >
                          <option value="default">{room.defaultTtl ? (room.defaultTtl === 3600 ? t.selfdestruct.oneHour : room.defaultTtl === 86400 ? t.selfdestruct.oneDay : t.selfdestruct.oneWeek) : t.selfdestruct.off}</option>
                          <option value="off">{t.selfdestruct.off}</option>
                          <option value="3600">{t.selfdestruct.oneHour}</option>
                          <option value="86400">{t.selfdestruct.oneDay}</option>
                          <option value="604800">{t.selfdestruct.oneWeek}</option>
                        </select>
                      </label>
                    </div>
                  </>
                ) : null}
              </div>
              {/* Emoji — desktop trigger (mobile uses the "+" sheet). The
                  single controlled picker instance renders further down. */}
              {voice.phase === "idle" ? (
              <>
              <button
                type="button"
                onClick={() => setEmojiOpen((v) => !v)}
                disabled={composerLocked || sending}
                className="btn btn-ghost btn-icon size-10 shrink-0 rounded-xl hidden md:inline-flex"
                aria-label="Emoji"
                title="Emoji"
              >
                <Smile className="size-[18px]" />
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={composerLocked || sending}
                className="btn btn-ghost btn-icon size-10 shrink-0 rounded-xl hidden md:inline-flex"
                aria-label={t.chat.attach}
                title={t.chat.attach}
              >
                <Paperclip className="size-[18px]" />
              </button>
              </>
              ) : null}
              {/* GIFs: authenticated members of non-E2EE rooms only (API-side rule mirrored here). */}
              {me.role !== "guest" && !room.e2eeEnabled && voice.phase === "idle" ? (
                <button
                  type="button"
                  onClick={() => setGifOpen((v) => !v)}
                  disabled={sending}
                  className="btn btn-ghost btn-icon size-10 shrink-0 rounded-xl hidden md:inline-flex"
                  aria-label="GIF"
                  title="GIF"
                >
                  <ImagePlay className="size-[18px]" />
                </button>
              ) : null}
              {/* The single controlled pickers — opened by the desktop
                  triggers above or the mobile "+" sheet below. No trigger of
                  their own; they float above the composer. */}
              <EmojiPicker onPick={insertEmoji} open={emojiOpen} onOpenChange={setEmojiOpen} />
              {me.role !== "guest" && !room.e2eeEnabled ? (
                <GifPicker onPick={(gifId) => void sendGif(gifId)} disabled={sending} open={gifOpen} onOpenChange={setGifOpen} />
              ) : null}
              {voice.phase === "idle" ? (
              <select
                value={ttlChoice}
                onChange={(e) => setTtlChoice(e.target.value)}
                className="h-9 shrink-0 cursor-pointer rounded-lg border border-line bg-surface-2 px-1.5 text-[11px] font-semibold text-muted outline-none transition hover:border-line-strong hidden md:block"
                aria-label={t.selfdestruct.title}
                title={t.selfdestruct.title}
                data-tutorial="composer"
              >
                <option value="default">{room.defaultTtl ? (room.defaultTtl === 3600 ? t.selfdestruct.oneHour : room.defaultTtl === 86400 ? t.selfdestruct.oneDay : t.selfdestruct.oneWeek) : t.selfdestruct.off}</option>
                <option value="off">{t.selfdestruct.off}</option>
                <option value="3600">{t.selfdestruct.oneHour}</option>
                <option value="86400">{t.selfdestruct.oneDay}</option>
                <option value="604800">{t.selfdestruct.oneWeek}</option>
              </select>
              ) : null}
              {voice.phase === "recording" ? (
                <div className="flex min-h-10 flex-1 items-center gap-2 px-1">
                  <span className="rec-pulse size-2.5 shrink-0 rounded-full bg-rose-ink" aria-hidden="true" />
                  <span className="text-sm font-bold tabular-nums text-rose-ink" dir="ltr">
                    {formatSecs(voice.elapsed)}
                  </span>
                  <VoiceBars seed={17} recording className="text-rose-ink/50" />
                  <span className="hidden shrink-0 text-[11px] text-faint sm:inline">{t.chat.recording}</span>
                </div>
              ) : voice.phase === "review" ? (
                <div className="flex min-h-10 flex-1 items-center gap-2 px-1">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-ink">
                    <Mic className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className="truncate text-xs font-bold text-ink">{t.chat.voiceReady}</p>
                    <p className="text-[11px] text-muted tabular-nums" dir="ltr">
                      {formatSecs(voice.duration)}
                    </p>
                  </div>
                  <VoiceBars seed={29} progress={100} className="hidden w-28 text-accent-ink sm:flex" />
                </div>
              ) : (
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
              )}
              {voice.phase !== "idle" ? (
                <>
                  {/* stop (keeps the clip for review) — trash while reviewing */}
                  {voice.phase === "review" ? (
                    <button
                      type="button"
                      onClick={() => {
                        voice.discard();
                        void voice.start();
                      }}
                      disabled={sending}
                      className="btn btn-ghost btn-icon size-10 shrink-0 rounded-xl"
                      aria-label={t.chat.reRecord}
                      title={t.chat.reRecord}
                    >
                      <RotateCcw className="size-[18px]" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => (voice.phase === "recording" ? voice.stop() : voice.discard())}
                    className="btn btn-ghost btn-icon size-10 shrink-0 rounded-xl text-muted hover:text-rose-ink"
                    aria-label={voice.phase === "recording" ? t.chat.stopRec : t.common.cancel}
                    title={voice.phase === "recording" ? t.chat.stopRec : t.common.cancel}
                  >
                    {voice.phase === "recording" ? <Square className="size-4" /> : <Trash2 className="size-[18px]" />}
                  </button>
                  <button
                    type="button"
                    onClick={sendVoice}
                    disabled={sending}
                    className="btn btn-primary btn-icon size-10 shrink-0 rounded-xl"
                    aria-label={t.chat.send}
                    title={t.chat.send}
                  >
                    {sending ? <span className="spinner" aria-hidden="true" /> : <SendHorizontal className="size-[18px] rtl:-scale-x-100" />}
                  </button>
                </>
              ) : (draft.trim() || pendingFile) ? (
                <button
                  type="submit"
                  disabled={sending}
                  className="btn btn-primary btn-icon size-10 shrink-0 rounded-xl"
                  aria-label={t.chat.send}
                  title={t.chat.send}
                >
                  {sending ? <span className="spinner" aria-hidden="true" /> : <SendHorizontal className="size-[18px] rtl:-scale-x-100" />}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void voice.start()}
                  disabled={composerLocked || sending}
                  className="btn btn-primary btn-icon size-10 shrink-0 rounded-xl"
                  aria-label={t.chat.micRecord}
                  title={t.chat.micRecord}
                >
                  <Mic className="size-[18px]" />
                </button>
              )}
            </form>
          )}
          <div className="mt-1.5 flex min-h-4 items-center justify-between gap-3 px-1 text-[11px] text-faint">
            <span className="hidden sm:inline">{composerLocked ? "" : t.chat.sendHint}</span>
            {voice.micError ? (
              <span className="font-semibold text-rose-ink">{t.chat.micDenied}</span>
            ) : error ? (
              <span className="flex items-center gap-2">
                <span className="font-semibold text-rose-ink">{errorText(t, error)}</span>
                {retryable ? (
                  <button
                    type="button"
                    onClick={() => {
                      setRetryable(false);
                      setError(null);
                      void send();
                    }}
                    className="btn btn-soft btn-sm h-6 px-2 text-[11px]"
                  >
                    <RotateCcw className="size-3" />
                    {t.chat.retry}
                  </button>
                ) : null}
              </span>
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

/** v1.8.0 — one row of the mobile composer's "+" sheet. */
function SheetItem({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-ink transition hover:bg-surface-3"
    >
      <span className="text-muted">{icon}</span>
      {label}
    </button>
  );
}

/**
 * §4.11 — faint personalized watermark over the conversation. Browsers cannot
 * block screenshots; a per-user watermark makes every leak traceable to its
 * owner (deterrence, not prevention).
 */
function WatermarkOverlay({ username }: { username: string }) {
  const stamp = `${username} · ${new Date().toISOString().slice(0, 10)}`;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 select-none overflow-hidden">
      <div className="absolute inset-0 flex flex-col justify-between py-8" style={{ transform: "rotate(-18deg) scale(1.2)" }}>
        {Array.from({ length: 6 }).map((_, row) => (
          <div key={row} className="flex justify-around gap-10 whitespace-nowrap">
            {Array.from({ length: 3 }).map((_, col) => (
              <span key={col} className="text-[11px] font-bold tracking-wide text-ink/[0.055] dark:text-white/[0.05]">
                {stamp}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
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
    // v2.3.0 — voice messages render as a Telegram-style chip; other audio
    // keeps the native player.
    if (/^voice-/.test(file.name)) return <VoicePlayer src={url} seed={m.id} mine={m.mine} />;
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
