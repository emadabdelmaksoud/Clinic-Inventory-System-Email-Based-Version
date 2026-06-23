import { db, type AuditLog, generateId, now } from "./db";

interface AddAuditLogInput {
  action: string;
  tableName: string;
  recordId: string;
  userId: string | null;
  changes: string;
}

export async function addAuditLog(input: AddAuditLogInput): Promise<void> {
  const log: AuditLog = {
    id: generateId(),
    action: input.action,
    tableName: input.tableName,
    recordId: input.recordId,
    userId: input.userId,
    changes: input.changes,
    createdAt: now(),
  };
  await db.auditLogs.add(log);
}

export async function listAuditLogs(limit = 500): Promise<AuditLog[]> {
  return db.auditLogs.orderBy("createdAt").reverse().limit(limit).toArray();
}

export async function clearAuditLogs(): Promise<void> {
  await db.auditLogs.clear();
}
