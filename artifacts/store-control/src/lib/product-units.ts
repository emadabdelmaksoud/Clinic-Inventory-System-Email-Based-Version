import { db, type ProductUnit, generateId, now } from "./db";
import { z } from "zod";

export const productUnitSchema = z.object({
  unitName: z.string().trim().min(1, "Unit name is required").max(50),
  factorToBase: z.coerce.number().positive("Factor must be positive"),
  isBase: z.boolean().default(false),
  barcode: z.string().trim().max(64).optional().or(z.literal("")),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export type ProductUnitInput = z.infer<typeof productUnitSchema>;

export async function listProductUnits(productId: string): Promise<ProductUnit[]> {
  const units = await db.productUnits.where("productId").equals(productId).sortBy("sortOrder");
  if (units.length === 0) {
    const product = await db.products.get(productId);
    if (product) {
      const baseUnit = await ensureBaseUnit(productId, product.baseUnit || "unit");
      return [baseUnit];
    }
  }
  return units;
}

export async function createProductUnit(productId: string, input: ProductUnitInput): Promise<ProductUnit> {
  if (input.isBase) {
    const existing = await db.productUnits.where("productId").equals(productId).filter(u => u.isBase).first();
    if (existing) throw new Error("Product already has a base unit");
    if (input.factorToBase !== 1) throw new Error("Base unit factor must be 1");
  }
  const unit: ProductUnit = {
    id: generateId(),
    productId,
    unitName: input.unitName,
    factorToBase: input.factorToBase,
    isBase: input.isBase,
    barcode: input.barcode || null,
    sortOrder: input.sortOrder,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.productUnits.add(unit);
  return unit;
}

export async function updateProductUnit(id: string, input: Partial<ProductUnitInput>): Promise<void> {
  await db.productUnits.update(id, { ...input, updatedAt: now() });
}

export async function deleteProductUnit(id: string): Promise<void> {
  const unit = await db.productUnits.get(id);
  if (unit?.isBase) throw new Error("Cannot delete base unit");
  await db.productUnits.delete(id);
}

export async function getBaseUnit(productId: string): Promise<ProductUnit | undefined> {
  return db.productUnits.where("productId").equals(productId).filter(u => u.isBase).first();
}

export async function findUnitByBarcode(barcode: string): Promise<{ unit: ProductUnit; productId: string } | undefined> {
  const unit = await db.productUnits.where("barcode").equals(barcode).first();
  if (!unit) return undefined;
  return { unit, productId: unit.productId };
}

export function convertUnits(qty: number, fromUnit: ProductUnit, toUnit: ProductUnit): number {
  if (fromUnit.productId !== toUnit.productId) throw new Error("Units belong to different products");
  return (qty * fromUnit.factorToBase) / toUnit.factorToBase;
}

export function toBase(qty: number, unit: ProductUnit): number {
  return qty * unit.factorToBase;
}

export function fromBase(qtyBase: number, unit: ProductUnit): number {
  return qtyBase / unit.factorToBase;
}

export async function ensureBaseUnit(productId: string, baseUnitName: string): Promise<ProductUnit> {
  const existing = await db.productUnits.where("productId").equals(productId).filter(u => u.isBase).first();
  if (existing) return existing;
  return createProductUnit(productId, {
    unitName: baseUnitName,
    factorToBase: 1,
    isBase: true,
    barcode: "",
    sortOrder: 0,
  });
}
