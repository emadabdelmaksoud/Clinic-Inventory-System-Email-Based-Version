import { db, type InventoryBatch, type ProductUnit } from "./db";
import { recordTransaction } from "./inventory";
import { fromBase, toBase } from "./product-units";

export const DEFAULT_NEAR_EXPIRY_DAYS = 90;

export type ExpiryStatus = "ok" | "near" | "expired" | "no-expiry";

export function classifyExpiry(expiry: string | null | undefined, nearDays = DEFAULT_NEAR_EXPIRY_DAYS): ExpiryStatus {
  if (!expiry) return "no-expiry";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expiry);
  const diff = Math.floor((exp.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return "expired";
  if (diff <= nearDays) return "near";
  return "ok";
}

export function daysUntil(expiry: string | null | undefined): number | null {
  if (!expiry) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expiry);
  return Math.floor((exp.getTime() - today.getTime()) / 86400000);
}

export async function fetchFifoBatches(
  productId: string,
  warehouseId: string,
  sectionId?: string | null,
  opts?: { includeExpired?: boolean }
): Promise<InventoryBatch[]> {
  let batches = await db.inventoryBatches
    .where("productId").equals(productId)
    .filter(b => b.warehouseId === warehouseId && b.quantityBaseUnit > 0)
    .toArray();
  if (sectionId) batches = batches.filter(b => b.sectionId === sectionId);
  batches.sort((a, b) => {
    if (!a.expiryDate && !b.expiryDate) return a.createdAt.localeCompare(b.createdAt);
    if (!a.expiryDate) return 1;
    if (!b.expiryDate) return -1;
    const cmp = a.expiryDate.localeCompare(b.expiryDate);
    if (cmp !== 0) return cmp;
    return a.createdAt.localeCompare(b.createdAt);
  });
  if (!opts?.includeExpired) return batches.filter(b => classifyExpiry(b.expiryDate) !== "expired");
  return batches;
}

export interface FifoAllocation {
  batch: InventoryBatch;
  takeBase: number;
}

export function planFifoAllocation(batches: InventoryBatch[], neededBase: number): FifoAllocation[] {
  if (neededBase <= 0) throw new Error("Quantity must be > 0");
  const plan: FifoAllocation[] = [];
  let remaining = neededBase;
  for (const b of batches) {
    if (remaining <= 0) break;
    const avail = b.quantityBaseUnit;
    if (avail <= 0) continue;
    const take = Math.min(avail, remaining);
    plan.push({ batch: b, takeBase: take });
    remaining -= take;
  }
  if (remaining > 0.0001) {
    const have = neededBase - remaining;
    throw new Error(`Insufficient stock. Needed ${neededBase.toFixed(2)} base units, only ${have.toFixed(2)} available.`);
  }
  return plan;
}

export async function dispenseFifo(args: {
  productId: string;
  warehouseId: string;
  sectionId?: string | null;
  unit: ProductUnit;
  quantity: number;
  notes?: string | null;
  type?: "dispensing" | "disposal";
  performedBy?: string | null;
}) {
  const txnType = args.type ?? "dispensing";
  const neededBase = toBase(args.quantity, args.unit);
  const candidates = await fetchFifoBatches(args.productId, args.warehouseId, args.sectionId ?? null);
  const plan = planFifoAllocation(candidates, neededBase);

  for (const step of plan) {
    if (classifyExpiry(step.batch.expiryDate) === "expired") throw new Error("Cannot dispense expired batches");
  }

  const results = [];
  for (const step of plan) {
    const qtyInUnit = fromBase(step.takeBase, args.unit);
    const txn = await recordTransaction({
      transactionType: txnType,
      productId: args.productId,
      batchId: step.batch.id,
      warehouseId: args.warehouseId,
      sectionId: args.sectionId ?? null,
      unitId: args.unit.id,
      quantity: qtyInUnit,
      notes: args.notes ?? null,
      performedBy: args.performedBy ?? null,
    }, args.unit.factorToBase);
    results.push({ txn, batch: step.batch, qtyInUnit, qtyBase: step.takeBase });
  }
  return results;
}

export async function listExpiredBatches() {
  const today = new Date().toISOString().slice(0, 10);
  return db.inventoryBatches
    .filter(b => b.quantityBaseUnit > 0 && !!b.expiryDate && b.expiryDate < today)
    .toArray();
}

export async function listNearExpiryBatches(days = DEFAULT_NEAR_EXPIRY_DAYS) {
  const today = new Date();
  const limit = new Date();
  limit.setDate(today.getDate() + days);
  const todayStr = today.toISOString().slice(0, 10);
  const limitStr = limit.toISOString().slice(0, 10);
  return db.inventoryBatches
    .filter(b => b.quantityBaseUnit > 0 && !!b.expiryDate && b.expiryDate >= todayStr && b.expiryDate <= limitStr)
    .toArray();
}

export async function listLowStockProducts() {
  const [batches, products] = await Promise.all([
    db.inventoryBatches.toArray(),
    db.products.toArray(),
  ]);
  const onHand = new Map<string, number>();
  for (const b of batches) {
    onHand.set(b.productId, (onHand.get(b.productId) ?? 0) + b.quantityBaseUnit);
  }
  return products
    .filter(p => p.reorderLevel > 0 && (onHand.get(p.id) ?? 0) < p.reorderLevel)
    .map(p => ({ ...p, onHandBase: onHand.get(p.id) ?? 0 }))
    .sort((a, b) => a.onHandBase - b.onHandBase);
}
