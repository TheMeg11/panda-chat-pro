/**
 * In-process user-activity tracker (cost tier B/C, 2026-11-21).
 *
 * Background loops (maintenance sweep) consult this BEFORE doing any work.
 * On a serverless (sleeping) deployment every outbound packet — even a single
 * settings SELECT to the internal Postgres — resets Railway's idle timer and
 * keeps the container awake forever. Gating on real user traffic is what lets
 * the app actually sleep.
 *
 * What counts as activity (markActivity call sites):
 *  - an authenticated web/API/server-action request (getCurrentUser)
 *  - a valid Super Admin panel session (getAdminSession)
 *  - a guest chat poll/send on /api/r/[token]/* (resolve succeeded)
 *
 * Deliberately NOT activity: the health check, static assets, anonymous
 * landing-page visits — otherwise the container would never sleep.
 */

const g = globalThis as typeof globalThis & { __pcLastActivity?: number };

const minutes = (raw: string | undefined, fallback: number, min: number, max: number): number => {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
};

/** Idle window for general background work (maintenance). */
export const ACTIVE_WINDOW_MS = minutes(process.env.ACTIVITY_WINDOW_MINUTES, 10, 1, 120) * 60_000;

/** Records that a real user just interacted with the app. */
export function markActivity(at: number = Date.now()): void {
  g.__pcLastActivity = at;
}

/** Epoch ms of the last user interaction (0 = never in this process). */
export function lastActivityAt(): number {
  return g.__pcLastActivity ?? 0;
}

/** true when a user interacted within `windowMs` (default: ACTIVE_WINDOW_MS). */
export function isUserActive(windowMs: number = ACTIVE_WINDOW_MS): boolean {
  return Date.now() - lastActivityAt() <= windowMs;
}

/** Test hook — forget the recorded activity. */
export function resetActivityForTests(): void {
  g.__pcLastActivity = undefined;
}
