-- ================================================================
--  AUC Clinic Inventory System — Supabase Setup Script
--  Run this ONCE in a brand-new Supabase project via SQL Editor.
--  Paste the whole file and click "Run".
-- ================================================================

-- ──────────────────────────────────────────────────────────────
-- 1.  TABLES
-- ──────────────────────────────────────────────────────────────

-- Users (linked 1-to-1 with auth.users; id = auth.users.id)
CREATE TABLE IF NOT EXISTS public.users (
  id              uuid        PRIMARY KEY,          -- must equal auth.users.id
  username        text        NOT NULL UNIQUE,
  "fullName"      text        NOT NULL DEFAULT '',
  "passwordHash"  text        NOT NULL DEFAULT '',  -- unused in Supabase-auth mode
  email           text        UNIQUE,
  role            text        NOT NULL DEFAULT 'staff'
                              CHECK (role IN ('administrator','admin','staff')),
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now()
);

-- Products
CREATE TABLE IF NOT EXISTS public.products (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "productCode"   text        NOT NULL UNIQUE,
  "productName"   text        NOT NULL,
  barcode         text,
  category        text,
  manufacturer    text,
  "baseUnit"      text        NOT NULL DEFAULT 'unit',
  "reorderLevel"  integer     NOT NULL DEFAULT 0,
  notes           text,
  "createdBy"     uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now()
);

-- Product units (e.g. box = 12 tablets)
CREATE TABLE IF NOT EXISTS public.product_units (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "productId"     uuid        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  "unitName"      text        NOT NULL,
  "factorToBase"  numeric     NOT NULL DEFAULT 1,
  "isBase"        boolean     NOT NULL DEFAULT false,
  barcode         text,
  "sortOrder"     integer     NOT NULL DEFAULT 0,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now()
);

-- Warehouses / storage locations
CREATE TABLE IF NOT EXISTS public.warehouses (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "warehouseCode"   text        NOT NULL UNIQUE,
  "warehouseName"   text        NOT NULL,
  description       text,
  "isActive"        boolean     NOT NULL DEFAULT true,
  "createdBy"       uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedAt"       timestamptz NOT NULL DEFAULT now()
);

-- Warehouse sections / shelves
CREATE TABLE IF NOT EXISTS public.warehouse_sections (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "warehouseId"   uuid        NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  "sectionName"   text        NOT NULL,
  description     text,
  "isActive"      boolean     NOT NULL DEFAULT true,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now()
);

-- Inventory batches (stock parcels with optional expiry dates)
CREATE TABLE IF NOT EXISTS public.inventory_batches (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "productId"         uuid        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  "warehouseId"       uuid        NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  "sectionId"         uuid        REFERENCES public.warehouse_sections(id) ON DELETE SET NULL,
  "batchNumber"       text,
  "expiryDate"        date,
  "quantityBaseUnit"  numeric     NOT NULL DEFAULT 0,
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedAt"         timestamptz NOT NULL DEFAULT now()
);

-- Inventory transactions (every stock movement is recorded here)
CREATE TABLE IF NOT EXISTS public.inventory_transactions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "transactionType"   text        NOT NULL
                      CHECK ("transactionType" IN (
                        'stock_in','dispensing','transfer_in','transfer_out',
                        'disposal','adjustment','inventory_count')),
  "productId"         uuid        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  "batchId"           uuid        NOT NULL REFERENCES public.inventory_batches(id) ON DELETE CASCADE,
  "warehouseId"       uuid        NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  "sectionId"         uuid        REFERENCES public.warehouse_sections(id) ON DELETE SET NULL,
  quantity            numeric     NOT NULL,
  "unitId"            uuid        NOT NULL REFERENCES public.product_units(id) ON DELETE CASCADE,
  "quantityBaseUnit"  numeric     NOT NULL,
  "performedBy"       uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  notes               text,
  "createdAt"         timestamptz NOT NULL DEFAULT now()
);

-- Audit log (append-only)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  action        text        NOT NULL,
  "tableName"   text        NOT NULL,
  "recordId"    text        NOT NULL,
  "userId"      uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  changes       text        NOT NULL DEFAULT '{}',
  "createdAt"   timestamptz NOT NULL DEFAULT now()
);

-- App settings (key-value store)
CREATE TABLE IF NOT EXISTS public.settings (
  key   text  PRIMARY KEY,
  value text  NOT NULL DEFAULT ''
);

-- ──────────────────────────────────────────────────────────────
-- 2.  INDEXES  (speeds up common queries)
-- ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_users_username         ON public.users (username);
CREATE INDEX IF NOT EXISTS idx_users_email            ON public.users (email);
CREATE INDEX IF NOT EXISTS idx_products_name          ON public.products ("productName");
CREATE INDEX IF NOT EXISTS idx_products_code          ON public.products ("productCode");
CREATE INDEX IF NOT EXISTS idx_prod_units_product     ON public.product_units ("productId");
CREATE INDEX IF NOT EXISTS idx_wh_sections_warehouse  ON public.warehouse_sections ("warehouseId");
CREATE INDEX IF NOT EXISTS idx_inv_batches_product    ON public.inventory_batches ("productId");
CREATE INDEX IF NOT EXISTS idx_inv_batches_warehouse  ON public.inventory_batches ("warehouseId");
CREATE INDEX IF NOT EXISTS idx_inv_batches_expiry     ON public.inventory_batches ("expiryDate");
CREATE INDEX IF NOT EXISTS idx_inv_txns_product       ON public.inventory_transactions ("productId");
CREATE INDEX IF NOT EXISTS idx_inv_txns_warehouse     ON public.inventory_transactions ("warehouseId");
CREATE INDEX IF NOT EXISTS idx_inv_txns_batch         ON public.inventory_transactions ("batchId");
CREATE INDEX IF NOT EXISTS idx_inv_txns_created       ON public.inventory_transactions ("createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_audit_table            ON public.audit_logs ("tableName");
CREATE INDEX IF NOT EXISTS idx_audit_user             ON public.audit_logs ("userId");
CREATE INDEX IF NOT EXISTS idx_audit_created          ON public.audit_logs ("createdAt" DESC);

-- ──────────────────────────────────────────────────────────────
-- 3.  HELPER FUNCTIONS  (SECURITY DEFINER = bypass RLS safely)
-- ──────────────────────────────────────────────────────────────

-- Returns the current signed-in user's role (used by RLS policies)
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.users WHERE id = auth.uid() LIMIT 1;
$$;

-- Resolves a username → email for the login form.
-- Called BEFORE the user is authenticated, so it must bypass RLS.
-- Only returns the email; no other data is exposed.
CREATE OR REPLACE FUNCTION public.get_user_email_by_username(p_username text)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT email FROM public.users
  WHERE lower(username) = lower(p_username)
  LIMIT 1;
$$;

-- ──────────────────────────────────────────────────────────────
-- 4.  ROW LEVEL SECURITY
-- ──────────────────────────────────────────────────────────────

ALTER TABLE public.users                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_units          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_sections     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_batches      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings               ENABLE ROW LEVEL SECURITY;

-- ── users table ──────────────────────────────────────────────
-- Any authenticated user can read the users table (needed for
-- displaying user lists and for looking up their own profile).
CREATE POLICY "users_select_authenticated"
  ON public.users FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Only administrator role can insert / update / delete user rows.
-- (The api-server uses the service_role key which bypasses RLS,
--  so inviting users always works regardless of this policy.)
CREATE POLICY "users_write_administrator"
  ON public.users FOR ALL
  USING  (public.current_user_role() = 'administrator')
  WITH CHECK (public.current_user_role() = 'administrator');

-- ── products ─────────────────────────────────────────────────
CREATE POLICY "products_select_authenticated"
  ON public.products FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "products_write_admin"
  ON public.products FOR ALL
  USING  (public.current_user_role() IN ('administrator','admin'))
  WITH CHECK (public.current_user_role() IN ('administrator','admin'));

-- ── product_units ─────────────────────────────────────────────
CREATE POLICY "product_units_select_authenticated"
  ON public.product_units FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "product_units_write_admin"
  ON public.product_units FOR ALL
  USING  (public.current_user_role() IN ('administrator','admin'))
  WITH CHECK (public.current_user_role() IN ('administrator','admin'));

-- ── warehouses ────────────────────────────────────────────────
CREATE POLICY "warehouses_select_authenticated"
  ON public.warehouses FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "warehouses_write_admin"
  ON public.warehouses FOR ALL
  USING  (public.current_user_role() IN ('administrator','admin'))
  WITH CHECK (public.current_user_role() IN ('administrator','admin'));

-- ── warehouse_sections ────────────────────────────────────────
CREATE POLICY "wh_sections_select_authenticated"
  ON public.warehouse_sections FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "wh_sections_write_admin"
  ON public.warehouse_sections FOR ALL
  USING  (public.current_user_role() IN ('administrator','admin'))
  WITH CHECK (public.current_user_role() IN ('administrator','admin'));

-- ── inventory_batches ─────────────────────────────────────────
-- All authenticated users can read and modify batches
-- (staff need write access to dispense / record transfers).
CREATE POLICY "inv_batches_all_authenticated"
  ON public.inventory_batches FOR ALL
  USING  (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ── inventory_transactions ────────────────────────────────────
-- All authenticated users can read and insert transactions.
-- No one can update or delete a recorded transaction (audit trail).
CREATE POLICY "inv_txns_select_authenticated"
  ON public.inventory_transactions FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "inv_txns_insert_authenticated"
  ON public.inventory_transactions FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ── audit_logs ────────────────────────────────────────────────
-- Admin and above can read audit logs; anyone authenticated can insert.
CREATE POLICY "audit_select_admin"
  ON public.audit_logs FOR SELECT
  USING (public.current_user_role() IN ('administrator','admin'));

CREATE POLICY "audit_insert_authenticated"
  ON public.audit_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ── settings ─────────────────────────────────────────────────
CREATE POLICY "settings_select_authenticated"
  ON public.settings FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "settings_write_admin"
  ON public.settings FOR ALL
  USING  (public.current_user_role() IN ('administrator','admin'))
  WITH CHECK (public.current_user_role() IN ('administrator','admin'));

-- ──────────────────────────────────────────────────────────────
-- 5.  FIRST ADMINISTRATOR
--     After running this script, go to:
--     Supabase → Authentication → Users → "Add user" → "Create new user"
--     Enter the admin email + a temporary password.
--     Copy the UUID shown, then run the INSERT below.
-- ──────────────────────────────────────────────────────────────

-- REPLACE the values below with your real data, then run this block:
/*
INSERT INTO public.users (id, username, "fullName", email, "passwordHash", role, "createdAt", "updatedAt")
VALUES (
  'PASTE-AUTH-USER-UUID-HERE',     -- UUID from Authentication > Users
  'admin',                          -- username (lowercase, no spaces)
  'Administrator',                  -- display name
  'your-admin@example.com',         -- must match the email in auth.users
  '',                               -- leave empty (Supabase Auth manages passwords)
  'administrator',
  now(),
  now()
);
*/

-- ──────────────────────────────────────────────────────────────
-- DONE. Verify with:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' ORDER BY table_name;
-- ──────────────────────────────────────────────────────────────
