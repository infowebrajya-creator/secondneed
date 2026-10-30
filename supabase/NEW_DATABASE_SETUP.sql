-- ==============================================================================
-- WEBRAJYA POS & BILLING - COMPLETE NEW DATABASE SETUP FOR SUPABASE
-- ==============================================================================
-- Instructions for New Client Supabase Account:
-- 1. Create a new project at https://supabase.com/dashboard
-- 2. Once the project is provisioned, go to "SQL Editor" in the left sidebar
-- 3. Click "New query", paste the entire contents of this file, and click "Run" (green button)
-- 4. Navigate to "Project Settings" -> "Data API" (or "API"):
--    - Copy "Project URL" (e.g., https://xyzcompany.supabase.co)
--    - Copy "anon" / "publishable" key (e.g., sb_publishable_... or eyJhbGci...)
-- 5. Paste these into your application:
--    - In `.env` file (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY), OR
--    - In the application under "Settings" -> "Cloud Sync & Backup" -> Save Supabase Config.
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 2. COMMON TRIGGER FUNCTION FOR UPDATED_AT
CREATE OR REPLACE FUNCTION public.set_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 3. CATEGORIES TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_categories_updated_at ON public.categories;
CREATE TRIGGER trg_categories_updated_at
BEFORE UPDATE ON public.categories
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_column();

-- ==============================================================================
-- 4. CUSTOMERS & CLIENTS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.customers (
  id TEXT PRIMARY KEY DEFAULT ('cust_' || gen_random_uuid()),
  name TEXT NOT NULL,
  mobile TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  pincode TEXT,
  gstin TEXT,
  credit_balance NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  credit_limit NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_name ON public.customers (name);
CREATE INDEX IF NOT EXISTS idx_customers_mobile ON public.customers (mobile);
CREATE INDEX IF NOT EXISTS idx_customers_gstin ON public.customers (gstin);

DROP TRIGGER IF EXISTS trg_customers_updated_at ON public.customers;
CREATE TRIGGER trg_customers_updated_at
BEFORE UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_column();

-- ==============================================================================
-- 5. PRODUCTS / STOCK MASTER TABLE
-- Dual column compatibility: supports purchase_rate/purchase_price, sale_rate/selling_rate,
-- stock_qty/stock_quantity, min_stock_level/low_stock_threshold
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.products (
  id TEXT PRIMARY KEY DEFAULT ('prod_' || gen_random_uuid()),
  sku TEXT NOT NULL,
  barcode TEXT,
  name TEXT NOT NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'General Supplies',
  pack_info TEXT DEFAULT '1*1',
  unit TEXT NOT NULL DEFAULT 'Pcs',
  mrp NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  
  -- Price & rate columns (synchronized via trigger)
  purchase_rate NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  purchase_price NUMERIC(12,2) DEFAULT 0.00,
  sale_rate NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  selling_rate NUMERIC(12,2) DEFAULT 0.00,
  
  -- Tax columns
  hsn_code TEXT DEFAULT '4820',
  gst_rate NUMERIC(5,2) NOT NULL DEFAULT 12.00,
  tax_type TEXT NOT NULL DEFAULT 'inclusive',
  
  -- Stock columns (synchronized via trigger)
  stock_qty NUMERIC(12,3) NOT NULL DEFAULT 0.000,
  stock_quantity NUMERIC(12,3) DEFAULT 0.000,
  min_stock_level NUMERIC(12,3) NOT NULL DEFAULT 5.000,
  low_stock_threshold NUMERIC(12,3) DEFAULT 5.000,
  
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup & search indexes
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products (sku);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON public.products (barcode);
CREATE INDEX IF NOT EXISTS idx_products_name ON public.products (name);
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON public.products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products (category);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON public.products (is_active);

-- Auto-synchronize dual-column naming conventions on insert/update
CREATE OR REPLACE FUNCTION public.sync_product_dual_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- Synchronize purchase rate <-> purchase price
  IF NEW.purchase_rate IS NOT NULL AND (NEW.purchase_price IS NULL OR NEW.purchase_price = 0) THEN
    NEW.purchase_price := NEW.purchase_rate;
  ELSIF NEW.purchase_price IS NOT NULL AND (NEW.purchase_rate IS NULL OR NEW.purchase_rate = 0) THEN
    NEW.purchase_rate := NEW.purchase_price;
  END IF;

  -- Synchronize sale rate <-> selling rate
  IF NEW.sale_rate IS NOT NULL AND (NEW.selling_rate IS NULL OR NEW.selling_rate = 0) THEN
    NEW.selling_rate := NEW.sale_rate;
  ELSIF NEW.selling_rate IS NOT NULL AND (NEW.sale_rate IS NULL OR NEW.sale_rate = 0) THEN
    NEW.sale_rate := NEW.selling_rate;
  END IF;

  -- Synchronize stock quantity
  IF NEW.stock_qty IS NOT NULL AND (NEW.stock_quantity IS NULL OR NEW.stock_quantity = 0) THEN
    NEW.stock_quantity := NEW.stock_qty;
  ELSIF NEW.stock_quantity IS NOT NULL AND (NEW.stock_qty IS NULL OR NEW.stock_qty = 0) THEN
    NEW.stock_qty := NEW.stock_quantity;
  END IF;

  -- Synchronize min stock / low stock threshold
  IF NEW.min_stock_level IS NOT NULL AND (NEW.low_stock_threshold IS NULL OR NEW.low_stock_threshold = 0) THEN
    NEW.low_stock_threshold := NEW.min_stock_level;
  ELSIF NEW.low_stock_threshold IS NOT NULL AND (NEW.min_stock_level IS NULL OR NEW.min_stock_level = 0) THEN
    NEW.min_stock_level := NEW.low_stock_threshold;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_products_sync_columns ON public.products;
CREATE TRIGGER trg_products_sync_columns
BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.sync_product_dual_columns();

-- ==============================================================================
-- 6. INVOICES / SALES TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.invoices (
  id TEXT PRIMARY KEY DEFAULT ('inv_' || gen_random_uuid()),
  invoice_number TEXT UNIQUE NOT NULL,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  invoice_time TIME NOT NULL DEFAULT CURRENT_TIME,
  invoice_type TEXT NOT NULL DEFAULT 'gst',
  customer_id TEXT REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL DEFAULT 'Cash Customer',
  customer_mobile TEXT,
  customer_gstin TEXT,
  customer_address TEXT,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  total_discount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  total_gst NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  cgst_total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  sgst_total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  igst_total NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  freight_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  round_off NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  net_payable NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  balance_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  payment_mode TEXT NOT NULL DEFAULT 'cash',
  payment_status TEXT NOT NULL DEFAULT 'paid',
  status TEXT NOT NULL DEFAULT 'completed',
  is_interstate BOOLEAN NOT NULL DEFAULT FALSE,
  idempotency_key TEXT UNIQUE,
  transaction_ref TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_number ON public.invoices (invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON public.invoices (invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_name ON public.invoices (customer_name);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_mobile ON public.invoices (customer_mobile);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON public.invoices (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_idempotency ON public.invoices (idempotency_key);

DROP TRIGGER IF EXISTS trg_invoices_updated_at ON public.invoices;
CREATE TRIGGER trg_invoices_updated_at
BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_column();

-- ==============================================================================
-- 7. INVOICE LINE ITEMS TABLE (SNAPSHOTS AT SALE TIME)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.invoice_items (
  id TEXT PRIMARY KEY DEFAULT ('item_' || gen_random_uuid()),
  invoice_id TEXT NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  sku TEXT NOT NULL DEFAULT '',
  barcode TEXT,
  pack_info TEXT,
  remark TEXT,
  unit TEXT NOT NULL DEFAULT 'Pcs',
  qty NUMERIC(12,3) NOT NULL CHECK (qty > 0),
  free_qty NUMERIC(12,3) NOT NULL DEFAULT 0.000,
  unit_rate NUMERIC(12,2) NOT NULL CHECK (unit_rate >= 0),
  mrp NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  scheme_discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  addl_discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  hsn_code TEXT,
  gst_rate NUMERIC(5,2) NOT NULL DEFAULT 12.00,
  gst_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON public.invoice_items (invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_product ON public.invoice_items (product_id);

-- ==============================================================================
-- 8. STOCK MOVEMENTS LEDGER TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id TEXT PRIMARY KEY DEFAULT ('sm_' || gen_random_uuid()),
  product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  type TEXT NOT NULL,
  quantity_change NUMERIC(12,3) NOT NULL,
  previous_stock NUMERIC(12,3) NOT NULL,
  new_stock NUMERIC(12,3) NOT NULL,
  reason TEXT,
  reference_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON public.stock_movements (product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON public.stock_movements (created_at DESC);

-- ==============================================================================
-- 9. STORE PROFILE / SETTINGS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.store_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_name TEXT NOT NULL DEFAULT 'WebRajya POS Store',
  tagline TEXT DEFAULT 'Retail & Wholesale',
  address TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT DEFAULT '',
  gstin TEXT NOT NULL DEFAULT '',
  state_code TEXT NOT NULL DEFAULT '23',
  state_name TEXT NOT NULL DEFAULT 'Madhya Pradesh',
  pincode TEXT DEFAULT '',
  bank_name TEXT DEFAULT '',
  account_no TEXT DEFAULT '',
  ifsc_code TEXT DEFAULT '',
  upi_id TEXT DEFAULT '',
  invoice_prefix TEXT NOT NULL DEFAULT 'INV-',
  terms_and_conditions TEXT DEFAULT '1. Goods once sold will not be taken back without bill.\n2. Warranty as per manufacturer guidelines.',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_store_settings_updated_at ON public.store_settings;
CREATE TRIGGER trg_store_settings_updated_at
BEFORE UPDATE ON public.store_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_column();

-- ==============================================================================
-- 10. AUDIT LOGS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id TEXT PRIMARY KEY DEFAULT ('audit_' || gen_random_uuid()),
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at DESC);

-- ==============================================================================
-- 11. ROW LEVEL SECURITY (RLS) & PUBLIC ACCESS POLICIES
-- WebRajya is an offline-first POS syncing via Supabase anon publishable keys.
-- ==============================================================================
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Categories Policy
DROP POLICY IF EXISTS "Public access for categories" ON public.categories;
CREATE POLICY "Public access for categories" ON public.categories
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- Customers Policy
DROP POLICY IF EXISTS "Public access for customers" ON public.customers;
CREATE POLICY "Public access for customers" ON public.customers
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- Products Policy
DROP POLICY IF EXISTS "Public access for products" ON public.products;
CREATE POLICY "Public access for products" ON public.products
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- Invoices Policy
DROP POLICY IF EXISTS "Public access for invoices" ON public.invoices;
CREATE POLICY "Public access for invoices" ON public.invoices
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- Invoice Items Policy
DROP POLICY IF EXISTS "Public access for invoice_items" ON public.invoice_items;
CREATE POLICY "Public access for invoice_items" ON public.invoice_items
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- Stock Movements Policy
DROP POLICY IF EXISTS "Public access for stock_movements" ON public.stock_movements;
CREATE POLICY "Public access for stock_movements" ON public.stock_movements
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- Store Settings Policy
DROP POLICY IF EXISTS "Public access for store_settings" ON public.store_settings;
CREATE POLICY "Public access for store_settings" ON public.store_settings
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- Audit Logs Policy
DROP POLICY IF EXISTS "Public access for audit_logs" ON public.audit_logs;
CREATE POLICY "Public access for audit_logs" ON public.audit_logs
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- ==============================================================================
-- 12. PERMISSIONS GRANT FOR DATA API (POSTGREST)
-- ==============================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;

-- ==============================================================================
-- 13. ENABLE SUPABASE REALTIME REPLICATION
-- Allows instant multi-device sales and product synchronization
-- ==============================================================================
DO $$
BEGIN
  -- Products
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'products'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
  END IF;

  -- Invoices
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'invoices'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
  END IF;

  -- Invoice Items
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'invoice_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.invoice_items;
  END IF;

  -- Customers
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'customers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.customers;
  END IF;

  -- Categories
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'categories'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.categories;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Realtime publication notice: %', SQLERRM;
END $$;

-- ==============================================================================
-- 14. SEED DEFAULT DATA
-- ==============================================================================

-- Default Cash Customer (Standard walk-in customer for quick counter sales)
INSERT INTO public.customers (id, name, mobile, address, notes)
VALUES
  ('cust_default_cash', 'Cash Customer', '', 'Local Walk-in Sale', 'Default walk-in customer')
ON CONFLICT (id) DO NOTHING;

-- Default Store Settings row
INSERT INTO public.store_settings (store_name, tagline, invoice_prefix)
VALUES ('WebRajya POS Store', 'Retail & Wholesale', 'INV-')
ON CONFLICT DO NOTHING;

-- ==============================================================================
-- VERIFICATION QUERY
-- ==============================================================================
SELECT 'Database setup completed successfully!' AS status,
       (SELECT COUNT(*) FROM public.categories) AS categories_count,
       (SELECT COUNT(*) FROM public.customers) AS customers_count,
       (SELECT COUNT(*) FROM public.products) AS products_count;
