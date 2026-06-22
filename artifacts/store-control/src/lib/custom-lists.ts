import { db } from "./db";
import { PHARMA_CATEGORIES, PHARMA_UNITS } from "./pharma-constants";

async function getJsonSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const row = await db.settings.get(key);
    if (!row?.value) return fallback;
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

async function setJsonSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value: JSON.stringify(value) });
}

export async function getCustomCategories(): Promise<string[]> {
  return getJsonSetting<string[]>("customCategories", []);
}

export async function saveCustomCategories(cats: string[]): Promise<void> {
  await setJsonSetting("customCategories", cats);
}

export async function getCustomUnits(): Promise<string[]> {
  return getJsonSetting<string[]>("customUnits", []);
}

export async function saveCustomUnits(units: string[]): Promise<void> {
  await setJsonSetting("customUnits", units);
}

export async function getAllCategories(): Promise<string[]> {
  const custom = await getCustomCategories();
  const merged = new Set([...PHARMA_CATEGORIES, ...custom]);
  return [...merged].sort();
}

export async function getAllUnits(): Promise<string[]> {
  const custom = await getCustomUnits();
  const merged = new Set([...PHARMA_UNITS, ...custom]);
  return [...merged].sort();
}
