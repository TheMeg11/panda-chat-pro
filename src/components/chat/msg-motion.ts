"use client";

/**
 * v2.4.0 — Premium Telegram-inspired message motion (no new dependencies).
 *
 * Two combined techniques:
 *
 * 1. FLY FROM INPUT — a newly sent message visually travels from the composer
 *    to its final bubble. The REAL message is inserted into state exactly once
 *    and is kept invisible (`msg-ghosting`) while a fixed-position clone flies
 *    along an eased trajectory from the composer rect to the bubble's measured
 *    destination (measured AFTER the layout settles, so the arrival point is
 *    accurate even though the list just re-laid-out). On arrival the real
 *    bubble is revealed with a subtle spring settle.
 *
 * 2. SPRING REARRANGEMENT — when messages are inserted, existing bubbles do
 *    not jump: FLIP captures their previous tops, then a small rAF spring
 *    integrator (stiffness/damping per bubble, staggered by distance from the
 *    insertion point) settles each bubble into place — the "wave" motion from
 *    the Animorio references, without copying their drag/rubber-band code.
 *
 * All motion is skipped under `prefers-reduced-motion` and when the list was
 * reset (initial load / history swap), so ordinary renders stay instant.
 */

export type FlightPlan = {
  /** message id that will fly */
  id: number;
  /** composer anchor rect (viewport coords) captured before the send */
  from: { x: number; y: number; width: number };
  /** whether the bubble lands on the right side (mine) */
  mine: boolean;
};

export type RowSnapshot = { node: HTMLElement; top: number; fromEnd: number };

const SPRING_STIFFNESS = 170;
const SPRING_DAMPING = 24;
/** per-row delay (ms) — distance from the insertion point drives the wave */
const STAGGER_MS = 13;
const MAX_SPRING_ROWS = 12;

/** Per-node spring handle so rapid updates re-target from the live position. */
type SpringHandle = { raf: number; pos: number; vel: number; timer?: number };
const springs = new WeakMap<HTMLElement, SpringHandle>();

export function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** Capture the tops of the last N message rows (BEFORE a layout change). */
export function captureRows(listEl: HTMLElement | null, max = MAX_SPRING_ROWS): RowSnapshot[] {
  if (!listEl) return [];
  const rows = [...listEl.querySelectorAll<HTMLElement>("[data-msg-row]")];
  const n = rows.length;
  return rows.slice(-max).map((node, i) => ({ node, top: node.getBoundingClientRect().top, fromEnd: n - 1 - i }));
}

/**
 * Spring-settle every captured row to its post-layout position. Rows above the
 * insertion point start at their old offset and follow a damped spring to 0,
 * staggered by `fromEnd` — the wave.
 */
export function springRearrange(rows: RowSnapshot[]) {
  const n = rows.length;
  for (const row of rows) {
    const node = row.node;
    const newTop = node.getBoundingClientRect().top;
    const dy = row.top - newTop;
    if (Math.abs(dy) < 1.5) continue;
    springTo(node, dy, Math.min(row.fromEnd, 8) * STAGGER_MS);
  }
  void n;
}

/** Damped spring integrator (numeric, clamped dt) — settles without bounce. */
export function springTo(node: HTMLElement, initial: number, delay = 0) {
  const prev = springs.get(node);
  let pos = initial;
  let vel = 0;
  // Rapid consecutive updates: continue from the live transform, not from 0.
  if (prev) {
    window.cancelAnimationFrame(prev.raf);
    if (prev.timer) window.clearTimeout(prev.timer);
    pos = prev.pos;
    vel = prev.vel;
  }
  const handle: SpringHandle = { raf: 0, pos, vel };
  springs.set(node, handle);

  const step = () => {
    const a = -SPRING_STIFFNESS * handle.pos - SPRING_DAMPING * handle.vel;
    handle.vel += a * (1 / 120);
    handle.pos += handle.vel * (1 / 120);
    if (Math.abs(handle.pos) < 0.35 && Math.abs(handle.vel) < 0.35) {
      node.style.transform = "";
      springs.delete(node);
      return;
    }
    node.style.transform = `translateY(${handle.pos.toFixed(2)}px)`;
    handle.raf = requestAnimationFrame(step);
  };
  if (delay > 0) {
    handle.timer = window.setTimeout(() => {
      handle.timer = undefined;
      handle.raf = requestAnimationFrame(step);
    }, delay);
  } else {
    handle.raf = requestAnimationFrame(step);
  }
}

/**
 * FLY FROM INPUT — clone the (hidden) real row, fly it from the composer to
 * its measured destination, then reveal it with a spring settle. Returns a
 * cancel function (call on unmount to clean up stragglers).
 */
export function flyFromInput(row: HTMLElement, plan: FlightPlan, cancelAnim: Animation[]): () => void {
  const target = row.getBoundingClientRect();
  const ghost = row.cloneNode(true) as HTMLElement;
  ghost.removeAttribute("id");
  ghost.removeAttribute("data-msg-row");
  ghost.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
  ghost.setAttribute("aria-hidden", "true");
  ghost.classList.add("msg-ghost");
  // Fix the ghost's width so the text wraps exactly like the real bubble.
  ghost.style.cssText += `position:fixed;left:0;top:0;margin:0;z-index:60;pointer-events:none;width:${target.width}px;will-change:transform,opacity;transform-origin:${plan.mine ? "right" : "left"} bottom;`;

  const wrap = document.createElement("div");
  wrap.setAttribute("data-flight-wrap", "");
  wrap.appendChild(ghost);
  document.body.appendChild(wrap);

  row.classList.add("msg-ghosting");
  const dx = plan.from.x - target.x;
  const dy = plan.from.y - target.y;
  // Start small (roughly the composer's visual width) and grow into the bubble.
  const startScale = Math.max(0.55, Math.min(1, (plan.from.width || target.width) / Math.max(1, target.width)));

  const anim = ghost.animate(
    [
      { transform: `translate(${plan.from.x}px, ${plan.from.y}px) scale(${startScale})`, opacity: 0.94 },
      { transform: `translate(${target.x}px, ${target.y}px) scale(1)`, opacity: 1 },
    ],
    { duration: 440, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
  );
  cancelAnim.push(anim);
  anim.onfinish = () => {
    anim.onfinish = null;
    wrap.remove();
    row.classList.remove("msg-ghosting");
    // Landing settle: one soft overshoot on the bubble itself.
    const bubble = row.querySelector<HTMLElement>("[data-bubble]");
    if (bubble) {
      const settle = bubble.animate(
        [{ transform: "scale(1.04)" }, { transform: "scale(1)" }],
        { duration: 170, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
      );
      cancelAnim.push(settle);
    }
  };
  anim.oncancel = () => {
    wrap.remove();
    row.classList.remove("msg-ghosting");
  };
  return () => {
    try {
      anim.cancel();
    } catch {
      /* already finished */
    }
  };
}

/** Remove any straggler ghost wrappers (unmount safety). */
export function cleanupGhosts() {
  document.querySelectorAll("[data-flight-wrap]").forEach((n) => n.remove());
}
