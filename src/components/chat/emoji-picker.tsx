"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { Clock, Dog, Heart, Lightbulb, Pizza, Smile, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = { onPick: (emoji: string) => void };

/* ------------------------------------------------------------------ */
/* Curated popular sets (~330 total)                                    */
/* ------------------------------------------------------------------ */

const FACES = [
  "😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃",
  "😉","😊","😇","🥰","😍","🤩","😘","😋","😜","🤪",
  "🤗","🤭","🤫","🤔","🤨","😐","😏","🙄","😬","😴",
  "🤤","😪","🥱","😷","🤒","🤕","🤢","🤮","🥵","🥶",
  "🤯","🤠","🥳","😎","🤓","🧐","😳","🥺","😢","😭",
  "😱","😤","😡","🤬","💀","🤡","👻","🤖","💩","😺",
  "👍","👎","👌","✌️","🤞","👏","🙌","🙏","🤝","💪",
  "👋","😻","😹",
];

const HEARTS = [
  "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔",
  "❣️","💕","💞","💓","💗","💖","💘","💝","💟","✨",
  "🌟","⭐","💫","🔥","☄️","🌈","☀️","🌙","⚡","❄️",
  "🌸","🌺","🌷","🌹","🌻","🌼","💐","🍀","🎋","🍁",
];

const ANIMALS = [
  "🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯",
  "🦁","🐮","🐷","🐸","🐵","🙈","🙉","🙊","🐔","🐧",
  "🐦","🐤","🦆","🦅","🦉","🐺","🐗","🐴","🦄","🐝",
  "🐛","🦋","🐌","🐞","🐜","🐢","🐍","🦎","🐙","🦑",
  "🦀","🐠","🐟","🐬","🐳","🦈","🐊","🐘","🦒","🦘",
];

const FOOD = [
  "🍏","🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🫐",
  "🍈","🍒","🍑","🍍","🥭","🥑","🥝","🍅","🍆","🥕",
  "🌽","🌶️","🥒","🥬","🥦","🍄","🍞","🥐","🥖","🥨",
  "🧀","🥚","🍳","🥓","🍗","🍖","🌭","🍔","🍟","🍕",
  "🥪","🌮","🌯","🥗","🍝","🍜","🍣","🍤","🍚","🍦",
  "🍰","🎂","🍭","🍫","🍩","🍪","☕","🍵","🥤","🍺",
];

const ACTIVITY = [
  "⚽","🏀","🏈","⚾","🎾","🏐","🏉","🎱","🏓","🏸",
  "🥊","🥋","🎽","⛸️","🎿","⛷️","🏂","🪂","🏋️","🤸",
  "⛹️","🤺","🤾","🏌️","🏇","🧘","🏄","🏊","🚣","🧗",
  "🚵","🚴","🏆","🥇","🥈","🥉","🏅","🎖️","🎪","🤹",
  "🎭","🎨","🎬","🎤","🎧","🎼","🎹","🥁","🎷","🎸",
  "🎲","♟️","🎯","🎳","🎮","🧩","🎉","🎊","🎈","🎁",
];

const OBJECTS = [
  "⌚","📱","💻","⌨️","🖥️","🖱️","💾","💿","📼","📷",
  "📸","📹","🎥","📞","☎️","📟","📠","📺","📻","🎙️",
  "⏰","⌛","🔋","🔌","💡","🔦","🕯️","🧯","🛒","💸",
  "💵","💴","💶","💷","💰","💳","💎","⚖️","🧰","🔧",
  "🔨","⚙️","🧲","🔒","🔓","🔐","🔑","🗝️","📎","🗺️",
  "📝","📖","📚","✏️","✂️",
];

const CATEGORIES: Array<{ id: string; icon: ComponentType<{ className?: string }>; emojis: string[] }> = [
  { id: "faces", icon: Smile, emojis: FACES },
  { id: "hearts", icon: Heart, emojis: HEARTS },
  { id: "animals", icon: Dog, emojis: ANIMALS },
  { id: "food", icon: Pizza, emojis: FOOD },
  { id: "activity", icon: Trophy, emojis: ACTIVITY },
  { id: "objects", icon: Lightbulb, emojis: OBJECTS },
];

const RECENTS_KEY = "pc-recent-emoji";
const MAX_RECENTS = 24;

function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? arr.filter((e): e is string => typeof e === "string").slice(0, MAX_RECENTS) : [];
  } catch {
    return [];
  }
}

function saveRecents(list: string[]) {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, MAX_RECENTS)));
  } catch {
    /* storage unavailable */
  }
}

/**
 * Composer emoji picker — a compact popover with category tabs plus a recents
 * tab backed by localStorage. Picking an emoji reports it to the parent (which
 * inserts it at the caret) and refreshes the recents list.
 */
export function EmojiPicker({ onPick }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("faces");
  const [recents, setRecents] = useState<string[]>([]);

  /* Esc closes the picker while it is open (outside-click shield handles the rest). */
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setRecents(loadRecents());
    setOpen(true);
  };

  const pick = (emoji: string) => {
    onPick(emoji);
    setRecents((prev) => {
      const next = [emoji, ...prev.filter((e) => e !== emoji)].slice(0, MAX_RECENTS);
      saveRecents(next);
      return next;
    });
  };

  const active = tab === "recents" ? recents : (CATEGORIES.find((c) => c.id === tab) ?? CATEGORIES[0]).emojis;

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={toggle}
        className="btn btn-ghost btn-icon size-10 shrink-0 rounded-xl"
        aria-label="Emoji"
        title="Emoji"
      >
        <Smile className="size-[18px]" />
      </button>
      {open ? (
        <>
          {/* Outside-click shield (chat-list menu pattern). */}
          <button type="button" className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} aria-hidden="true" tabIndex={-1} />
          <div className="pop-in absolute bottom-full mb-2 start-0 z-40 w-72 rounded-2xl border border-line bg-surface p-2 shadow-float sm:w-80">
            <div className="flex items-center gap-1 border-b border-line pb-1.5" role="tablist" aria-label="Emoji categories">
              {recents.length > 0 ? (
                <TabButton active={tab === "recents"} onClick={() => setTab("recents")}>
                  <Clock className="size-4" />
                </TabButton>
              ) : null}
              {CATEGORIES.map((c) => (
                <TabButton key={c.id} active={tab === c.id} onClick={() => setTab(c.id)}>
                  <c.icon className="size-4" />
                </TabButton>
              ))}
            </div>
            <div className="no-scrollbar grid max-h-56 grid-cols-8 gap-0.5 overflow-y-auto pt-1">
              {active.map((emoji, i) => (
                <button
                  key={`${emoji}-${i}`}
                  type="button"
                  className="rounded-lg p-1 text-2xl leading-none transition hover:bg-surface-3"
                  onClick={() => pick(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn("rounded-lg p-1.5 transition", active ? "bg-accent-soft text-accent-ink" : "text-muted hover:bg-surface-3 hover:text-ink")}
    >
      {children}
    </button>
  );
}
