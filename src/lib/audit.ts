import { db } from "@/db";
import { auditLogs } from "@/db/schema";

export async function audit(
  action: string,
  opts: { actor?: string; targetType?: string; targetId?: string; details?: string } = {},
) {
  try {
    await db.insert(auditLogs).values({
      actor: (opts.actor ?? "admin").slice(0, 64),
      action: action.slice(0, 64),
      targetType: opts.targetType?.slice(0, 32) ?? null,
      targetId: opts.targetId?.slice(0, 64) ?? null,
      details: opts.details?.slice(0, 2000) ?? null,
    });
  } catch (error) {
    console.error("[panda-chat] audit log failed", error);
  }
}
