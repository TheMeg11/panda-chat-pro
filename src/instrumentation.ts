export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  // v1.5.2: heal the database schema BEFORE any background loop queries it —
  // a redeploy without preDeployCommand leaves the DB empty (42P01 everywhere).
  const { ensureSchema } = await import("./lib/schema-heal");
  await ensureSchema();
  const { ensurePoller } = await import("./lib/telegram/poller");
  ensurePoller();
  const { ensureMaintenance } = await import("./lib/maintenance");
  ensureMaintenance();
  const { ensureBackupLoop } = await import("./lib/backup");
  ensureBackupLoop();
}
