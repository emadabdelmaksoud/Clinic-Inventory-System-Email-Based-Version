# AUC Clinic Inventory — Supabase & Vercel Setup Guide

A step-by-step guide to connect the app to Supabase (cloud database) and deploy it to Vercel.

---

## Overview

| Mode | Data Storage | Internet needed? |
|------|-------------|-----------------|
| **Local mode** (default) | Browser IndexedDB (Dexie) | No |
| **Cloud mode** (Supabase) | Supabase PostgreSQL | Yes |

The app automatically switches to cloud mode when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set.

---

## Part 1 — Supabase Setup

### Step 1 — Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and sign in (or create a free account).
2. Click **"New project"**.
3. Choose an **organization**, enter a **project name** (e.g. `auc-clinic-inventory`), set a **database password** (save it!), and select a **region** close to your users.
4. Click **"Create new project"** and wait ~2 minutes for provisioning.

---

### Step 2 — Run the SQL Schema

1. In your Supabase project dashboard, go to **SQL Editor** (left sidebar).
2. Click **"New query"**.
3. Paste the entire SQL block below and click **"Run"**.

```sql
-- ============================================================
-- AUC Clinic Inventory — Supabase Schema
-- Run this once in your Supabase SQL Editor
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ── Users ────────────────────────────────────────────────────
create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  username      text not null unique,
  "fullName"    text not null,
  "passwordHash" text not null,
  role          text not null check (role in ('admin', 'staff')),
  "createdAt"   text not null,
  "updatedAt"   text not null
);

-- ── Products ─────────────────────────────────────────────────
create table if not exists products (
  id            uuid primary key default gen_random_uuid(),
  "productCode" text not null,
  "productName" text not null,
  barcode       text,
  category      text,
  manufacturer  text,
  "baseUnit"    text not null default 'unit',
  "reorderLevel" integer not null default 0,
  notes         text,
  "createdBy"   uuid references users(id) on delete set null,
  "createdAt"   text not null,
  "updatedAt"   text not null
);
create index if not exists idx_products_code on products ("productCode");
create index if not exists idx_products_name on products ("productName");
create index if not exists idx_products_barcode on products (barcode);
create index if not exists idx_products_category on products (category);

-- ── Product Units ────────────────────────────────────────────
create table if not exists product_units (
  id              uuid primary key default gen_random_uuid(),
  "productId"     uuid not null references products(id) on delete cascade,
  "unitName"      text not null,
  "factorToBase"  numeric not null default 1,
  "isBase"        boolean not null default false,
  barcode         text,
  "sortOrder"     integer not null default 0,
  "createdAt"     text not null,
  "updatedAt"     text not null
);
create index if not exists idx_product_units_product on product_units ("productId");
create index if not exists idx_product_units_barcode on product_units (barcode);

-- ── Warehouses ───────────────────────────────────────────────
create table if not exists warehouses (
  id               uuid primary key default gen_random_uuid(),
  "warehouseCode"  text not null,
  "warehouseName"  text not null,
  description      text,
  "isActive"       boolean not null default true,
  "createdBy"      uuid references users(id) on delete set null,
  "createdAt"      text not null,
  "updatedAt"      text not null
);
create index if not exists idx_warehouses_code on warehouses ("warehouseCode");
create index if not exists idx_warehouses_active on warehouses ("isActive");

-- ── Warehouse Sections ───────────────────────────────────────
create table if not exists warehouse_sections (
  id              uuid primary key default gen_random_uuid(),
  "warehouseId"   uuid not null references warehouses(id) on delete cascade,
  "sectionName"   text not null,
  description     text,
  "isActive"      boolean not null default true,
  "createdAt"     text not null,
  "updatedAt"     text not null
);
create index if not exists idx_sections_warehouse on warehouse_sections ("warehouseId");

-- ── Inventory Batches ────────────────────────────────────────
create table if not exists inventory_batches (
  id                  uuid primary key default gen_random_uuid(),
  "productId"         uuid not null references products(id) on delete cascade,
  "warehouseId"       uuid not null references warehouses(id) on delete cascade,
  "sectionId"         uuid references warehouse_sections(id) on delete set null,
  "batchNumber"       text,
  "expiryDate"        text,
  "quantityBaseUnit"  numeric not null default 0,
  "createdAt"         text not null,
  "updatedAt"         text not null
);
create index if not exists idx_batches_product on inventory_batches ("productId");
create index if not exists idx_batches_warehouse on inventory_batches ("warehouseId");
create index if not exists idx_batches_expiry on inventory_batches ("expiryDate");

-- ── Inventory Transactions ───────────────────────────────────
create table if not exists inventory_transactions (
  id                  uuid primary key default gen_random_uuid(),
  "transactionType"   text not null check ("transactionType" in (
    'stock_in','dispensing','transfer_in','transfer_out',
    'disposal','adjustment','inventory_count'
  )),
  "productId"         uuid not null references products(id) on delete cascade,
  "batchId"           uuid not null references inventory_batches(id) on delete cascade,
  "warehouseId"       uuid not null references warehouses(id) on delete cascade,
  "sectionId"         uuid references warehouse_sections(id) on delete set null,
  quantity            numeric not null,
  "unitId"            uuid not null references product_units(id) on delete cascade,
  "quantityBaseUnit"  numeric not null,
  "performedBy"       uuid references users(id) on delete set null,
  notes               text,
  "createdAt"         text not null
);
create index if not exists idx_txn_product on inventory_transactions ("productId");
create index if not exists idx_txn_warehouse on inventory_transactions ("warehouseId");
create index if not exists idx_txn_type on inventory_transactions ("transactionType");
create index if not exists idx_txn_created on inventory_transactions ("createdAt");

-- ── Audit Logs ───────────────────────────────────────────────
create table if not exists audit_logs (
  id          uuid primary key default gen_random_uuid(),
  action      text not null,
  "tableName" text not null,
  "recordId"  text not null,
  "userId"    uuid references users(id) on delete set null,
  changes     text not null default '{}',
  "createdAt" text not null
);
create index if not exists idx_audit_table on audit_logs ("tableName");
create index if not exists idx_audit_user on audit_logs ("userId");
create index if not exists idx_audit_created on audit_logs ("createdAt");

-- ── App Settings ─────────────────────────────────────────────
create table if not exists settings (
  key   text primary key,
  value text not null
);

-- ── Row Level Security (RLS) ─────────────────────────────────
-- The app manages auth itself (username/password in the users table).
-- We use the anon key for all queries, so we open up RLS policies.
-- If you later add Supabase Auth, tighten these policies.

alter table users               enable row level security;
alter table products            enable row level security;
alter table product_units       enable row level security;
alter table warehouses          enable row level security;
alter table warehouse_sections  enable row level security;
alter table inventory_batches   enable row level security;
alter table inventory_transactions enable row level security;
alter table audit_logs          enable row level security;
alter table settings            enable row level security;

-- Allow all operations for the anon role (app manages its own auth)
create policy "anon_all" on users               for all to anon using (true) with check (true);
create policy "anon_all" on products            for all to anon using (true) with check (true);
create policy "anon_all" on product_units       for all to anon using (true) with check (true);
create policy "anon_all" on warehouses          for all to anon using (true) with check (true);
create policy "anon_all" on warehouse_sections  for all to anon using (true) with check (true);
create policy "anon_all" on inventory_batches   for all to anon using (true) with check (true);
create policy "anon_all" on inventory_transactions for all to anon using (true) with check (true);
create policy "anon_all" on audit_logs          for all to anon using (true) with check (true);
create policy "anon_all" on settings            for all to anon using (true) with check (true);
```

4. You should see **"Success. No rows returned"** — all tables created.

---

### Step 3 — Get Your Supabase Keys

1. In your Supabase project, go to **Settings → API** (left sidebar → gear icon → API).
2. Copy:
   - **Project URL** → this is your `VITE_SUPABASE_URL`
     (looks like `https://abcdefghijkl.supabase.co`)
   - **anon public** key → this is your `VITE_SUPABASE_ANON_KEY`
     (a long JWT token starting with `eyJ…`)

> ⚠️ **Never use the `service_role` key in the frontend**. Only use the `anon` (public) key.

---

### Step 4 — Migrate Existing Data (Optional)

If you have existing data in the local (Dexie) version:

1. Open the running app in your browser.
2. Go to **Backups → Export Backup** — this downloads a JSON file.
3. After deploying the Supabase-connected version, go to **Import/Export → Import Backup** and upload that JSON file to populate Supabase.

---

## Part 2 — Vercel Deployment

### Step 1 — Create a Vercel Account

1. Go to [https://vercel.com](https://vercel.com) and sign in (or create a free account).
2. Connect your **GitHub** account when prompted.

---

### Step 2 — Import the GitHub Repository

1. From the Vercel dashboard, click **"Add New… → Project"**.
2. Find and select your GitHub repo: `AUC-Clinic-Inventory-V5` (or wherever you push this code).
3. Click **"Import"**.

---

### Step 3 — Configure the Build Settings

Vercel should auto-detect the settings from `vercel.json`, but verify:

| Setting | Value |
|---------|-------|
| **Framework Preset** | Other |
| **Build Command** | `pnpm --filter @workspace/store-control run build` |
| **Output Directory** | `artifacts/store-control/dist/public` |
| **Install Command** | `pnpm install` |

---

### Step 4 — Add Environment Variables

In the Vercel project settings (before or during the first deploy):

1. Click **"Environment Variables"** tab.
2. Add these two variables:

| Name | Value |
|------|-------|
| `VITE_SUPABASE_URL` | `https://YOUR_PROJECT_REF.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `eyJ…` (your anon key from Step 3 above) |

3. Set scope to **Production**, **Preview**, and **Development** (all three).
4. Click **"Save"**.

---

### Step 5 — Deploy

1. Click **"Deploy"**.
2. Vercel will install dependencies, run the build, and publish.
3. Once complete, you'll get a URL like `https://your-app.vercel.app`.
4. Open the URL, log in with `admin` / `admin123` (change the password immediately!).

---

### Step 6 — Verify the Connection

After logging in:
- Go to **Dashboard** → you should see zeros (empty database).
- Go to **Warehouses → Add Warehouse** → save it.
- Reload the page → the warehouse should still be there (data is in Supabase, not just the browser).

---

## Part 3 — Local Development with Supabase

To test Supabase locally before deploying:

1. In the project root, copy `.env.example` to `.env.local`:
   ```bash
   cp artifacts/store-control/.env.example artifacts/store-control/.env.local
   ```

2. Open `artifacts/store-control/.env.local` and fill in your keys:
   ```
   VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```

3. Restart the dev server — the app will now use Supabase.

> Without `.env.local`, the app runs in **local-only mode** (Dexie/IndexedDB) — perfect for offline/development use.

---

## Part 4 — Security Recommendations

After your first login, **do this immediately**:

1. Go to **Users** → click on `admin` → **Change Password** → set a strong password.
2. Consider adding additional admin/staff users with appropriate roles.

For production hardening (optional, advanced):
- Switch to Supabase Auth for proper multi-user session management.
- Tighten the RLS policies to require authenticated sessions.
- Enable 2FA on your Supabase account.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Build fails with `cannot find module 'vite-plugin-pwa'` | Run `pnpm install` in the project root |
| Supabase queries return 401 Unauthorized | Check that RLS policies were applied (Step 2 SQL) |
| Data not persisting after page reload | Confirm both `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set |
| Vercel build fails | Check that `pnpm-lock.yaml` is committed to your repo |
| App shows blank page on Vercel | Check that rewrites are in `vercel.json` (already included) |
| `password_hash` column error | Use `"passwordHash"` (camelCase) — the SQL schema uses quoted identifiers |

---

## Quick Reference

```
Supabase dashboard:  https://supabase.com/dashboard
Vercel dashboard:    https://vercel.com/dashboard
Default login:       admin / admin123
App tables:          users, products, product_units, warehouses,
                     warehouse_sections, inventory_batches,
                     inventory_transactions, audit_logs, settings
```
