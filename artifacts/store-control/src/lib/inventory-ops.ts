import { db } from "./db";
import { upsertBatch, recordTransaction } from "./inventory";
import type { InventoryTransaction } from "./db";

export interface StockInParams {
  productId: string;
  warehouseId: string;
  sectionId: string | null;
  batchNumber: string | null;
  expiryDate: string | null;
  unitId: string;
  quantity: number;
  notes: string | null;
  performedBy?: string | null;
}

export async function performStockIn(params: StockInParams): Promise<InventoryTransaction> {
  const unit = await db.productUnits.get(params.unitId);
  if (!unit) throw new Error("Unit not found");

  const batch = await upsertBatch({
    productId: params.productId,
    warehouseId: params.warehouseId,
    sectionId: params.sectionId,
    batchNumber: params.batchNumber,
    expiryDate: params.expiryDate,
  });

  return recordTransaction({
    transactionType: "stock_in",
    productId: params.productId,
    batchId: batch.id,
    warehouseId: params.warehouseId,
    sectionId: params.sectionId,
    quantity: params.quantity,
    unitId: params.unitId,
    notes: params.notes,
    performedBy: params.performedBy ?? null,
  }, unit.factorToBase);
}

export interface OutOrCountParams {
  type: "dispensing" | "disposal" | "inventory_count";
  productId: string;
  batchId: string;
  warehouseId: string;
  sectionId: string | null;
  unitId: string;
  quantity: number;
  notes: string | null;
  performedBy?: string | null;
}

export async function performOutOrCount(params: OutOrCountParams): Promise<InventoryTransaction> {
  const unit = await db.productUnits.get(params.unitId);
  if (!unit) throw new Error("Unit not found");

  const batch = await db.inventoryBatches.get(params.batchId);
  if (!batch) throw new Error("Batch not found");

  const qtyBase = params.quantity * unit.factorToBase;

  if (params.type !== "inventory_count" && qtyBase > batch.quantityBaseUnit + 0.0001) {
    throw new Error(
      `Insufficient stock. Need ${qtyBase.toFixed(2)} base units, have ${batch.quantityBaseUnit.toFixed(2)}`
    );
  }

  return recordTransaction({
    transactionType: params.type,
    productId: params.productId,
    batchId: params.batchId,
    warehouseId: params.warehouseId,
    sectionId: params.sectionId,
    quantity: params.quantity,
    unitId: params.unitId,
    notes: params.notes,
    performedBy: params.performedBy ?? null,
  }, unit.factorToBase);
}

export interface TransferParams {
  productId: string;
  sourceBatchId: string;
  sourceWarehouseId: string;
  sourceSectionId: string | null;
  destWarehouseId: string;
  destSectionId: string | null;
  destBatchNumber: string | null;
  destExpiryDate: string | null;
  unitId: string;
  quantity: number;
  notes: string | null;
  performedBy?: string | null;
}

export async function performTransfer(params: TransferParams): Promise<InventoryTransaction> {
  const unit = await db.productUnits.get(params.unitId);
  if (!unit) throw new Error("Unit not found");

  const srcBatch = await db.inventoryBatches.get(params.sourceBatchId);
  if (!srcBatch) throw new Error("Source batch not found");

  const qtyBase = params.quantity * unit.factorToBase;
  if (qtyBase > srcBatch.quantityBaseUnit + 0.0001) {
    throw new Error(
      `Insufficient stock. Need ${qtyBase.toFixed(2)} base units, have ${srcBatch.quantityBaseUnit.toFixed(2)}`
    );
  }

  await recordTransaction({
    transactionType: "transfer_out",
    productId: params.productId,
    batchId: params.sourceBatchId,
    warehouseId: params.sourceWarehouseId,
    sectionId: params.sourceSectionId,
    quantity: params.quantity,
    unitId: params.unitId,
    notes: params.notes,
    performedBy: params.performedBy ?? null,
  }, unit.factorToBase);

  const destBatch = await upsertBatch({
    productId: params.productId,
    warehouseId: params.destWarehouseId,
    sectionId: params.destSectionId,
    batchNumber: params.destBatchNumber ?? srcBatch.batchNumber,
    expiryDate: params.destExpiryDate ?? srcBatch.expiryDate,
  });

  return recordTransaction({
    transactionType: "transfer_in",
    productId: params.productId,
    batchId: destBatch.id,
    warehouseId: params.destWarehouseId,
    sectionId: params.destSectionId,
    quantity: params.quantity,
    unitId: params.unitId,
    notes: params.notes,
    performedBy: params.performedBy ?? null,
  }, unit.factorToBase);
}
