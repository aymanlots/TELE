-- ============================================================================
-- GOLDEN SHOP MANAGER - MULTI-TENANT SAAS SUPABASE POSTGRESQL SCHEMA (RLS + RPC)
-- ============================================================================
-- Features:
-- 1. Multi-Tenancy Isolation (shops, subscriptions, shop_id on all tables)
-- 2. Multi-User & Granular Roles (shop_members: owner, manager, cashier, technician)
-- 3. Strict Row Level Security (RLS) enforcing shop_id = public.current_shop_id()
-- 4. Creator Audit Tracking (created_by_user_id, created_by_name on all records)
-- 5. Realtime Broadcast & Conflict-Free Atomic Document Numbering RPCs
-- ============================================================================

create extension if not exists "pgcrypto";

-- ============================================================================
-- 1. MULTI-TENANT SHOPS, SUBSCRIPTIONS & SHOP MEMBERS
-- ============================================================================

create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Mon Magasin',
  subtitle text,
  logo_url text,
  address text,
  phone text,
  ice text,
  subscription_status text not null default 'active' check (subscription_status in ('trial', 'active', 'expired')),
  subscription_ends_at timestamptz default (now() + interval '365 days'),
  plan_tier text not null default 'pro' check (plan_tier in ('standard', 'pro')),
  plan_name text default 'النسخة الاحترافية الشاملة PRO VIP',
  license_key text,
  reseller_whatsapp text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  plan_name text not null default 'Golden SaaS Pro',
  status text not null default 'trial' check (status in ('trial', 'active', 'expired')),
  starts_at timestamptz not null default now(),
  subscription_ends_at timestamptz not null default (now() + interval '30 days'),
  amount_dh numeric default 0,
  payment_method text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_members (
  id uuid primary key references auth.users(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'cashier' check (role in ('owner', 'manager', 'cashier', 'technician', 'employee')),
  pin_code text, -- 6-digit PIN for fast offline/local unlock
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Backward-compatible alias view for users_profile
create or replace view public.users_profile as
select
  id,
  shop_id as store_id,
  shop_id,
  email,
  full_name,
  role,
  active,
  created_at,
  updated_at
from public.shop_members;

-- Helper: Resolve current authenticated user's shop_id from JWT claims or shop_members
create or replace function public.current_shop_id()
returns uuid
language sql
security definer
stable
as $$
  select coalesce(
    nullif(auth.jwt() -> 'app_metadata' ->> 'shop_id', '')::uuid,
    nullif(auth.jwt() ->> 'shop_id', '')::uuid,
    (
      select sm.shop_id
      from public.shop_members sm
      where sm.id = auth.uid()
        and sm.active = true
      limit 1
    )
  );
$$;

-- Helper: Check if current authenticated user is an active member of the given shop
create or replace function public.is_active_shop_member(target_shop_id uuid default public.current_shop_id())
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from public.shop_members sm
    where sm.id = auth.uid()
      and sm.shop_id = coalesce(target_shop_id, public.current_shop_id())
      and sm.active = true
  )
  or (
    nullif(auth.jwt() -> 'app_metadata' ->> 'shop_id', '')::uuid = target_shop_id
  );
$$;

-- Helper: Check if current authenticated user is the shop owner
create or replace function public.is_owner()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from public.shop_members sm
    where sm.id = auth.uid()
      and sm.shop_id = public.current_shop_id()
      and sm.role = 'owner'
      and sm.active = true
  );
$$;

-- Helper: Return current user's role in their shop
create or replace function public.current_member_role()
returns text
language sql
security definer
stable
as $$
  select coalesce(
    (
      select sm.role
      from public.shop_members sm
      where sm.id = auth.uid()
        and sm.shop_id = public.current_shop_id()
        and sm.active = true
      limit 1
    ),
    'cashier'
  );
$$;

-- ============================================================================
-- 2. ATOMIC DOCUMENT NUMBERING PER SHOP (RPC)
-- ============================================================================

create table if not exists public.shop_sequences (
  shop_id uuid not null references public.shops(id) on delete cascade,
  seq_name text not null,
  current_value bigint not null default 0,
  primary key (shop_id, seq_name)
);

create or replace function public.next_shop_sequence(p_seq_name text, p_prefix text)
returns text
language plpgsql
security definer
as $$
declare
  v_shop_id uuid;
  v_val bigint;
  v_year text;
begin
  v_shop_id := public.current_shop_id();
  if v_shop_id is null then
    raise exception 'Unauthorized: user does not belong to an active shop';
  end if;

  insert into public.shop_sequences (shop_id, seq_name, current_value)
  values (v_shop_id, p_seq_name, 1)
  on conflict (shop_id, seq_name)
  do update set current_value = public.shop_sequences.current_value + 1
  returning current_value into v_val;

  v_year := to_char(now(), 'YYYY');
  return p_prefix || '-' || v_year || '-' || lpad(v_val::text, 4, '0');
end;
$$;

create or replace function public.next_bon_number()
returns text
language sql
security definer
as $$
  select public.next_shop_sequence('bon', 'BON');
$$;

create or replace function public.next_repair_number()
returns text
language sql
security definer
as $$
  select public.next_shop_sequence('repair', 'REP');
$$;

create or replace function public.next_purchase_order_number()
returns text
language sql
security definer
as $$
  select public.next_shop_sequence('po', 'BA');
$$;

-- ============================================================================
-- 3. OPERATIONAL TABLES (ALL SCOPED BY shop_id + CREATOR TRACKING)
-- ============================================================================

-- 3.1 PRODUCTS
create table if not exists public.products (
  uuid uuid primary key default gen_random_uuid(),
  shop_id uuid not null default public.current_shop_id() references public.shops(id) on delete cascade,
  local_id bigint,
  name text not null,
  category text not null,
  image text,
  purchase_price numeric not null default 0,
  retail_price numeric not null default 0,
  wholesale_price numeric not null default 0,
  quantity integer not null default 0,
  min_alert_qty integer default 5,
  supplier_id bigint,
  supplier_uuid uuid,
  imei_list jsonb not null default '[]'::jsonb,
  barcode text,
  created_at timestamptz not null default now(),
  notes text,
  is_trade_in boolean default false,
  condition text,
  trade_in_customer_name text,
  trade_in_customer_phone text,
  trade_in_customer_cin text,
  trade_in_cin_image text,
  applied_movement_uuids jsonb default '[]'::jsonb,
  created_by_user_id text,
  created_by_name text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  device_id text,
  raw_data jsonb not null default '{}'::jsonb
);
create index if not exists idx_products_shop_id on public.products(shop_id);

-- 3.2 SUPPLIERS
create table if not exists public.suppliers (
  uuid uuid primary key default gen_random_uuid(),
  shop_id uuid not null default public.current_shop_id() references public.shops(id) on delete cascade,
  local_id bigint,
  name text not null,
  phone text,
  email text,
  address text,
  total_debt numeric not null default 0,
  paid_amount numeric not null default 0,
  created_by_user_id text,
  created_by_name text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  device_id text,
  raw_data jsonb not null default '{}'::jsonb
);
create index if not exists idx_suppliers_shop_id on public.suppliers(shop_id);

-- 3.3 SUPPLIER PAYMENTS
create table if not exists public.supplier_payments (
  uuid uuid primary key default gen_random_uuid(),
  shop_id uuid not null default public.current_shop_id() references public.shops(id) on delete cascade,
  local_id bigint,
  supplier_id bigint,
  supplier_uuid uuid,
  amount numeric not null default 0,
  date text not null,
  note text,
  created_by_user_id text,
  created_by_name text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  device_id text,
  raw_data jsonb not null default '{}'::jsonb
);
create index if not exists idx_supplier_payments_shop_id on public.supplier_payments(shop_id);

-- 3.4 SUPPLIER PURCHASE ORDERS
create table if not exists public.supplier_purchase_orders (
  uuid uuid primary key default gen_random_uuid(),
  shop_id uuid not null default public.current_shop_id() references public.shops(id) on delete cascade,
  local_id bigint,
  bon_number text not null,
  provisional_number text,
  supplier_id bigint,
  supplier_uuid uuid,
  supplier_name text not null,
  date text not null,
  items jsonb not null default '[]'::jsonb,
  total_amount numeric not null default 0,
  paid_amount numeric not null default 0,
  remaining_amount numeric not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  created_by_user_id text,
  created_by_name text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  device_id text,
  raw_data jsonb not null default '{}'::jsonb
);
create index if not exists idx_supplier_po_shop_id on public.supplier_purchase_orders(shop_id);

-- 3.5 CUSTOMERS
create table if not exists public.customers (
  uuid uuid primary key default gen_random_uuid(),
  shop_id uuid not null default public.current_shop_id() references public.shops(id) on delete cascade,
  local_id bigint,
  name text not null,
  phone text,
  cin text,
  address text,
  customer_type text,
  credit_limit numeric,
  total_credit numeric not null default 0,
  created_by_user_id text,
  created_by_name text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  device_id text,
  raw_data jsonb not null default '{}'::jsonb
);
create index if not exists idx_customers_shop_id on public.customers(shop_id);

-- 3.6 CUSTOMER PAYMENTS
create table if not exists public.customer_payments (
  uuid uuid primary key default gen_random_uuid(),
  shop_id uuid not null default public.current_shop_id() references public.shops(id) on delete cascade,
  local_id bigint,
  customer_id bigint,
  customer_uuid uuid,
  sale_id bigint,
  sale_uuid uuid,
  bon_number text,
  applied_bons jsonb default '[]'::jsonb,
  amount numeric not null default 0,
  date text not null,
  note text,
  payment_method text,
  status text default 'active',
  cancellation_reason text,
  cancelled_at timestamptz,
  created_by_user_id text,
  created_by_name text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  device_id text,
  raw_data jsonb not null default '{}'::jsonb
);
create index if not exists idx_customer_payments_shop_id on public.customer_payments(shop_id);

-- 3.7 SALES (BONS)
create table if not exists public.sales (
  uuid uuid primary key default gen_random_uuid(),
  shop_id uuid not null default public.current_shop_id() references public.shops(id) on delete cascade,
  local_id bigint,
  bon_number text not null,
  provisional_number text,
  customer_id bigint,
  customer_uuid uuid,
  customer_name text not null,
  customer_phone text,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric,
  discount_amount numeric,
  discount_type text,
  discount_value numeric,
  original_total_amount numeric,
  total_amount numeric not null default 0,
  paid_amount numeric not null default 0,
  remaining_amount numeric not null default 0,
  returns jsonb default '[]'::jsonb,
  payment_type text not null,
  payment_method text,
  due_date text,
  installments jsonb default '[]'::jsonb,
  has_warranty boolean default false,
  warranty_months integer default 0,
  date text not null,
  created_at timestamptz not null default now(),
  notes text,
  status text not null default 'active',
  sale_kind text default 'product',
  repair_id bigint,
  repair_uuid uuid,
  created_by_user_id text,
  created_by_name text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  device_id text,
  raw_data jsonb not null default '{}'::jsonb
);
create index if not exists idx_sales_shop_id on public.sales(shop_id);

-- 3.8 WARRANTIES
create table if not exists public.warranties (
  uuid uuid primary key default gen_random_uuid(),
  shop_id uuid not null default public.current_shop_id() references public.shops(id) on delete cascade,
  local_id bigint,
  sale_id bigint,
  sale_uuid uuid,
  bon_number text not null,
  provisional_number text,
  product_id bigint,
  product_uuid uuid,
  product_name text not null,
  imei text,
  customer_name text not null,
  customer_phone text,
  start_date text not null,
  end_date text not null,
  status text not null default 'active',
  created_by_user_id text,
  created_by_name text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  device_id text,
  raw_data jsonb not null default '{}'::jsonb
);
create index if not exists idx_warranties_shop_id on public.warranties(shop_id);

-- 3.9 SAV TICKETS
create table if not exists public.sav_tickets (
  uuid uuid primary key default gen_random_uuid(),
  shop_id uuid not null default public.current_shop_id() references public.shops(id) on delete cascade,
  local_id bigint,
  warranty_id bigint,
  warranty_uuid uuid,
  bon_number text,
  imei text,
  customer_name text not null,
  customer_phone text,
  product_name text,
  issue text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  cost numeric,
  resolution_notes text,
  created_by_user_id text,
  created_by_name text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  device_id text,
  raw_data jsonb not null default '{}'::jsonb
);
create index if not exists idx_sav_tickets_shop_id on public.sav_tickets(shop_id);

-- 3.10 CREDIT AUDIT LOGS
create table if not exists public.credit_audit_logs (
  uuid uuid primary key default gen_random_uuid(),
  shop_id uuid not null default public.current_shop_id() references public.shops(id) on delete cascade,
  local_id bigint,
  customer_id bigint,
  customer_uuid uuid,
  customer_name text not null,
  sale_id bigint,
  sale_uuid uuid,
  bon_number text,
  entity_type text not null,
  action text not null,
  old_value text,
  new_value text,
  reason text,
  date text not null,
  created_by_user_id text,
  created_by_name text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  device_id text,
  raw_data jsonb not null default '{}'::jsonb
);
create index if not exists idx_credit_audit_logs_shop_id on public.credit_audit_logs(shop_id);

-- 3.11 REPAIRS
create table if not exists public.repairs (
  uuid uuid primary key default gen_random_uuid(),
  shop_id uuid not null default public.current_shop_id() references public.shops(id) on delete cascade,
  local_id bigint,
  repair_number text not null,
  provisional_number text,
  customer_name text not null,
  customer_phone text not null,
  brand text not null,
  model text not null,
  imei text,
  issue text not null,
  condition_notes text,
  lock_code text,
  agreed_price numeric not null default 0,
  deposit_amount numeric not null default 0,
  remaining_amount numeric not null default 0,
  intake_date text not null,
  expected_delivery_date text,
  actual_delivery_date text,
  status text not null default 'pending',
  technician_name text,
  technician_commission_rate numeric default 0,
  technician_commission_amount numeric default 0,
  technician_notes text,
  used_parts jsonb default '[]'::jsonb,
  total_parts_cost numeric default 0,
  net_profit numeric default 0,
  created_at timestamptz not null default now(),
  created_by_user_id text,
  created_by_name text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  device_id text,
  raw_data jsonb not null default '{}'::jsonb
);
create index if not exists idx_repairs_shop_id on public.repairs(shop_id);

-- 3.12 SPARE PARTS
create table if not exists public.spare_parts (
  uuid uuid primary key default gen_random_uuid(),
  shop_id uuid not null default public.current_shop_id() references public.shops(id) on delete cascade,
  local_id bigint,
  name text not null,
  compatible_brand text not null,
  compatible_model text not null,
  quality text not null default 'original',
  quantity integer not null default 0,
  purchase_price numeric not null default 0,
  selling_price numeric not null default 0,
  supplier_id bigint,
  supplier_uuid uuid,
  supplier_name text,
  min_alert_qty integer not null default 2,
  notes text,
  created_at timestamptz not null default now(),
  created_by_user_id text,
  created_by_name text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  device_id text,
  raw_data jsonb not null default '{}'::jsonb
);
create index if not exists idx_spare_parts_shop_id on public.spare_parts(shop_id);

-- 3.13 EXPENSES
create table if not exists public.expenses (
  uuid uuid primary key default gen_random_uuid(),
  shop_id uuid not null default public.current_shop_id() references public.shops(id) on delete cascade,
  local_id bigint,
  title text,
  amount numeric not null default 0,
  category text not null,
  date text not null,
  note text,
  is_recurring boolean default false,
  recurring_expense_id bigint,
  recurring_expense_uuid uuid,
  created_at timestamptz not null default now(),
  created_by_user_id text,
  created_by_name text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  device_id text,
  raw_data jsonb not null default '{}'::jsonb
);
create index if not exists idx_expenses_shop_id on public.expenses(shop_id);

-- 3.14 RECURRING EXPENSES
create table if not exists public.recurring_expenses (
  uuid uuid primary key default gen_random_uuid(),
  shop_id uuid not null default public.current_shop_id() references public.shops(id) on delete cascade,
  local_id bigint,
  title text not null,
  amount numeric not null default 0,
  category text not null,
  day_of_month integer not null default 1,
  note text,
  is_active boolean not null default true,
  last_generated_month text,
  created_at timestamptz not null default now(),
  created_by_user_id text,
  created_by_name text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  device_id text,
  raw_data jsonb not null default '{}'::jsonb
);
create index if not exists idx_recurring_expenses_shop_id on public.recurring_expenses(shop_id);

-- 3.15 CUSTOM EXPENSE CATEGORIES
create table if not exists public.custom_expense_categories (
  uuid uuid primary key default gen_random_uuid(),
  shop_id uuid not null default public.current_shop_id() references public.shops(id) on delete cascade,
  key text not null,
  name text not null,
  created_by_user_id text,
  created_by_name text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  device_id text,
  raw_data jsonb not null default '{}'::jsonb
);
create index if not exists idx_custom_exp_cat_shop_id on public.custom_expense_categories(shop_id);

-- 3.16 SETTINGS
create table if not exists public.settings (
  uuid uuid primary key default gen_random_uuid(),
  shop_id uuid not null default public.current_shop_id() references public.shops(id) on delete cascade,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  created_by_user_id text,
  created_by_name text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  device_id text,
  raw_data jsonb not null default '{}'::jsonb
);
create index if not exists idx_settings_shop_id on public.settings(shop_id);

-- 3.17 ACTIVITY LOGS
create table if not exists public.activity_logs (
  uuid uuid primary key default gen_random_uuid(),
  shop_id uuid not null default public.current_shop_id() references public.shops(id) on delete cascade,
  local_id bigint,
  user_role text not null,
  user_name text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details text,
  created_at timestamptz not null default now(),
  created_by_user_id text,
  created_by_name text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  device_id text,
  raw_data jsonb not null default '{}'::jsonb
);
create index if not exists idx_activity_logs_shop_id on public.activity_logs(shop_id);

-- 3.18 STOCK MOVEMENTS
create table if not exists public.stock_movements (
  uuid uuid primary key default gen_random_uuid(),
  shop_id uuid not null default public.current_shop_id() references public.shops(id) on delete cascade,
  local_id bigint,
  product_id bigint,
  product_uuid uuid,
  product_name text not null,
  type text not null,
  quantity_delta integer not null default 0,
  previous_qty integer not null default 0,
  new_qty integer not null default 0,
  reason text,
  user_name text,
  date text not null,
  created_at timestamptz not null default now(),
  created_by_user_id text,
  created_by_name text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  device_id text,
  raw_data jsonb not null default '{}'::jsonb
);
create index if not exists idx_stock_movements_shop_id on public.stock_movements(shop_id);

-- 3.19 CASH CLOSURES
create table if not exists public.cash_closures (
  uuid uuid primary key default gen_random_uuid(),
  shop_id uuid not null default public.current_shop_id() references public.shops(id) on delete cascade,
  local_id bigint,
  date text not null,
  expected_cash numeric not null default 0,
  expected_cheque numeric not null default 0,
  expected_transfer numeric not null default 0,
  total_expenses numeric not null default 0,
  net_expected_cash numeric not null default 0,
  counted_cash numeric not null default 0,
  discrepancy numeric not null default 0,
  notes text,
  closed_by text,
  created_at timestamptz not null default now(),
  created_by_user_id text,
  created_by_name text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  device_id text,
  raw_data jsonb not null default '{}'::jsonb
);
create index if not exists idx_cash_closures_shop_id on public.cash_closures(shop_id);

-- ============================================================================
-- 4. COST-PRICE MASKED VIEW FOR CASHIERS / EMPLOYEES (RBAC)
-- ============================================================================

create or replace view public.products_employee_view
with (security_invoker = false)
as
select
  p.uuid,
  p.shop_id,
  p.local_id,
  p.name,
  p.category,
  p.image,
  case when public.is_owner() then p.purchase_price else 0::numeric end as purchase_price,
  p.retail_price,
  p.wholesale_price,
  p.quantity,
  p.min_alert_qty,
  p.supplier_id,
  p.supplier_uuid,
  p.imei_list,
  p.barcode,
  p.created_at,
  p.notes,
  p.is_trade_in,
  p.condition,
  p.trade_in_customer_name,
  p.trade_in_customer_phone,
  p.trade_in_customer_cin,
  p.applied_movement_uuids,
  p.created_by_user_id,
  p.created_by_name,
  p.updated_at,
  p.deleted_at,
  p.device_id,
  case
    when public.is_owner() then p.raw_data
    else (p.raw_data - 'purchasePrice' - 'purchase_price')
  end as raw_data
from public.products p
where p.shop_id = public.current_shop_id();

grant select on public.products_employee_view to authenticated;

-- ============================================================================
-- 5. MULTI-TENANT ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
-- Every query/mutation is strictly isolated to `shop_id = public.current_shop_id()`.
-- No shop can ever read or modify another shop's records.

alter table public.shops enable row level security;
alter table public.subscriptions enable row level security;
alter table public.shop_members enable row level security;
alter table public.shop_sequences enable row level security;
alter table public.products enable row level security;
alter table public.suppliers enable row level security;
alter table public.supplier_payments enable row level security;
alter table public.supplier_purchase_orders enable row level security;
alter table public.customers enable row level security;
alter table public.customer_payments enable row level security;
alter table public.sales enable row level security;
alter table public.warranties enable row level security;
alter table public.sav_tickets enable row level security;
alter table public.credit_audit_logs enable row level security;
alter table public.repairs enable row level security;
alter table public.spare_parts enable row level security;
alter table public.expenses enable row level security;
alter table public.recurring_expenses enable row level security;
alter table public.custom_expense_categories enable row level security;
alter table public.settings enable row level security;
alter table public.activity_logs enable row level security;
alter table public.stock_movements enable row level security;
alter table public.cash_closures enable row level security;

-- SHOPS & SUBSCRIPTIONS
drop policy if exists "shops_select_own" on public.shops;
create policy "shops_select_own" on public.shops
  for select to authenticated
  using (id = public.current_shop_id());

drop policy if exists "shops_update_owner" on public.shops;
create policy "shops_update_owner" on public.shops
  for update to authenticated
  using (id = public.current_shop_id() and public.is_owner())
  with check (id = public.current_shop_id() and public.is_owner());

drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own" on public.subscriptions
  for select to authenticated
  using (shop_id = public.current_shop_id());

-- SHOP MEMBERS
drop policy if exists "shop_members_select_same_shop" on public.shop_members;
create policy "shop_members_select_same_shop" on public.shop_members
  for select to authenticated
  using (id = auth.uid() or shop_id = public.current_shop_id());

drop policy if exists "shop_members_manage_owner" on public.shop_members;
create policy "shop_members_manage_owner" on public.shop_members
  for all to authenticated
  using (shop_id = public.current_shop_id() and public.is_owner())
  with check (shop_id = public.current_shop_id() and public.is_owner());

-- OPERATIONAL TABLES: Strict Multi-Tenant Isolation (shop_id = public.current_shop_id())
do $$
declare
  t text;
  tables text[] := array[
    'products',
    'suppliers',
    'supplier_payments',
    'supplier_purchase_orders',
    'customers',
    'customer_payments',
    'sales',
    'warranties',
    'sav_tickets',
    'credit_audit_logs',
    'repairs',
    'spare_parts',
    'expenses',
    'recurring_expenses',
    'custom_expense_categories',
    'settings',
    'activity_logs',
    'stock_movements',
    'cash_closures'
  ];
begin
  foreach t in array tables loop
    execute format('drop policy if exists "%I_tenant_select" on public.%I', t, t);
    execute format(
      'create policy "%I_tenant_select" on public.%I for select to authenticated using (shop_id = public.current_shop_id())',
      t, t
    );

    execute format('drop policy if exists "%I_tenant_insert" on public.%I', t, t);
    execute format(
      'create policy "%I_tenant_insert" on public.%I for insert to authenticated with check (shop_id = public.current_shop_id())',
      t, t
    );

    execute format('drop policy if exists "%I_tenant_update" on public.%I', t, t);
    execute format(
      'create policy "%I_tenant_update" on public.%I for update to authenticated using (shop_id = public.current_shop_id()) with check (shop_id = public.current_shop_id())',
      t, t
    );

    -- Only Owner can hard-delete rows from cloud tables
    execute format('drop policy if exists "%I_tenant_delete" on public.%I', t, t);
    execute format(
      'create policy "%I_tenant_delete" on public.%I for delete to authenticated using (shop_id = public.current_shop_id() and public.is_owner())',
      t, t
    );
  end loop;
end $$;
