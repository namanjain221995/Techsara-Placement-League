import type { DbOrTx } from "../db";
import { auditLogs } from "../db/schema";

export interface AuditActor {
  id: string | null;
  label: string;
  ip?: string | null;
}

export const SYSTEM_ACTOR: AuditActor = { id: null, label: "system" };

export async function audit(db: DbOrTx, actor: AuditActor, action: string, auctionId: string | null, details: Record<string, unknown> = {}) {
  await db.insert(auditLogs).values({
    auctionId,
    actorId: actor.id,
    actorLabel: actor.label,
    action,
    details,
    ip: actor.ip ?? null,
  });
}
