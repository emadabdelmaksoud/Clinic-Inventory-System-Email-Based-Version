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

const CAT_KEY = "effectiveCategories";
const UNIT_KEY = "effectiveUnits";

export async function getAllCategories(): Promise<string[]> {
  const stored = await getJsonSetting<string[] | null>(CAT_KEY, null);
  if (stored !== null) return stored;
  return [...PHARMA_CATEGORIES];
}

export async function saveAllCategories(cats: string[]): Promise<void> {
  await setJsonSetting(CAT_KEY, cats);
}

export async function resetCategories(): Promise<void> {
  await db.settings.delete(CAT_KEY);
}

export async function getAllUnits(): Promise<string[]> {
  const stored = await getJsonSetting<string[] | null>(UNIT_KEY, null);
  if (stored !== null) return stored;
  return [...PHARMA_UNITS];
}

export async function saveAllUnits(units: string[]): Promise<void> {
  await setJsonSetting(UNIT_KEY, units);
}

export async function resetUnits(): Promise<void> {
  await db.settings.delete(UNIT_KEY);
}
