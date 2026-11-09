export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { ensurePoller } = await import("./lib/telegram/poller");
  ensurePoller();
  const { ensureMaintenance } = await import("./lib/maintenance");
  ensureMaintenance();
  const { ensureBackupLoop } = await import("./lib/backup");
  ensureBackupLoop();
}
