import { db } from "@/db";
import { sql } from "drizzle-orm";
import { ensurePoller } from "@/lib/telegram/poller";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Single fast query that verifies BOTH connectivity and schema presence.
    // platform_settings may legitimately be empty — `limit 1` returning zero
    // rows is not an error; only a missing relation (schema not applied)
    // throws here.
    await db.execute(sql`select 1 from platform_settings limit 1`);
    ensurePoller();
    return Response.json({ ok: true, db: "ready" });
  } catch {
    // Either the DB is unreachable or sql/init.sql was never applied
    // (e.g. pre-deploy step skipped) — either way the app cannot serve.
    return Response.json({ ok: false, db: "schema-missing" }, { status: 503 });
  }
}
