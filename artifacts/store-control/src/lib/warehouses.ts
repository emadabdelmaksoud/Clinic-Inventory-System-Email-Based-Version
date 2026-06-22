import { db, type Warehouse, type WarehouseSection, generateId, now } from "./db";
import { addAuditLog } from "./audit";
import { z } from "zod";

export const warehouseSchema = z.object({
  warehouseCode: z.string().trim().max(50).optional().or(z.literal("")),
  warehouseName: z.string().trim().min(1, "Warehouse name is required").max(255),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  isActive: z.boolean().default(true),
});
export type WarehouseInput = z.infer<typeof warehouseSchema>;

export const sectionSchema = z.object({
  sectionName: z.string().trim().min(1, "Section name is required").max(255),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  isActive: z.boolean().default(true),
});
export type SectionInput = z.infer<typeof sectionSchema>;

const blank = (v?: string | null) => (v && v.length ? v : null);

async function generateWarehouseCode(): Promise<string> {
  const count = await db.warehouses.count();
  return `WH-${String(count + 1).padStart(4, "0")}`;
}

export async function listWarehouses(search?: string): Promise<Warehouse[]> {
  let warehouses: Warehouse[];
  if (search?.trim()) {
    const s = search.trim().toLowerCase();
    warehouses = await db.warehouses.filter((w) =>
      w.warehouseName.toLowerCase().includes(s) ||
      w.warehouseCode.toLowerCase().includes(s)
    ).toArray();
  } else {
    warehouses = await db.warehouses.toArray();
  }
  return warehouses.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getWarehouse(id: string): Promise<Warehouse | undefined> {
  return db.warehouses.get(id);
}

export async function createWarehouse(input: WarehouseInput, userId?: string): Promise<Warehouse> {
  const normalizedName = input.warehouseName.trim().toLowerCase();
  const existing = await db.warehouses.filter(w => w.warehouseName.trim().toLowerCase() === normalizedName).first();
  if (existing) throw new Error(`A warehouse named "${existing.warehouseName}" already exists`);

  const code = await generateWarehouseCode();
  const wh: Warehouse = {
    id: generateId(),
    warehouseCode: input.warehouseCode || code,
    warehouseName: input.warehouseName,
    description: blank(input.description),
    isActive: input.isActive ?? true,
    createdBy: userId ?? null,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.warehouses.add(wh);
  await addAuditLog({ action: "create", tableName: "warehouses", recordId: wh.id, userId: userId ?? null, changes: JSON.stringify(wh) });
  return wh;
}

export async function updateWarehouse(id: string, input: WarehouseInput, userId?: string): Promise<void> {
  const normalizedName = input.warehouseName.trim().toLowerCase();
  const existing = await db.warehouses
    .filter(w => w.id !== id && w.warehouseName.trim().toLowerCase() === normalizedName)
    .first();
  if (existing) throw new Error(`A warehouse named "${existing.warehouseName}" already exists`);

  const changes = {
    warehouseName: input.warehouseName,
    description: blank(input.description),
    isActive: input.isActive ?? true,
    updatedAt: now(),
  };
  await db.warehouses.update(id, changes);
  await addAuditLog({ action: "update", tableName: "warehouses", recordId: id, userId: userId ?? null, changes: JSON.stringify(changes) });
}

export async function deduplicateWarehouses(userId?: string): Promise<{ removed: number; merged: number }> {
  const all = await db.warehouses.toArray();
  const groups = new Map<string, typeof all>();
  for (const w of all) {
    const key = w.warehouseName.trim().toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(w);
  }

  let removed = 0;
  let merged = 0;
  for (const [, group] of groups) {
    if (group.length < 2) continue;
    group.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const [keep, ...dupes] = group;
    for (const dupe of dupes) {
      // Move sections to the kept warehouse
      const sections = await db.warehouseSections.where("warehouseId").equals(dupe.id).toArray();
      for (const s of sections) {
        await db.warehouseSections.update(s.id, { warehouseId: keep.id });
        merged++;
      }
      // Move inventory batches to the kept warehouse
      const batches = await db.inventoryBatches.where("warehouseId").equals(dupe.id).toArray();
      for (const b of batches) {
        await db.inventoryBatches.update(b.id, { warehouseId: keep.id });
        merged++;
      }
      await db.warehouses.delete(dupe.id);
      await addAuditLog({ action: "delete", tableName: "warehouses", recordId: dupe.id, userId: userId ?? null, changes: JSON.stringify({ reason: "deduplication", mergedInto: keep.id }) });
      removed++;
    }
  }
  return { removed, merged };
}

export async function deleteWarehouse(id: string, userId?: string): Promise<void> {
  await db.warehouses.delete(id);
  await db.warehouseSections.where("warehouseId").equals(id).delete();
  await addAuditLog({ action: "delete", tableName: "warehouses", recordId: id, userId: userId ?? null, changes: "{}" });
}

export async function listSections(warehouseId: string): Promise<WarehouseSection[]> {
  return db.warehouseSections.where("warehouseId").equals(warehouseId).toArray();
}

export async function createSection(warehouseId: string, input: SectionInput, userId?: string): Promise<WarehouseSection> {
  const section: WarehouseSection = {
    id: generateId(),
    warehouseId,
    sectionName: input.sectionName,
    description: blank(input.description),
    isActive: input.isActive ?? true,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.warehouseSections.add(section);
  await addAuditLog({ action: "create", tableName: "warehouse_sections", recordId: section.id, userId: userId ?? null, changes: JSON.stringify(section) });
  return section;
}

export async function updateSection(id: string, input: SectionInput, userId?: string): Promise<void> {
  const changes = { sectionName: input.sectionName, description: blank(input.description), isActive: input.isActive ?? true, updatedAt: now() };
  await db.warehouseSections.update(id, changes);
  await addAuditLog({ action: "update", tableName: "warehouse_sections", recordId: id, userId: userId ?? null, changes: JSON.stringify(changes) });
}

export async function deleteSection(id: string, userId?: string): Promise<void> {
  await db.warehouseSections.delete(id);
  await addAuditLog({ action: "delete", tableName: "warehouse_sections", recordId: id, userId: userId ?? null, changes: "{}" });
}
