-- ================================================================
--  AUC Clinic Inventory System — Migration Script
--  For EXISTING Supabase projects that already have the base schema.
--  Run this in SQL Editor. It is safe to re-run (idempotent).
-- ================================================================

-- ──────────────────────────────────────────────────────────────
-- 1.  Add email column if missing
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email text;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key
  ON public.users (email) WHERE email IS NOT NULL;

-- ──────────────────────────────────────────────────────────────
-- 2.  Tighten role values (drop old constraint if any, add new)
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('administrator', 'admin', 'staff'));

-- Fix any invalid role values that may exist
UPDATE public.users
SET role = 'staff'
WHERE role NOT IN ('administrator', 'admin', 'staff');

-- ──────────────────────────────────────────────────────────────
-- 3.  Helper functions (idempotent via CREATE OR REPLACE)
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.users WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_user_email_by_username(p_username text)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT email FROM public.users
  WHERE lower(username) = lower(p_username)
  LIMIT 1;
$$;

-- ──────────────────────────────────────────────────────────────
-- 4.  Auto-sync trigger: auth.users → public.users
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

  IF v_role NOT IN ('administrator', 'admin', 'staff') THEN
    v_role := 'staff';
  END IF;

  v_username := lower(regexp_replace(v_username, '[^a-z0-9._-]', '', 'g'));
  IF v_username = '' THEN v_username := 'user'; END IF;

  v_base := v_username;
  WHILE EXISTS (SELECT 1 FROM public.users WHERE username = v_username) LOOP
    v_counter  := v_counter + 1;
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ──────────────────────────────────────────────────────────────
-- 5.  Update RLS policies
--     Drops and recreates all policies so they match the latest design.
-- ──────────────────────────────────────────────────────────────

-- users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_select_authenticated"  ON public.users;
DROP POLICY IF EXISTS "users_write_administrator"   ON public.users;
CREATE POLICY "users_select_authenticated"  ON public.users FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "users_write_administrator"   ON public.users FOR ALL
  USING  (public.current_user_role() = 'administrator')
  WITH CHECK (public.current_user_role() = 'administrator');

-- products
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "products_select_authenticated" ON public.products;
DROP POLICY IF EXISTS "products_write_admin"          ON public.products;
CREATE POLICY "products_select_authenticated" ON public.products FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "products_write_admin"          ON public.products FOR ALL
  USING  (public.current_user_role() IN ('administrator','admin'))
  WITH CHECK (public.current_user_role() IN ('administrator','admin'));

-- product_units
ALTER TABLE public.product_units ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "prod_units_select_authenticated" ON public.product_units;
DROP POLICY IF EXISTS "prod_units_write_admin"          ON public.product_units;
CREATE POLICY "prod_units_select_authenticated" ON public.product_units FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "prod_units_write_admin"          ON public.product_units FOR ALL
  USING  (public.current_user_role() IN ('administrator','admin'))
  WITH CHECK (public.current_user_role() IN ('administrator','admin'));

-- warehouses
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "warehouses_select_authenticated" ON public.warehouses;
DROP POLICY IF EXISTS "warehouses_write_admin"          ON public.warehouses;
CREATE POLICY "warehouses_select_authenticated" ON public.warehouses FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "warehouses_write_admin"          ON public.warehouses FOR ALL
  USING  (public.current_user_role() IN ('administrator','admin'))
  WITH CHECK (public.current_user_role() IN ('administrator','admin'));

-- warehouse_sections
ALTER TABLE public.warehouse_sections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wh_sections_select_authenticated" ON public.warehouse_sections;
DROP POLICY IF EXISTS "wh_sections_write_admin"          ON public.warehouse_sections;
CREATE POLICY "wh_sections_select_authenticated" ON public.warehouse_sections FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "wh_sections_write_admin"          ON public.warehouse_sections FOR ALL
  USING  (public.current_user_role() IN ('administrator','admin'))
  WITH CHECK (public.current_user_role() IN ('administrator','admin'));

-- inventory_batches
ALTER TABLE public.inventory_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inv_batches_all_authenticated" ON public.inventory_batches;
CREATE POLICY "inv_batches_all_authenticated" ON public.inventory_batches FOR ALL
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- inventory_transactions
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inv_txns_select_authenticated" ON public.inventory_transactions;
DROP POLICY IF EXISTS "inv_txns_insert_authenticated" ON public.inventory_transactions;
CREATE POLICY "inv_txns_select_authenticated" ON public.inventory_transactions FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "inv_txns_insert_authenticated" ON public.inventory_transactions FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_select_admin"          ON public.audit_logs;
DROP POLICY IF EXISTS "audit_insert_authenticated"  ON public.audit_logs;
CREATE POLICY "audit_select_admin"         ON public.audit_logs FOR SELECT USING (public.current_user_role() IN ('administrator','admin'));
CREATE POLICY "audit_insert_authenticated" ON public.audit_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- settings
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "settings_select_authenticated" ON public.settings;
DROP POLICY IF EXISTS "settings_write_admin"          ON public.settings;
CREATE POLICY "settings_select_authenticated" ON public.settings FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "settings_write_admin"          ON public.settings FOR ALL
  USING  (public.current_user_role() IN ('administrator','admin'))
  WITH CHECK (public.current_user_role() IN ('administrator','admin'));

-- ──────────────────────────────────────────────────────────────
-- Done. Verify:
--   SELECT trigger_name FROM information_schema.triggers
--   WHERE event_object_schema = 'auth' AND event_object_table = 'users';
--   -- should return: on_auth_user_created
-- ──────────────────────────────────────────────────────────────
