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
 */
import { cpSync, existsSync } from "node:fs";
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
