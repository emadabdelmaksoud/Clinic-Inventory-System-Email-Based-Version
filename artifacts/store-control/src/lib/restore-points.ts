import Dexie, { type Table } from "dexie";
import { db, generateId, now } from "./db";

export interface RestorePoint {
  id: string;
  name: string;
  createdAt: string;
  sizeBytes: number;
  data: string;
}

class RestorePointsDB extends Dexie {
  restorePoints!: Table<RestorePoint, string>;
  constructor() {
    super("StoreControlRestorePoints");
    this.version(1).stores({ restorePoints: "id, name, createdAt" });
  }
}

const rpDb = new RestorePointsDB();

export interface RestorePointMeta {
  id: string;
  name: string;
  createdAt: string;
  sizeBytes: number;
}

export async function saveRestorePoint(name: string): Promise<void> {
  const [products, productUnits, warehouses, sections, batches, transactions, users, auditLogs] =
    await Promise.all([
      db.products.toArray(),
      db.productUnits.toArray(),
      db.warehouses.toArray(),
      db.warehouseSections.toArray(),
      db.inventoryBatches.toArray(),
      db.inventoryTransactions.toArray(),
      db.users.toArray(),
      db.auditLogs.toArray(),
    ]);

  const data = JSON.stringify({
    savedAt: new Date().toISOString(),
    data: { products, productUnits, warehouses, sections, batches, transactions, users, auditLogs },
  });

  await rpDb.restorePoints.add({
    id: generateId(),
    name: name.trim() || `Restore Point ${new Date().toLocaleString()}`,
    createdAt: now(),
    sizeBytes: new Blob([data]).size,
    data,
  });
}

export async function listRestorePoints(): Promise<RestorePointMeta[]> {
  const all = await rpDb.restorePoints.orderBy("createdAt").reverse().toArray();
  return all.map(({ id, name, createdAt, sizeBytes }) => ({ id, name, createdAt, sizeBytes }));
}

export async function deleteRestorePoint(id: string): Promise<void> {
  await rpDb.restorePoints.delete(id);
}

export async function restoreFromPoint(id: string): Promise<void> {
  const rp = await rpDb.restorePoints.get(id);
  if (!rp) throw new Error("Restore point not found");

  const { data: d } = JSON.parse(rp.data);

  await Promise.all([
    db.products.clear(),
    db.productUnits.clear(),
    db.warehouses.clear(),
    db.warehouseSections.clear(),
    db.inventoryBatches.clear(),
    db.inventoryTransactions.clear(),
    db.auditLogs.clear(),
  ]);

  const bulkPut = async (table: any, rows: any[]) => {
    if (rows?.length) await table.bulkPut(rows);
  };

  await Promise.all([
    bulkPut(db.products, d.products),
    bulkPut(db.productUnits, d.productUnits),
    bulkPut(db.warehouses, d.warehouses),
    bulkPut(db.warehouseSections, d.sections),
    bulkPut(db.inventoryBatches, d.batches),
    bulkPut(db.inventoryTransactions, d.transactions),
    bulkPut(db.auditLogs, d.auditLogs),
  ]);
}
