-- ================================================================
--  AUC Clinic Inventory System — Complete Supabase Setup Script
--  For a BRAND-NEW Supabase project.
--  Paste the whole file into SQL Editor and click "Run".
-- ================================================================

-- ──────────────────────────────────────────────────────────────
-- 1.  TABLES
-- ──────────────────────────────────────────────────────────────

-- Users (id = auth.users.id — linked 1-to-1)
CREATE TABLE IF NOT EXISTS public.users (
  id              uuid        PRIMARY KEY,
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

-- Warehouses
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

-- Inventory batches (physical stock lots)
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

-- Inventory transactions (append-only ledger)
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

-- App settings (key-value)
CREATE TABLE IF NOT EXISTS public.settings (
  key   text  PRIMARY KEY,
  value text  NOT NULL DEFAULT ''
);

-- ──────────────────────────────────────────────────────────────
-- 2.  INDEXES
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

-- Returns the current signed-in user's role (used inside RLS policies).
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.users WHERE id = auth.uid() LIMIT 1;
$$;

-- Resolves a username → email for pre-auth login.
-- Called before sign-in so must work without a session.
CREATE OR REPLACE FUNCTION public.get_user_email_by_username(p_username text)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT email FROM public.users
  WHERE lower(username) = lower(p_username)
  LIMIT 1;
$$;

-- ──────────────────────────────────────────────────────────────
-- 4.  AUTO-SYNC TRIGGER: auth.users → public.users
--
--     Fires whenever a new Supabase Auth user is created
--     (via dashboard, invite link, or API).
--     Uses raw_user_meta_data set by the api-server invite endpoint.
--     ON CONFLICT DO NOTHING: if the api-server already inserted the
--     profile, this is a harmless no-op.
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_username  text;
  v_full_name text;
  v_role      text;
  v_counter   int := 0;
  v_base      text;
BEGIN
  v_username  := COALESCE(
    NEW.raw_user_meta_data->>'username',
    lower(split_part(NEW.email, '@', 1))
  );
  v_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1)
  );
  v_role      := COALESCE(NEW.raw_user_meta_data->>'role', 'staff');

  -- Enforce valid role values
  IF v_role NOT IN ('administrator', 'admin', 'staff') THEN
    v_role := 'staff';
  END IF;

  -- Sanitize username (lowercase, no spaces)
  v_username := lower(regexp_replace(v_username, '[^a-z0-9._-]', '', 'g'));
  IF v_username = '' THEN
    v_username := 'user';
  END IF;

  -- Ensure username is unique (append suffix if needed)
  v_base := v_username;
  WHILE EXISTS (SELECT 1 FROM public.users WHERE username = v_username) LOOP
    v_counter := v_counter + 1;
    v_username := v_base || v_counter::text;
  END LOOP;

  INSERT INTO public.users (
    id, username, "fullName", email, "passwordHash", role, "createdAt", "updatedAt"
  )
  VALUES (
    NEW.id, v_username, v_full_name, NEW.email, '', v_role, NOW(), NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Attach the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ──────────────────────────────────────────────────────────────
-- 5.  ROW LEVEL SECURITY
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

-- ── users ──────────────────────────────────────────────────────
-- Any authenticated user can read (needed for profile load + user list)
CREATE POLICY "users_select_authenticated"
  ON public.users FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Only administrator can modify users via the app.
-- NOTE: the api-server uses the service_role key which bypasses RLS entirely,
-- so invite/create/delete always works regardless of this policy.
CREATE POLICY "users_write_administrator"
  ON public.users FOR ALL
  USING  (public.current_user_role() = 'administrator')
  WITH CHECK (public.current_user_role() = 'administrator');

-- ── products ───────────────────────────────────────────────────
CREATE POLICY "products_select_authenticated"
  ON public.products FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "products_write_admin"
  ON public.products FOR ALL
  USING  (public.current_user_role() IN ('administrator','admin'))
  WITH CHECK (public.current_user_role() IN ('administrator','admin'));

-- ── product_units ──────────────────────────────────────────────
CREATE POLICY "prod_units_select_authenticated"
  ON public.product_units FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "prod_units_write_admin"
  ON public.product_units FOR ALL
  USING  (public.current_user_role() IN ('administrator','admin'))
  WITH CHECK (public.current_user_role() IN ('administrator','admin'));

-- ── warehouses ─────────────────────────────────────────────────
CREATE POLICY "warehouses_select_authenticated"
  ON public.warehouses FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "warehouses_write_admin"
  ON public.warehouses FOR ALL
  USING  (public.current_user_role() IN ('administrator','admin'))
  WITH CHECK (public.current_user_role() IN ('administrator','admin'));

-- ── warehouse_sections ─────────────────────────────────────────
CREATE POLICY "wh_sections_select_authenticated"
  ON public.warehouse_sections FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "wh_sections_write_admin"
  ON public.warehouse_sections FOR ALL
  USING  (public.current_user_role() IN ('administrator','admin'))
  WITH CHECK (public.current_user_role() IN ('administrator','admin'));

-- ── inventory_batches ──────────────────────────────────────────
-- All authenticated users (including staff) can read and write batches.
-- Staff needs write access to record dispensing and transfers.
CREATE POLICY "inv_batches_all_authenticated"
  ON public.inventory_batches FOR ALL
  USING  (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ── inventory_transactions ─────────────────────────────────────
-- Read: all authenticated. Write (INSERT only): all authenticated.
-- UPDATE/DELETE are intentionally blocked — the ledger is append-only.
CREATE POLICY "inv_txns_select_authenticated"
  ON public.inventory_transactions FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "inv_txns_insert_authenticated"
  ON public.inventory_transactions FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ── audit_logs ─────────────────────────────────────────────────
-- Read: admin and above. Insert: any authenticated user.
-- UPDATE/DELETE are intentionally blocked — the log is append-only.
CREATE POLICY "audit_select_admin"
  ON public.audit_logs FOR SELECT
  USING (public.current_user_role() IN ('administrator','admin'));

CREATE POLICY "audit_insert_authenticated"
  ON public.audit_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ── settings ───────────────────────────────────────────────────
CREATE POLICY "settings_select_authenticated"
  ON public.settings FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "settings_write_admin"
  ON public.settings FOR ALL
  USING  (public.current_user_role() IN ('administrator','admin'))
  WITH CHECK (public.current_user_role() IN ('administrator','admin'));

-- ──────────────────────────────────────────────────────────────
-- 6.  FIRST ADMINISTRATOR
--
--     After running this script:
--     a) Go to Authentication > Users > "Add user" > "Create new user"
--     b) Enter your admin email + a temporary password
--     c) Copy the UUID shown
--     d) Run the INSERT below (replace placeholder values)
--
-- ──────────────────────────────────────────────────────────────

/*
INSERT INTO public.users (id, username, "fullName", email, "passwordHash", role, "createdAt", "updatedAt")
VALUES (
  'PASTE-UUID-FROM-SUPABASE-AUTH-USERS',
  'admin',
  'Administrator',
  'your-admin@yourdomain.com',
  '',
  'administrator',
  now(),
  now()
);
*/

-- ──────────────────────────────────────────────────────────────
-- 7.  SUPABASE DASHBOARD SETTINGS  (manual steps)
--
--  Authentication > Settings:
--   • Site URL          → https://your-app-domain.com
--   • Redirect URLs     → https://your-app-domain.com/  (trailing slash)
--   • Disable signup    → ON  (only admins create users via the app)
--
--  No SMTP required — the app generates invite links that you copy/share.
--  If you add SMTP later, users will also receive automated emails.
-- ──────────────────────────────────────────────────────────────

-- ── Verification ──────────────────────────────────────────────
-- Run these to confirm everything is in place:
--
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' ORDER BY table_name;
--
--   SELECT trigger_name FROM information_schema.triggers
--   WHERE event_object_schema = 'auth'
--   AND event_object_table = 'users';
--
-- Expected tables: audit_logs, inventory_batches, inventory_transactions,
--   product_units, products, settings, users, warehouse_sections, warehouses
-- Expected trigger: on_auth_user_created
-- ──────────────────────────────────────────────────────────────
