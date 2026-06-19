/**
 * Supabase adapter that exposes the same API surface as Dexie tables.
 * Allows the rest of the codebase to work with Supabase without any changes
 * to products.ts, inventory.ts, warehouses.ts, etc.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

type FilterFn<T> = (record: T) => boolean;

interface CollectionState<T> {
  filters: FilterFn<T>[];
  reversed: boolean;
  limitN?: number;
  orderField?: string;
  whereField?: string;
  whereValue?: unknown;
}

export class SupabaseCollection<T> {
  private state: CollectionState<T>;
  public _table: SupabaseTableAdapter<T>;

  constructor(table: SupabaseTableAdapter<T>, seed?: Partial<CollectionState<T>>) {
    this._table = table;
    this.state = {
      filters: seed?.filters ? [...seed.filters] : [],
      reversed: seed?.reversed ?? false,
      limitN: seed?.limitN,
      orderField: seed?.orderField,
      whereField: seed?.whereField,
      whereValue: seed?.whereValue,
    };
  }

  private clone(patch: Partial<CollectionState<T>> = {}): SupabaseCollection<T> {
    return new SupabaseCollection<T>(this._table, { ...this.state, ...patch });
  }

  filter(fn: FilterFn<T>): SupabaseCollection<T> {
    return this.clone({ filters: [...this.state.filters, fn] });
  }

  reverse(): SupabaseCollection<T> {
    return this.clone({ reversed: !this.state.reversed });
  }

  limit(n: number): SupabaseCollection<T> {
    return this.clone({ limitN: n });
  }

  withOrder(field: string): SupabaseCollection<T> {
    return this.clone({ orderField: field });
  }

  withWhere(field: string, value: unknown): SupabaseCollection<T> {
    return this.clone({ whereField: field, whereValue: value });
  }

  private async resolve(): Promise<T[]> {
    const client = this._table._client;
    const tableName = this._table._tableName;

    let query: ReturnType<typeof client.from> = client.from(tableName).select("*") as any;

    if (this.state.whereField !== undefined && this.state.whereValue !== undefined) {
      query = (query as any).eq(this.state.whereField, this.state.whereValue);
    }

    if (this.state.orderField) {
      query = (query as any).order(this.state.orderField, {
        ascending: !this.state.reversed,
      });
    }

    const { data, error } = await (query as any);
    if (error) {
      throw new Error(`Supabase query error on ${tableName}: ${error.message}`);
    }

    let results: T[] = (data as T[]) ?? [];

    for (const fn of this.state.filters) {
      results = results.filter(fn);
    }

    if (!this.state.orderField && this.state.reversed) {
      results = results.reverse();
    }

    if (this.state.limitN !== undefined) {
      results = results.slice(0, this.state.limitN);
    }

    return results;
  }

  async toArray(): Promise<T[]> {
    return this.resolve();
  }

  async count(): Promise<number> {
    return (await this.resolve()).length;
  }

  async first(): Promise<T | undefined> {
    const results = await this.resolve();
    return results[0];
  }

  async delete(): Promise<void> {
    const records = await this.resolve();
    const ids = records.map((r) => (r as any)[this._table._pkField]);
    if (ids.length === 0) return;
    const { error } = await this._table._client
      .from(this._table._tableName)
      .delete()
      .in(this._table._pkField, ids);
    if (error) throw new Error(`Supabase delete error: ${error.message}`);
  }

  async sortBy(field: string): Promise<T[]> {
    const results = await this.resolve();
    return [...results].sort((a, b) => {
      const av = (a as any)[field];
      const bv = (b as any)[field];
      if (av === undefined || av === null) return 1;
      if (bv === undefined || bv === null) return -1;
      if (av < bv) return -1;
      if (av > bv) return 1;
      return 0;
    });
  }
}

export class SupabaseWhereClause<T> {
  constructor(
    private _col: SupabaseCollection<T>,
    private _field: string
  ) {}

  equals(value: unknown): SupabaseCollection<T> {
    return this._col.withWhere(this._field, value);
  }
}

export class SupabaseTableAdapter<T> {
  public _client: SupabaseClient;
  public _tableName: string;
  public _pkField: string;

  constructor(client: SupabaseClient, tableName: string, pkField = "id") {
    this._client = client;
    this._tableName = tableName;
    this._pkField = pkField;
  }

  async get(id: string): Promise<T | undefined> {
    const { data, error } = await this._client
      .from(this._tableName)
      .select("*")
      .eq(this._pkField, id)
      .maybeSingle();
    if (error) {
      throw new Error(`Supabase get error on ${this._tableName}: ${error.message}`);
    }
    return (data as T) ?? undefined;
  }

  async add(record: T): Promise<void> {
    const { error } = await this._client.from(this._tableName).insert(record as any);
    if (error) {
      throw new Error(`Supabase insert error on ${this._tableName}: ${error.message}`);
    }
  }

  async put(record: T): Promise<void> {
    const { error } = await this._client.from(this._tableName).upsert(record as any);
    if (error) {
      throw new Error(`Supabase upsert error on ${this._tableName}: ${error.message}`);
    }
  }

  async bulkPut(records: T[]): Promise<void> {
    if (records.length === 0) return;
    const { error } = await this._client.from(this._tableName).upsert(records as any[]);
    if (error) {
      throw new Error(
        `Supabase bulk upsert error on ${this._tableName}: ${error.message}`
      );
    }
  }

  async update(id: string, changes: Partial<T>): Promise<void> {
    const { error } = await this._client
      .from(this._tableName)
      .update(changes as any)
      .eq(this._pkField, id);
    if (error) {
      throw new Error(`Supabase update error on ${this._tableName}: ${error.message}`);
    }
  }

  async delete(id: string): Promise<void> {
    const { error } = await this._client
      .from(this._tableName)
      .delete()
      .eq(this._pkField, id);
    if (error) {
      throw new Error(`Supabase delete error on ${this._tableName}: ${error.message}`);
    }
  }

  async count(): Promise<number> {
    const { count, error } = await this._client
      .from(this._tableName)
      .select("*", { count: "exact", head: true });
    if (error) {
      throw new Error(`Supabase count error on ${this._tableName}: ${error.message}`);
    }
    return count ?? 0;
  }

  async toArray(): Promise<T[]> {
    const { data, error } = await this._client.from(this._tableName).select("*");
    if (error) {
      throw new Error(
        `Supabase toArray error on ${this._tableName}: ${error.message}`
      );
    }
    return (data as T[]) ?? [];
  }

  filter(fn: FilterFn<T>): SupabaseCollection<T> {
    return new SupabaseCollection<T>(this).filter(fn);
  }

  where(field: string): SupabaseWhereClause<T> {
    return new SupabaseWhereClause<T>(new SupabaseCollection<T>(this), field);
  }

  orderBy(field: string): SupabaseCollection<T> {
    return new SupabaseCollection<T>(this).withOrder(field);
  }

  async sortBy(field: string): Promise<T[]> {
    const { data, error } = await this._client
      .from(this._tableName)
      .select("*")
      .order(field);
    if (error) {
      throw new Error(`Supabase sortBy error on ${this._tableName}: ${error.message}`);
    }
    return (data as T[]) ?? [];
  }

  async clear(): Promise<void> {
    const { data, error: selErr } = await this._client
      .from(this._tableName)
      .select(this._pkField);
    if (selErr) throw new Error(`Supabase clear (select) error: ${selErr.message}`);
    const ids = ((data as any[]) ?? []).map((r) => r[this._pkField]);
    if (ids.length === 0) return;
    const { error } = await this._client
      .from(this._tableName)
      .delete()
      .in(this._pkField, ids);
    if (error) throw new Error(`Supabase clear error on ${this._tableName}: ${error.message}`);
  }
}
