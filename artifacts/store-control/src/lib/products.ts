import { db, type Product, generateId, now } from "./db";
import { ensureBaseUnit } from "./product-units";
import { addAuditLog } from "./audit";
import { z } from "zod";

export const productSchema = z.object({
  productCode: z.string().trim().max(50).optional().or(z.literal("")),
  productName: z.string().trim().min(1, "Product name is required").max(255),
  barcode: z.string().trim().max(64).optional().or(z.literal("")),
  category: z.string().trim().max(100).optional().or(z.literal("")),
  manufacturer: z.string().trim().max(255).optional().or(z.literal("")),
  baseUnit: z.string().trim().min(1, "Base unit is required").max(50),
  reorderLevel: z.coerce.number().int().min(0),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type ProductInput = z.infer<typeof productSchema>;

function clean(input: ProductInput, code?: string): Omit<Product, "id" | "createdAt" | "updatedAt" | "createdBy"> {
  const blank = (v?: string | null) => (v && v.length ? v : null);
  return {
    productCode: code || blank(input.productCode) || `PRD-${Date.now()}`,
    productName: input.productName,
    barcode: blank(input.barcode),
    category: blank(input.category),
    manufacturer: blank(input.manufacturer),
    baseUnit: input.baseUnit || "unit",
    reorderLevel: input.reorderLevel ?? 0,
    notes: blank(input.notes),
  };
}

async function generateProductCode(): Promise<string> {
  const count = await db.products.count();
  return `PRD-${String(count + 1).padStart(6, "0")}`;
}

export async function listProducts(search?: string): Promise<Product[]> {
  let products: Product[];
  if (search && search.trim()) {
    const s = search.trim().toLowerCase();
    products = await db.products.filter((p) =>
      p.productName.toLowerCase().includes(s) ||
      p.productCode.toLowerCase().includes(s) ||
      (p.barcode ?? "").toLowerCase().includes(s) ||
      (p.manufacturer ?? "").toLowerCase().includes(s) ||
      (p.category ?? "").toLowerCase().includes(s)
    ).toArray();
  } else {
    products = await db.products.toArray();
  }
  return products.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getProduct(id: string): Promise<Product | undefined> {
  return db.products.get(id);
}

export async function createProduct(input: ProductInput, userId?: string): Promise<Product> {
  const normalizedName = input.productName.trim().toLowerCase();
  const existing = await db.products.filter(p => p.productName.trim().toLowerCase() === normalizedName).first();
  if (existing) throw new Error(`A product named "${existing.productName}" already exists`);

  const code = await generateProductCode();
  const product: Product = {
    id: generateId(),
    createdBy: userId ?? null,
    createdAt: now(),
    updatedAt: now(),
    ...clean(input, input.productCode || code),
  };
  await db.products.add(product);
  await ensureBaseUnit(product.id, product.baseUnit || "unit");
  await addAuditLog({ action: "create", tableName: "products", recordId: product.id, userId: userId ?? null, changes: JSON.stringify(product) });
  return product;
}

export async function updateProduct(id: string, input: ProductInput, userId?: string): Promise<void> {
  const normalizedName = input.productName.trim().toLowerCase();
  const existing = await db.products
    .filter(p => p.id !== id && p.productName.trim().toLowerCase() === normalizedName)
    .first();
  if (existing) throw new Error(`A product named "${existing.productName}" already exists`);

  const changes = clean(input);
  await db.products.update(id, { ...changes, updatedAt: now() });
  await addAuditLog({ action: "update", tableName: "products", recordId: id, userId: userId ?? null, changes: JSON.stringify(changes) });
}

export async function deduplicateProducts(userId?: string): Promise<{ removed: number; merged: number }> {
  const all = await db.products.toArray();
  const groups = new Map<string, typeof all>();
  for (const p of all) {
    const key = p.productName.trim().toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  let removed = 0;
  let merged = 0;
  for (const [, group] of groups) {
    if (group.length < 2) continue;
    group.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const [keep, ...dupes] = group;
    for (const dupe of dupes) {
      // Move all inventory batches to the kept product
      const batches = await db.inventoryBatches.where("productId").equals(dupe.id).toArray();
      for (const b of batches) {
        await db.inventoryBatches.update(b.id, { productId: keep.id });
        merged++;
      }
      // Move all transaction lines referencing this product
      const txns = await db.inventoryTransactions.where("productId").equals(dupe.id).toArray();
      for (const t of txns) {
        await db.inventoryTransactions.update(t.id, { productId: keep.id });
        merged++;
      }
      await db.products.delete(dupe.id);
      await addAuditLog({ action: "delete", tableName: "products", recordId: dupe.id, userId: userId ?? null, changes: JSON.stringify({ reason: "deduplication", mergedInto: keep.id }) });
      removed++;
    }
  }
  return { removed, merged };
}

export async function deleteProduct(id: string, userId?: string): Promise<void> {
  await db.products.delete(id);
  await addAuditLog({ action: "delete", tableName: "products", recordId: id, userId: userId ?? null, changes: "{}" });
}

export async function getCategories(): Promise<string[]> {
  const products = await db.products.toArray();
  const cats = new Set(products.map((p) => p.category).filter(Boolean) as string[]);
  return [...cats].sort();
}

export async function searchProductsAutocomplete(term: string, limit = 8): Promise<Product[]> {
  if (!term.trim()) return [];
  const s = term.trim().toLowerCase();
  const results = await db.products.filter((p) =>
    p.productName.toLowerCase().includes(s) ||
    p.productCode.toLowerCase().includes(s) ||
    (p.barcode ?? "").toLowerCase().includes(s)
  ).toArray();
  return results.slice(0, limit);
}

export async function findProductByBarcode(barcode: string): Promise<Product | undefined> {
  return db.products.where("barcode").equals(barcode).first();
}
