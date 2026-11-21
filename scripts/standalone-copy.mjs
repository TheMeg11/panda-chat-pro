#!/usr/bin/env node
/**
 * Standalone bundle finisher (cost tier B, 2026-11-21).
 *
 * `next build` with output:"standalone" produces a minimal server at
 * .next/standalone/server.js but deliberately leaves two things OUT of the
 * bundle: the static build assets and the public/ folder. Both must sit next
 * to server.js or every page loads without JS/CSS/icons. Runs as part of
 * `npm run build` so every environment (Railway, local) gets a complete
 * bundle. Idempotent; exits non-zero only when the standalone build itself
 * is missing (i.e. the build was misconfigured).
 *
 * Also hardens the generated server.js bind address (2026-11-21 outage
 * post-mortem): the template binds to process.env.HOSTNAME when set, and
 * container orchestrators — Railway included — inject HOSTNAME with the
 * CONTAINER HOSTNAME. The server then binds one specific interface, the
 * platform mesh connects elsewhere and every request dies with
 * "connection refused" (502). We replace the template's HOSTNAME fallback
 * with BIND_HOST: wildcard by default, explicitly overridable, and immune
 * to orchestrator hostname injection.
 */
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const standalone = join(root, ".next", "standalone");

if (!existsSync(join(standalone, "server.js"))) {
  console.error("[standalone-copy] .next/standalone/server.js is missing — was the build run with output:standalone?");
  process.exit(1);
}

cpSync(join(root, ".next", "static"), join(standalone, ".next", "static"), { recursive: true });
cpSync(join(root, "public"), join(standalone, "public"), { recursive: true });
console.log("[standalone-copy] static assets + public/ copied into .next/standalone");

// Bind hardening — see the doc block above.
const serverPath = join(standalone, "server.js");
const serverJs = readFileSync(serverPath, "utf8");
const HOSTNAME_TEMPLATE = "process.env.HOSTNAME || '0.0.0.0'";
const BIND_HOST_TEMPLATE = "process.env.BIND_HOST || '0.0.0.0'";
if (serverJs.includes(HOSTNAME_TEMPLATE)) {
  writeFileSync(serverPath, serverJs.replace(HOSTNAME_TEMPLATE, BIND_HOST_TEMPLATE));
  console.log("[standalone-copy] server.js bind hardened: HOSTNAME fallback -> BIND_HOST (wildcard by default)");
} else if (!serverJs.includes(BIND_HOST_TEMPLATE)) {
  console.warn(
    "[standalone-copy] WARNING: could not find the HOSTNAME fallback in server.js — " +
      "Next.js changed the template. Verify the platform can reach the server (0.0.0.0 binding) before shipping!",
  );
} else {
  console.log("[standalone-copy] server.js bind already hardened (BIND_HOST)");
}
