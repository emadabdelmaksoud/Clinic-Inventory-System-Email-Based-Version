import { db } from "./db";
import type { TransactionType } from "./db";

export interface ReportFilters {
  from?: string | null;
  to?: string | null;
  warehouseId?: string | null;
  productId?: string | null;
  category?: string | null;
  transactionType?: TransactionType | null;
}

export interface OverviewKpis {
  totalProducts: number;
  totalBatches: number;
  totalWarehouses: number;
  totalStockBaseUnits: number;
}

export async function getOverviewKpis(): Promise<OverviewKpis> {
  const [products, batches, warehouses] = await Promise.all([
    db.products.count(),
    db.inventoryBatches.filter(b => b.quantityBaseUnit > 0).count(),
    db.warehouses.filter(w => w.isActive).count(),
  ]);
  const allBatches = await db.inventoryBatches.toArray();
  const totalStockBaseUnits = allBatches.reduce((sum, b) => sum + b.quantityBaseUnit, 0);
  return { totalProducts: products, totalBatches: batches, totalWarehouses: warehouses, totalStockBaseUnits };
}

export interface TxnRow {
  id: string;
  createdAt: string;
  transactionType: TransactionType;
  quantity: number;
  quantityBaseUnit: number;
  notes: string | null;
  productId: string;
  productName: string;
  productCode: string;
  category: string | null;
  warehouseId: string;
  warehouseName: string;
  sectionName: string | null;
  unitName: string | null;
  batchNumber: string | null;
  expiryDate: string | null;
  performedBy: string | null;
  performedByName: string | null;
}

export async function listTransactionsFull(filters: ReportFilters = {}, limit = 500): Promise<TxnRow[]> {
  let txns = await db.inventoryTransactions.orderBy("createdAt").reverse().limit(limit).toArray();

  if (filters.from) txns = txns.filter(t => t.createdAt >= filters.from!);
  if (filters.to) txns = txns.filter(t => t.createdAt <= filters.to! + "T23:59:59");
  if (filters.warehouseId) txns = txns.filter(t => t.warehouseId === filters.warehouseId);
  if (filters.productId) txns = txns.filter(t => t.productId === filters.productId);
  if (filters.transactionType) txns = txns.filter(t => t.transactionType === filters.transactionType);

  const [products, warehouses, sections, units, batches, users] = await Promise.all([
    db.products.toArray(),
    db.warehouses.toArray(),
    db.warehouseSections.toArray(),
    db.productUnits.toArray(),
    db.inventoryBatches.toArray(),
    db.users.toArray(),
  ]);

  const productMap = new Map(products.map(p => [p.id, p]));
  const warehouseMap = new Map(warehouses.map(w => [w.id, w]));
  const sectionMap = new Map(sections.map(s => [s.id, s]));
  const unitMap = new Map(units.map(u => [u.id, u]));
  const batchMap = new Map(batches.map(b => [b.id, b]));
  const userMap = new Map(users.map(u => [u.id, u]));

  let rows: TxnRow[] = txns.map(t => ({
    id: t.id,
    createdAt: t.createdAt,
    transactionType: t.transactionType,
    quantity: t.quantity,
    quantityBaseUnit: t.quantityBaseUnit,
    notes: t.notes,
    productId: t.productId,
    productName: productMap.get(t.productId)?.productName ?? "Unknown",
    productCode: productMap.get(t.productId)?.productCode ?? "",
    category: productMap.get(t.productId)?.category ?? null,
    warehouseId: t.warehouseId,
    warehouseName: warehouseMap.get(t.warehouseId)?.warehouseName ?? "Unknown",
    sectionName: t.sectionId ? (sectionMap.get(t.sectionId)?.sectionName ?? null) : null,
    unitName: unitMap.get(t.unitId)?.unitName ?? null,
    batchNumber: batchMap.get(t.batchId)?.batchNumber ?? null,
    expiryDate: batchMap.get(t.batchId)?.expiryDate ?? null,
    performedBy: t.performedBy,
    performedByName: t.performedBy ? (userMap.get(t.performedBy)?.fullName ?? null) : null,
  }));

  if (filters.category) rows = rows.filter(r => r.category === filters.category);

  return rows;
}

export interface BatchDetail {
  batchId: string;
  batchNumber: string | null;
  expiryDate: string | null;
  quantityBaseUnit: number;
  warehouseId: string;
  warehouseName: string;
}

export interface StockSummaryRow {
  productId: string;
  productName: string;
  productCode: string;
  category: string | null;
  baseUnit: string;
  reorderLevel: number;
  onHandBase: number;
  batchCount: number;
  nearExpiry: number;
  expired: number;
  batches: BatchDetail[];
}

export async function getStockSummary(): Promise<StockSummaryRow[]> {
  const [products, batches, warehouses] = await Promise.all([
    db.products.toArray(),
    db.inventoryBatches.toArray(),
    db.warehouses.toArray(),
  ]);

  const warehouseMap = new Map(warehouses.map(w => [w.id, w]));
  const today = new Date().toISOString().slice(0, 10);
  const nearLimit = new Date();
  nearLimit.setDate(nearLimit.getDate() + 90);
  const nearLimitStr = nearLimit.toISOString().slice(0, 10);

  return products.map(p => {
    const pBatches = batches.filter(b => b.productId === p.id && b.quantityBaseUnit > 0);
    const batchDetails: BatchDetail[] = pBatches.map(b => ({
      batchId: b.id,
      batchNumber: b.batchNumber,
      expiryDate: b.expiryDate,
      quantityBaseUnit: b.quantityBaseUnit,
      warehouseId: b.warehouseId,
      warehouseName: warehouseMap.get(b.warehouseId)?.warehouseName ?? "Unknown",
    }));
    const onHandBase = pBatches.reduce((s, b) => s + b.quantityBaseUnit, 0);
    const nearExpiry = pBatches.filter(b => b.expiryDate && b.expiryDate >= today && b.expiryDate <= nearLimitStr).length;
    const expired = pBatches.filter(b => b.expiryDate && b.expiryDate < today).length;
    return {
      productId: p.id,
      productName: p.productName,
      productCode: p.productCode,
      category: p.category,
      baseUnit: p.baseUnit,
      reorderLevel: p.reorderLevel,
      onHandBase,
      batchCount: pBatches.length,
      nearExpiry,
      expired,
      batches: batchDetails,
    };
  });
}
