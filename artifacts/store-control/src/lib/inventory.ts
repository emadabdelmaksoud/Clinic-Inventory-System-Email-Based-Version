import { db, type InventoryBatch, type InventoryTransaction, type TransactionType, generateId, now } from "./db";
import { addAuditLog } from "./audit";
import { z } from "zod";

export const TRANSACTION_TYPES: TransactionType[] = [
  "stock_in", "dispensing", "transfer_in", "transfer_out", "disposal", "adjustment", "inventory_count",
];

export const TRANSACTION_LABELS: Record<TransactionType, string> = {
  stock_in: "Stock In",
  dispensing: "Dispensing",
  transfer_in: "Transfer In",
  transfer_out: "Transfer Out",
  disposal: "Disposal",
  adjustment: "Adjustment",
  inventory_count: "Inventory Count",
};

export const transactionSchema = z.object({
  transactionType: z.enum(["stock_in", "dispensing", "transfer_in", "transfer_out", "disposal", "adjustment", "inventory_count"]),
  productId: z.string().uuid(),
  batchId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  sectionId: z.string().uuid().nullable().optional(),
  quantity: z.coerce.number().positive("Quantity must be positive"),
  unitId: z.string().uuid(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export type TransactionInput = z.infer<typeof transactionSchema>;

export const batchSchema = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  sectionId: z.string().uuid().nullable().optional(),
  batchNumber: z.string().trim().max(100).nullable().optional(),
  expiryDate: z.string().nullable().optional(),
});
export type BatchInput = z.infer<typeof batchSchema>;

const POSITIVE_TYPES: TransactionType[] = ["stock_in", "transfer_in", "adjustment", "inventory_count"];

export async function upsertBatch(input: BatchInput): Promise<InventoryBatch> {
  const existing = await db.inventoryBatches
    .filter(b =>
      b.productId === input.productId &&
      b.warehouseId === input.warehouseId &&
      (b.sectionId ?? null) === (input.sectionId ?? null) &&
      (b.batchNumber ?? null) === (input.batchNumber ?? null) &&
      (b.expiryDate ?? null) === (input.expiryDate ?? null)
    ).first();

  if (existing) return existing;

  const batch: InventoryBatch = {
    id: generateId(),
    productId: input.productId,
    warehouseId: input.warehouseId,
    sectionId: input.sectionId ?? null,
    batchNumber: input.batchNumber ?? null,
    expiryDate: input.expiryDate ?? null,
    quantityBaseUnit: 0,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.inventoryBatches.add(batch);
  return batch;
}

export async function recordTransaction(
  input: TransactionInput & { performedBy?: string | null },
  unitFactor = 1
): Promise<InventoryTransaction> {
  const qtyBase = input.quantity * unitFactor;
  const txn: InventoryTransaction = {
    id: generateId(),
    transactionType: input.transactionType,
    productId: input.productId,
    batchId: input.batchId,
    warehouseId: input.warehouseId,
    sectionId: input.sectionId ?? null,
    quantity: input.quantity,
    unitId: input.unitId,
    quantityBaseUnit: qtyBase,
    performedBy: input.performedBy ?? null,
    notes: input.notes ?? null,
    createdAt: now(),
  };

  await db.inventoryTransactions.add(txn);

  const batch = await db.inventoryBatches.get(input.batchId);
  if (batch) {
    let newQty: number;
    if (input.transactionType === "inventory_count") {
      newQty = qtyBase;
    } else if (POSITIVE_TYPES.includes(input.transactionType)) {
      newQty = batch.quantityBaseUnit + qtyBase;
    } else {
      newQty = Math.max(0, batch.quantityBaseUnit - qtyBase);
    }
    await db.inventoryBatches.update(input.batchId, { quantityBaseUnit: newQty, updatedAt: now() });
  }

  await addAuditLog({
    action: "transaction",
    tableName: "inventory_transactions",
    recordId: txn.id,
    userId: input.performedBy ?? null,
    changes: JSON.stringify(txn),
  });
  return txn;
}

export async function listTransactions(filter?: {
  productId?: string;
  warehouseId?: string;
  transactionType?: TransactionType;
  limit?: number;
}): Promise<InventoryTransaction[]> {
  let results = await db.inventoryTransactions.orderBy("createdAt").reverse().toArray();

  if (filter?.productId) results = results.filter(t => t.productId === filter.productId);
  if (filter?.warehouseId) results = results.filter(t => t.warehouseId === filter.warehouseId);
  if (filter?.transactionType) results = results.filter(t => t.transactionType === filter.transactionType);
  if (filter?.limit) results = results.slice(0, filter.limit);

  return results;
}

export async function listProductBatches(productId: string): Promise<InventoryBatch[]> {
  const batches = await db.inventoryBatches
    .where("productId").equals(productId)
    .filter((b) => b.quantityBaseUnit > 0)
    .toArray();
  batches.sort((a, b) => {
    if (!a.expiryDate && !b.expiryDate) return a.createdAt.localeCompare(b.createdAt);
    if (!a.expiryDate) return 1;
    if (!b.expiryDate) return -1;
    return a.expiryDate.localeCompare(b.expiryDate);
  });
  return batches;
}

export async function listBatches(filter?: { productId?: string; warehouseId?: string }): Promise<InventoryBatch[]> {
  let results = await db.inventoryBatches.toArray();
  if (filter?.productId) results = results.filter(b => b.productId === filter.productId);
  if (filter?.warehouseId) results = results.filter(b => b.warehouseId === filter.warehouseId);
  return results;
}

export async function listLocationBatches(
  productId: string,
  warehouseId: string,
  sectionId: string | null
): Promise<InventoryBatch[]> {
  let batches = await db.inventoryBatches
    .where("productId").equals(productId)
    .filter(b => b.warehouseId === warehouseId && b.quantityBaseUnit > 0)
    .toArray();

  if (sectionId !== null) {
    batches = batches.filter(b => b.sectionId === sectionId);
  }

  batches.sort((a, b) => {
    if (!a.expiryDate && !b.expiryDate) return a.createdAt.localeCompare(b.createdAt);
    if (!a.expiryDate) return 1;
    if (!b.expiryDate) return -1;
    return a.expiryDate.localeCompare(b.expiryDate);
  });
  return batches;
}

export async function getStockOnHand(filter?: { productId?: string; warehouseId?: string }): Promise<{ productId: string; warehouseId: string; quantityBaseUnit: number }[]> {
  let batches = await db.inventoryBatches.toArray();
  if (filter?.productId) batches = batches.filter(b => b.productId === filter.productId);
  if (filter?.warehouseId) batches = batches.filter(b => b.warehouseId === filter.warehouseId);

  const map = new Map<string, number>();
  for (const b of batches) {
    const key = `${b.productId}::${b.warehouseId}`;
    map.set(key, (map.get(key) ?? 0) + b.quantityBaseUnit);
  }

  return [...map.entries()].map(([key, qty]) => {
    const [productId, warehouseId] = key.split("::");
    return { productId, warehouseId, quantityBaseUnit: qty };
  });
}

export async function getTotalStock(productId: string): Promise<number> {
  const batches = await db.inventoryBatches.where("productId").equals(productId).toArray();
  return batches.reduce((sum, b) => sum + b.quantityBaseUnit, 0);
}
