-- ============================================================================
--  BELLE COSMÉTIQUES — Gestion de Boutique Beauté
--  FULL SUPABASE / POSTGRESQL SCHEMA
--  ---------------------------------------------------------------------------
--  Project : https://iaodxcutsajckdjjqhnk.supabase.co
--
--  HOW TO INSTALL
--    1. Open Supabase Dashboard → SQL Editor → New query
--    2. Paste this whole file and hit RUN (it is idempotent, you can re-run it)
--    3. Go back to the app → Login page → "Créer un compte Admin"
--       (the button disappears for good once the admin exists)
--
--    If step 3 fails with a permission error on auth.users, create the user
--    from Dashboard → Authentication → Add user (tick "Auto Confirm"), then run
--      select public.link_existing_admin('admin@belle-cosmetiques.com', 'Admin', 'admin');
--    Everything else works identically afterwards.
--
--  WHAT IS INSIDE
--    00. Extensions & helpers
--    01. Identity        : profiles (mirror of auth.users) + roles
--    02. Referentials    : brands, categories, worker_roles, store_settings
--    03. Catalog         : products
--    04. Partners        : suppliers, clients
--    05. Purchases       : purchases + purchase_lines + purchase_payments
--    06. Sales / POS     : sales + sale_lines + sale_payments
--    07. Workers         : workers + advances + absences + salary payments
--    08. Expenses        : expenses
--    09. Caisse          : caisse_transactions
--    10. POS Phone Scan  : scan_sessions + scan_events  (scan with phone camera)
--    11. Activity log    : activity_log (every button action can be traced)
--    12. Business RPC    : the exact SQL behind every button of every screen
--    13. AUTH RPC        : create admin account / worker login accounts
--                          (rows really land in auth.users → direct login)
--    14. Views           : dashboard, caisse, reports & sales-analysis
--    15. Row Level Security policies
--    16. Realtime publication
--
--  SCREEN → SQL MAP (every interface & every button of the application)
--  ---------------------------------------------------------------------------
--  Login.tsx
--     "Créer un compte Admin"  -> rpc create_admin_account(...)   (§13)
--     button visibility        -> rpc admin_exists()              (§13)
--     "Se connecter"           -> rpc resolve_login_email() + supabase.auth
--  Dashboard.tsx               -> view v_dashboard_kpis, v_stock_alerts,
--                                 v_expiring_products, v_monthly_revenue  (§14)
--  Stock/StockPage.tsx
--     "Nouveau produit"        -> insert products                 (§03)
--     "Modifier" / "Supprimer" -> update / delete products
--     "Code-barres"            -> products.barcode
--     brand / category creation-> insert brands / categories      (§02)
--  Purchase/NewPurchaseModal
--     "Enregistrer"            -> rpc create_purchase(jsonb)      (§12)
--                                 (inserts purchase + lines + payment AND
--                                  updates product stock, prices, min qty,
--                                  expiration date — atomically)
--     "Payer"                  -> rpc add_purchase_payment(...)   (§12)
--     "Supprimer"              -> delete from purchases (the app keeps the
--                                 received stock, like the local screen does);
--                                 use rpc delete_purchase() instead if you want
--                                 the quantities rolled back too.
--  POS/POSPage.tsx
--     product grid             -> select products
--     "Scanner avec mon téléphone"
--                              -> rpc open_scan_session()         (§10/§12)
--                                 phone  -> rpc push_scan(session, barcode)
--                                 caisse <- realtime on scan_events
--     "Nouveau client"         -> insert clients                  (§04)
--     "Valider la vente"       -> rpc create_sale(jsonb)          (§12)
--                                 (inserts sale + lines + payment AND
--                                  decrements product stock — atomically)
--  Sales/SalesPage.tsx
--     "Payer"                  -> rpc add_sale_payment(...)       (§12)
--     "Supprimer"              -> delete from sales (mirrors the local screen);
--                                 rpc delete_sale() also puts the sold
--                                 quantities back in stock.
--  Clients / Suppliers pages   -> insert/update/delete clients / suppliers
--  Workers/WorkersPage.tsx
--     "Nouvel employé"         -> insert workers                  (§07)
--     "Compte" (has_account)   -> rpc create_worker_account(...)  (§13)
--                                 => real row in auth.users, worker logs in
--     "Permissions"            -> rpc set_worker_permissions(...) (§12)
--     "Acompte"                -> rpc add_worker_advance(...)     (§12)
--     "Absence"                -> rpc add_worker_absence(...)     (§12)
--     "Payer le salaire"       -> rpc pay_worker_salary(...)      (§12)
--  Expenses/ExpensesPage.tsx   -> insert/update/delete expenses   (§08)
--  Caisse/CaissePage.tsx
--     "Entrée / Sortie"        -> insert caisse_transactions      (§09)
--     full ledger              -> view v_caisse_ledger            (§14)
--     per-category totals      -> view v_category_stats           (§14)
--  Reports/ReportsPage.tsx     -> v_product_sales_stats (best sellers /
--                                 slow movers), v_category_stats,
--                                 v_period_summary, v_client_debts,
--                                 v_supplier_debts                (§14)
--  Settings/SettingsPage.tsx
--     "Enregistrer" (magasin)  -> upsert store_settings           (§02)
--     "Mon compte"             -> update profiles / auth
--     "Sauvegarder"            -> select * (export)
-- ============================================================================

-- ============================================================================
-- 00. EXTENSIONS & GLOBAL HELPERS
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- Application ids are text (the client generates readable ids such as
-- "p-lx8f2k-9d1a"); a default is provided so pure-SQL inserts also work.
create or replace function public.app_id(prefix text default 'id')
returns text
language sql
volatile
as $$
  select prefix || '-' || replace(gen_random_uuid()::text, '-', '');
$$;

-- Generic updated_at trigger
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ============================================================================
-- 01. IDENTITY — profiles (1-1 mirror of auth.users)
-- ============================================================================

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  full_name    text        not null default '',
  username     text        unique,
  email        text        not null,
  role         text        not null default 'worker' check (role in ('admin', 'worker')),
  job_title    text        not null default '',
  -- 'ALL' for the admin, otherwise the per-module permission matrix used by
  -- src/utils/helpers.ts -> can() / moduleEnabled()
  permissions  jsonb       not null default '{}'::jsonb,
  worker_id    text,
  active       boolean     not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists profiles_role_idx     on public.profiles (role);
create index if not exists profiles_worker_idx   on public.profiles (worker_id);
create unique index if not exists profiles_email_uidx on public.profiles (lower(email));

drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch before update on public.profiles
for each row execute function public.touch_updated_at();

-- Authorisation helpers (declared here: they read public.profiles)

-- Is the caller the (or an) administrator?
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.active
  );
$$;

-- Is the caller a signed-in member of the shop?
create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.active);
$$;

-- ============================================================================
-- 02. REFERENTIALS — brands, categories, worker roles, store settings
-- ============================================================================

create table if not exists public.brands (
  name       text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  name       text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.worker_roles (
  name       text primary key,
  created_at timestamptz not null default now()
);

-- Singleton row (id is forced to 1) — Settings → Informations du Magasin
create table if not exists public.store_settings (
  id          smallint primary key default 1 check (id = 1),
  logo        text        not null default '',   -- base64 data-url
  name        text        not null default '',
  description text        not null default '',
  email       text        not null default '',
  phone       text        not null default '',
  address     text        not null default '',
  nif         text        not null default '',
  nis         text        not null default '',
  article     text        not null default '',
  rc          text        not null default '',
  currency    text        not null default 'DA',
  updated_at  timestamptz not null default now()
);

insert into public.store_settings (id) values (1) on conflict (id) do nothing;

drop trigger if exists trg_settings_touch on public.store_settings;
create trigger trg_settings_touch before update on public.store_settings
for each row execute function public.touch_updated_at();

-- ============================================================================
-- 03. CATALOG — products
-- ============================================================================

create table if not exists public.products (
  id              text primary key default public.app_id('p'),
  name            text        not null,
  description     text        not null default '',
  barcode         text        not null default '',
  brand           text        not null default '',
  category        text        not null default '',
  purchase_price  numeric(12,2) not null default 0 check (purchase_price >= 0),
  sale_price      numeric(12,2) not null default 0 check (sale_price >= 0),
  quantity        integer     not null default 0,
  min_quantity    integer     not null default 0 check (min_quantity >= 0),
  has_expiration  boolean     not null default false,
  expiration_date date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists products_barcode_idx  on public.products (barcode);
create index if not exists products_name_idx     on public.products (lower(name));
create index if not exists products_category_idx on public.products (category);
create index if not exists products_brand_idx    on public.products (brand);

drop trigger if exists trg_products_touch on public.products;
create trigger trg_products_touch before update on public.products
for each row execute function public.touch_updated_at();

-- Auto-register new brands / categories typed inside the product form
create or replace function public.register_product_referentials()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.brand, '') <> '' then
    insert into public.brands (name) values (new.brand) on conflict do nothing;
  end if;
  if coalesce(new.category, '') <> '' then
    insert into public.categories (name) values (new.category) on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_products_referentials on public.products;
create trigger trg_products_referentials after insert or update of brand, category
on public.products for each row execute function public.register_product_referentials();

-- ============================================================================
-- 04. PARTNERS — suppliers & clients
-- ============================================================================

create table if not exists public.suppliers (
  id         text primary key default public.app_id('s'),
  name       text not null,
  phone      text not null default '',
  address    text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clients (
  id         text primary key default public.app_id('c'),
  name       text not null,
  phone      text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clients_phone_idx on public.clients (phone);

drop trigger if exists trg_suppliers_touch on public.suppliers;
create trigger trg_suppliers_touch before update on public.suppliers
for each row execute function public.touch_updated_at();

drop trigger if exists trg_clients_touch on public.clients;
create trigger trg_clients_touch before update on public.clients
for each row execute function public.touch_updated_at();

-- ============================================================================
-- 05. PURCHASES
-- ============================================================================

create table if not exists public.purchases (
  id            text primary key default public.app_id('pu'),
  reference     text not null,
  supplier_id   text references public.suppliers (id) on delete set null,
  supplier_name text not null default '',
  total         numeric(12,2) not null default 0,
  paid          numeric(12,2) not null default 0,
  date          timestamptz not null default now(),
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists purchases_date_idx     on public.purchases (date desc);
create index if not exists purchases_supplier_idx on public.purchases (supplier_id);

create table if not exists public.purchase_lines (
  id              bigserial primary key,
  purchase_id     text not null references public.purchases (id) on delete cascade,
  product_id      text references public.products (id) on delete set null,
  product_name    text not null,
  barcode         text not null default '',
  quantity        integer not null check (quantity > 0),
  purchase_price  numeric(12,2) not null default 0,
  sale_price      numeric(12,2) not null default 0,
  min_quantity    integer not null default 0,
  has_expiration  boolean not null default false,
  expiration_date date,
  line_total      numeric(12,2) generated always as (quantity * purchase_price) stored
);

create index if not exists purchase_lines_purchase_idx on public.purchase_lines (purchase_id);
create index if not exists purchase_lines_product_idx  on public.purchase_lines (product_id);

create table if not exists public.purchase_payments (
  id          text primary key default public.app_id('pay'),
  purchase_id text not null references public.purchases (id) on delete cascade,
  amount      numeric(12,2) not null,
  date        timestamptz not null default now(),
  note        text,
  created_at  timestamptz not null default now()
);

create index if not exists purchase_payments_purchase_idx on public.purchase_payments (purchase_id);

drop trigger if exists trg_purchases_touch on public.purchases;
create trigger trg_purchases_touch before update on public.purchases
for each row execute function public.touch_updated_at();

-- ============================================================================
-- 06. SALES / POINT OF SALE
-- ============================================================================

create table if not exists public.sales (
  id          text primary key default public.app_id('sa'),
  reference   text not null,
  client_id   text references public.clients (id) on delete set null,
  client_name text not null default '',
  subtotal    numeric(12,2) not null default 0,
  discount    numeric(12,2) not null default 0,
  total       numeric(12,2) not null default 0,
  paid        numeric(12,2) not null default 0,
  date        timestamptz not null default now(),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists sales_date_idx   on public.sales (date desc);
create index if not exists sales_client_idx on public.sales (client_id);

create table if not exists public.sale_lines (
  id           bigserial primary key,
  sale_id      text not null references public.sales (id) on delete cascade,
  product_id   text references public.products (id) on delete set null,
  product_name text not null,
  barcode      text not null default '',
  quantity     integer not null check (quantity > 0),
  unit_price   numeric(12,2) not null default 0,
  -- purchase price captured at sale time => exact margin, even if prices move
  cost_price   numeric(12,2) not null default 0,
  line_total   numeric(12,2) generated always as (quantity * unit_price) stored
);

create index if not exists sale_lines_sale_idx    on public.sale_lines (sale_id);
create index if not exists sale_lines_product_idx on public.sale_lines (product_id);

create table if not exists public.sale_payments (
  id         text primary key default public.app_id('pay'),
  sale_id    text not null references public.sales (id) on delete cascade,
  amount     numeric(12,2) not null,
  date       timestamptz not null default now(),
  note       text,
  created_at timestamptz not null default now()
);

create index if not exists sale_payments_sale_idx on public.sale_payments (sale_id);

drop trigger if exists trg_sales_touch on public.sales;
create trigger trg_sales_touch before update on public.sales
for each row execute function public.touch_updated_at();

-- ============================================================================
-- 07. WORKERS
-- ============================================================================

create table if not exists public.workers (
  id            text primary key default public.app_id('w'),
  full_name     text not null,
  birth_date    date,
  id_card       text not null default '',
  phone         text not null default '',
  role          text not null default '',
  has_salary    boolean not null default true,
  salary_type   text not null default 'monthly' check (salary_type in ('monthly', 'daily')),
  salary_amount numeric(12,2) not null default 0,
  has_account   boolean not null default false,
  email         text not null default '',
  username      text not null default '',
  -- NOTE: no password column on purpose. Worker credentials live in
  -- auth.users (hashed) — see §13 create_worker_account().
  auth_user_id  uuid references auth.users (id) on delete set null,
  permissions   jsonb not null default '{}'::jsonb,
  start_date    timestamptz not null default now(),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists workers_active_idx on public.workers (active);

create table if not exists public.worker_advances (
  id          text primary key default public.app_id('adv'),
  worker_id   text not null references public.workers (id) on delete cascade,
  date        timestamptz not null default now(),
  description text not null default '',
  amount      numeric(12,2) not null default 0,
  deducted    boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.worker_absences (
  id          text primary key default public.app_id('abs'),
  worker_id   text not null references public.workers (id) on delete cascade,
  date        timestamptz not null default now(),
  description text not null default '',
  cost        numeric(12,2) not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.worker_payments (
  id                 text primary key default public.app_id('wp'),
  worker_id          text not null references public.workers (id) on delete cascade,
  period             text not null,                -- "2026-06"
  base_salary        numeric(12,2) not null default 0,
  absences_deducted  numeric(12,2) not null default 0,
  advances_deducted  numeric(12,2) not null default 0,
  amount             numeric(12,2) not null default 0,
  date               timestamptz not null default now(),
  note               text,
  created_at         timestamptz not null default now()
);

create index if not exists worker_advances_worker_idx on public.worker_advances (worker_id);
create index if not exists worker_absences_worker_idx on public.worker_absences (worker_id);
create index if not exists worker_payments_worker_idx on public.worker_payments (worker_id);

drop trigger if exists trg_workers_touch on public.workers;
create trigger trg_workers_touch before update on public.workers
for each row execute function public.touch_updated_at();

-- Keep the worker role list in sync with what is typed in the employee form
create or replace function public.register_worker_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.role, '') <> '' then
    insert into public.worker_roles (name) values (new.role) on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_workers_role on public.workers;
create trigger trg_workers_role after insert or update of role
on public.workers for each row execute function public.register_worker_role();

-- ============================================================================
-- 08. EXPENSES
-- ============================================================================

create table if not exists public.expenses (
  id          text primary key default public.app_id('e'),
  name        text not null,
  description text not null default '',
  amount      numeric(12,2) not null default 0,
  date        timestamptz not null default now(),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists expenses_date_idx on public.expenses (date desc);

drop trigger if exists trg_expenses_touch on public.expenses;
create trigger trg_expenses_touch before update on public.expenses
for each row execute function public.touch_updated_at();

-- ============================================================================
-- 09. CAISSE — manual cash movements
-- ============================================================================

create table if not exists public.caisse_transactions (
  id          text primary key default public.app_id('cx'),
  type        text not null check (type in ('deposit', 'withdrawal')),
  amount      numeric(12,2) not null check (amount >= 0),
  description text not null default '',
  date        timestamptz not null default now(),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists caisse_date_idx on public.caisse_transactions (date desc);

drop trigger if exists trg_caisse_touch on public.caisse_transactions;
create trigger trg_caisse_touch before update on public.caisse_transactions
for each row execute function public.touch_updated_at();

-- ============================================================================
-- 10. POS PHONE SCANNER — pair a phone camera with the cash register
-- ============================================================================
-- The cashier opens a session on the POS screen, a QR code is displayed,
-- the phone opens /scan/<session-id>, films the barcodes and each decode is
-- pushed here; the POS listens in realtime and drops the product in the cart.

create table if not exists public.scan_sessions (
  id         uuid primary key default gen_random_uuid(),
  label      text not null default 'POS',
  created_by uuid references public.profiles (id) on delete cascade,
  status     text not null default 'open' check (status in ('open', 'closed')),
  expires_at timestamptz not null default (now() + interval '2 hours'),
  created_at timestamptz not null default now()
);

create table if not exists public.scan_events (
  id         bigserial primary key,
  session_id uuid not null references public.scan_sessions (id) on delete cascade,
  barcode    text not null,
  product_id text references public.products (id) on delete set null,
  consumed   boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists scan_events_session_idx on public.scan_events (session_id, id);
create index if not exists scan_sessions_owner_idx on public.scan_sessions (created_by);

-- ============================================================================
-- 11. ACTIVITY LOG — traceability of every button action
-- ============================================================================

create table if not exists public.activity_log (
  id         bigserial primary key,
  user_id    uuid references public.profiles (id) on delete set null,
  user_name  text not null default '',
  module     text not null,           -- dashboard | stock | purchase | pos | ...
  action     text not null,           -- create | edit | delete | pay | print | view
  entity_id  text,
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_log_created_idx on public.activity_log (created_at desc);
create index if not exists activity_log_module_idx  on public.activity_log (module, action);

create or replace function public.log_action(
  p_module text,
  p_action text,
  p_entity_id text default null,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  select full_name into v_name from public.profiles where id = auth.uid();
  insert into public.activity_log (user_id, user_name, module, action, entity_id, details)
  values (auth.uid(), coalesce(v_name, 'system'), p_module, p_action, p_entity_id, coalesce(p_details, '{}'::jsonb));
end;
$$;

-- ============================================================================
-- 12. BUSINESS RPC — the SQL behind the buttons
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PURCHASE → "Enregistrer" in NewPurchaseModal.tsx
-- Atomically: create the purchase + its lines + the initial payment, then
-- for each line update the product => quantity += bought qty, and refresh
-- purchase price, sale price, min quantity and expiration date.
-- ---------------------------------------------------------------------------
create or replace function public.create_purchase(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id       text := coalesce(payload ->> 'id', public.app_id('pu'));
  v_ref      text := coalesce(payload ->> 'reference', '');
  v_line     jsonb;
  v_payment  jsonb;
  v_total    numeric(12,2) := 0;
begin
  if not public.is_member() then
    raise exception 'NOT_AUTHORIZED';
  end if;

  if v_ref = '' then
    select 'ACH-' || extract(year from now())::int || '-' ||
           lpad((count(*) + 1)::text, 3, '0')
      into v_ref
      from public.purchases;
  end if;

  select coalesce(sum((l ->> 'quantity')::numeric * (l ->> 'purchasePrice')::numeric), 0)
    into v_total
    from jsonb_array_elements(payload -> 'lines') l;

  insert into public.purchases (id, reference, supplier_id, supplier_name, total, paid, date, created_by)
  values (
    v_id,
    v_ref,
    nullif(payload ->> 'supplierId', ''),
    coalesce(payload ->> 'supplierName', ''),
    coalesce((payload ->> 'total')::numeric, v_total),
    coalesce((payload ->> 'paid')::numeric, 0),
    coalesce((payload ->> 'date')::timestamptz, now()),
    auth.uid()
  );

  for v_line in select * from jsonb_array_elements(payload -> 'lines')
  loop
    insert into public.purchase_lines (
      purchase_id, product_id, product_name, barcode, quantity,
      purchase_price, sale_price, min_quantity, has_expiration, expiration_date
    ) values (
      v_id,
      nullif(v_line ->> 'productId', ''),
      coalesce(v_line ->> 'productName', ''),
      coalesce(v_line ->> 'barcode', ''),
      (v_line ->> 'quantity')::int,
      coalesce((v_line ->> 'purchasePrice')::numeric, 0),
      coalesce((v_line ->> 'salePrice')::numeric, 0),
      coalesce((v_line ->> 'minQuantity')::int, 0),
      coalesce((v_line ->> 'hasExpiration')::boolean, false),
      nullif(v_line ->> 'expirationDate', '')::date
    );

    -- >>> the stock / pricing refresh asked by the purchase screen <<<
    update public.products p
       set quantity        = p.quantity + (v_line ->> 'quantity')::int,
           purchase_price  = coalesce((v_line ->> 'purchasePrice')::numeric, p.purchase_price),
           sale_price      = coalesce((v_line ->> 'salePrice')::numeric, p.sale_price),
           min_quantity    = coalesce((v_line ->> 'minQuantity')::int, p.min_quantity),
           has_expiration  = coalesce((v_line ->> 'hasExpiration')::boolean, p.has_expiration),
           expiration_date = case
                               when coalesce((v_line ->> 'hasExpiration')::boolean, false)
                                 then nullif(v_line ->> 'expirationDate', '')::date
                               when (v_line ->> 'hasExpiration') = 'false' then null
                               else p.expiration_date
                             end
     where p.id = v_line ->> 'productId';
  end loop;

  for v_payment in select * from jsonb_array_elements(coalesce(payload -> 'payments', '[]'::jsonb))
  loop
    insert into public.purchase_payments (id, purchase_id, amount, date, note)
    values (
      coalesce(v_payment ->> 'id', public.app_id('pay')),
      v_id,
      (v_payment ->> 'amount')::numeric,
      coalesce((v_payment ->> 'date')::timestamptz, now()),
      v_payment ->> 'note'
    )
    on conflict (id) do nothing;
  end loop;

  perform public.log_action('purchase', 'create', v_id, jsonb_build_object('reference', v_ref, 'total', v_total));

  return jsonb_build_object('id', v_id, 'reference', v_ref, 'total', v_total);
end;
$$;

-- PURCHASE → "Payer" (PaymentModal)
create or replace function public.add_purchase_payment(
  p_purchase_id text,
  p_amount numeric,
  p_date timestamptz default now(),
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_id text := public.app_id('pay');
begin
  if not public.is_member() then raise exception 'NOT_AUTHORIZED'; end if;

  insert into public.purchase_payments (id, purchase_id, amount, date, note)
  values (v_payment_id, p_purchase_id, p_amount, coalesce(p_date, now()), p_note);

  update public.purchases set paid = round(paid + p_amount, 2) where id = p_purchase_id;

  perform public.log_action('purchase', 'pay', p_purchase_id, jsonb_build_object('amount', p_amount));
  return jsonb_build_object('id', v_payment_id);
end;
$$;

-- PURCHASE → "Supprimer" : give the received quantities back
create or replace function public.delete_purchase(p_purchase_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_member() then raise exception 'NOT_AUTHORIZED'; end if;

  update public.products p
     set quantity = greatest(0, p.quantity - l.quantity)
    from public.purchase_lines l
   where l.purchase_id = p_purchase_id and l.product_id = p.id;

  delete from public.purchases where id = p_purchase_id;
  perform public.log_action('purchase', 'delete', p_purchase_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- SALE → "Valider la vente" in POSPage.tsx
-- Atomically: create the sale + lines (with the cost price snapshot) + the
-- cash-in, then decrement the stock of every product sold.
-- ---------------------------------------------------------------------------
create or replace function public.create_sale(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id      text := coalesce(payload ->> 'id', public.app_id('sa'));
  v_ref     text := coalesce(payload ->> 'reference', '');
  v_line    jsonb;
  v_payment jsonb;
  v_cost    numeric(12,2);
begin
  if not public.is_member() then raise exception 'NOT_AUTHORIZED'; end if;

  if v_ref = '' then
    select 'VTE-' || extract(year from now())::int || '-' ||
           lpad((count(*) + 1)::text, 3, '0')
      into v_ref
      from public.sales;
  end if;

  insert into public.sales (id, reference, client_id, client_name, subtotal, discount, total, paid, date, created_by)
  values (
    v_id,
    v_ref,
    nullif(payload ->> 'clientId', ''),
    coalesce(payload ->> 'clientName', ''),
    coalesce((payload ->> 'subtotal')::numeric, 0),
    coalesce((payload ->> 'discount')::numeric, 0),
    coalesce((payload ->> 'total')::numeric, 0),
    coalesce((payload ->> 'paid')::numeric, 0),
    coalesce((payload ->> 'date')::timestamptz, now()),
    auth.uid()
  );

  for v_line in select * from jsonb_array_elements(payload -> 'lines')
  loop
    select purchase_price into v_cost from public.products where id = v_line ->> 'productId';

    insert into public.sale_lines (sale_id, product_id, product_name, barcode, quantity, unit_price, cost_price)
    values (
      v_id,
      nullif(v_line ->> 'productId', ''),
      coalesce(v_line ->> 'productName', ''),
      coalesce(v_line ->> 'barcode', ''),
      (v_line ->> 'quantity')::int,
      coalesce((v_line ->> 'unitPrice')::numeric, 0),
      coalesce(v_cost, 0)
    );

    -- >>> stock decrement <<<
    update public.products
       set quantity = greatest(0, quantity - (v_line ->> 'quantity')::int)
     where id = v_line ->> 'productId';
  end loop;

  for v_payment in select * from jsonb_array_elements(coalesce(payload -> 'payments', '[]'::jsonb))
  loop
    insert into public.sale_payments (id, sale_id, amount, date, note)
    values (
      coalesce(v_payment ->> 'id', public.app_id('pay')),
      v_id,
      (v_payment ->> 'amount')::numeric,
      coalesce((v_payment ->> 'date')::timestamptz, now()),
      v_payment ->> 'note'
    )
    on conflict (id) do nothing;
  end loop;

  perform public.log_action('pos', 'create', v_id, jsonb_build_object('reference', v_ref, 'total', payload ->> 'total'));

  return jsonb_build_object('id', v_id, 'reference', v_ref);
end;
$$;

-- SALE → "Payer" (client debt settlement)
create or replace function public.add_sale_payment(
  p_sale_id text,
  p_amount numeric,
  p_date timestamptz default now(),
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_id text := public.app_id('pay');
begin
  if not public.is_member() then raise exception 'NOT_AUTHORIZED'; end if;

  insert into public.sale_payments (id, sale_id, amount, date, note)
  values (v_payment_id, p_sale_id, p_amount, coalesce(p_date, now()), p_note);

  update public.sales set paid = round(paid + p_amount, 2) where id = p_sale_id;

  perform public.log_action('sales', 'pay', p_sale_id, jsonb_build_object('amount', p_amount));
  return jsonb_build_object('id', v_payment_id);
end;
$$;

-- SALE → "Supprimer" : put the sold quantities back in stock
create or replace function public.delete_sale(p_sale_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_member() then raise exception 'NOT_AUTHORIZED'; end if;

  update public.products p
     set quantity = p.quantity + l.quantity
    from public.sale_lines l
   where l.sale_id = p_sale_id and l.product_id = p.id;

  delete from public.sales where id = p_sale_id;
  perform public.log_action('sales', 'delete', p_sale_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- WORKERS → acomptes / absences / salaire / permissions
-- ---------------------------------------------------------------------------
create or replace function public.add_worker_advance(
  p_worker_id text, p_amount numeric, p_description text default '', p_date timestamptz default now()
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_id text := public.app_id('adv');
begin
  if not public.is_member() then raise exception 'NOT_AUTHORIZED'; end if;
  insert into public.worker_advances (id, worker_id, date, description, amount)
  values (v_id, p_worker_id, coalesce(p_date, now()), coalesce(p_description, ''), p_amount);
  perform public.log_action('workers', 'create', p_worker_id, jsonb_build_object('advance', p_amount));
  return v_id;
end;
$$;

create or replace function public.add_worker_absence(
  p_worker_id text, p_cost numeric, p_description text default '', p_date timestamptz default now()
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_id text := public.app_id('abs');
begin
  if not public.is_member() then raise exception 'NOT_AUTHORIZED'; end if;
  insert into public.worker_absences (id, worker_id, date, description, cost)
  values (v_id, p_worker_id, coalesce(p_date, now()), coalesce(p_description, ''), p_cost);
  perform public.log_action('workers', 'create', p_worker_id, jsonb_build_object('absence', p_cost));
  return v_id;
end;
$$;

-- "Payer le salaire" : records the payslip and flags the advances as deducted
create or replace function public.pay_worker_salary(
  p_worker_id text,
  p_period text,
  p_base_salary numeric,
  p_absences_deducted numeric,
  p_advances_deducted numeric,
  p_amount numeric,
  p_date timestamptz default now(),
  p_note text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_id text := public.app_id('wp');
begin
  if not public.is_member() then raise exception 'NOT_AUTHORIZED'; end if;

  insert into public.worker_payments (
    id, worker_id, period, base_salary, absences_deducted, advances_deducted, amount, date, note
  ) values (
    v_id, p_worker_id, p_period, p_base_salary, p_absences_deducted, p_advances_deducted,
    p_amount, coalesce(p_date, now()), p_note
  );

  update public.worker_advances set deducted = true where worker_id = p_worker_id and not deducted;

  perform public.log_action('workers', 'pay', p_worker_id, jsonb_build_object('period', p_period, 'amount', p_amount));
  return v_id;
end;
$$;

create or replace function public.set_worker_permissions(p_worker_id text, p_permissions jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  update public.workers set permissions = coalesce(p_permissions, '{}'::jsonb) where id = p_worker_id;
  update public.profiles set permissions = coalesce(p_permissions, '{}'::jsonb) where worker_id = p_worker_id;
  perform public.log_action('workers', 'edit', p_worker_id, jsonb_build_object('permissions', true));
end;
$$;

-- ---------------------------------------------------------------------------
-- POS PHONE SCANNER RPC
-- ---------------------------------------------------------------------------

-- POS: "Scanner avec mon téléphone" → opens a pairing session
create or replace function public.open_scan_session(p_label text default 'POS')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.is_member() then raise exception 'NOT_AUTHORIZED'; end if;

  -- one live session per cashier: close the previous ones
  update public.scan_sessions set status = 'closed'
   where created_by = auth.uid() and status = 'open';

  insert into public.scan_sessions (label, created_by)
  values (coalesce(p_label, 'POS'), auth.uid())
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'expires_at', now() + interval '2 hours');
end;
$$;

create or replace function public.close_scan_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.scan_sessions set status = 'closed'
   where id = p_session_id and (created_by = auth.uid() or public.is_admin());
end;
$$;

-- PHONE (anonymous): checks the QR code is still valid before opening the camera
create or replace function public.scan_session_info(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v jsonb;
begin
  select jsonb_build_object(
           'id', s.id,
           'label', s.label,
           'valid', (s.status = 'open' and s.expires_at > now()),
           'expires_at', s.expires_at,
           'shop', coalesce((select name from public.store_settings where id = 1), 'Belle Cosmétiques')
         )
    into v
    from public.scan_sessions s
   where s.id = p_session_id;

  return coalesce(v, jsonb_build_object('valid', false));
end;
$$;

-- PHONE (anonymous): pushes a decoded barcode to the paired cash register.
-- Returns the matching product so the phone can display instant feedback.
create or replace function public.push_scan(p_session_id uuid, p_barcode text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok      boolean;
  v_product public.products%rowtype;
begin
  select (status = 'open' and expires_at > now()) into v_ok
    from public.scan_sessions where id = p_session_id;

  if not coalesce(v_ok, false) then
    return jsonb_build_object('ok', false, 'reason', 'SESSION_CLOSED');
  end if;

  select * into v_product from public.products
   where barcode = p_barcode
   limit 1;

  insert into public.scan_events (session_id, barcode, product_id)
  values (p_session_id, p_barcode, v_product.id);

  return jsonb_build_object(
    'ok', true,
    'found', v_product.id is not null,
    'product', case when v_product.id is null then null else jsonb_build_object(
      'id', v_product.id,
      'name', v_product.name,
      'salePrice', v_product.sale_price,
      'quantity', v_product.quantity
    ) end
  );
end;
$$;

-- POS: polling fallback when websockets are blocked on the network
create or replace function public.pull_scans(p_session_id uuid, p_after bigint default 0)
returns setof public.scan_events
language sql
security definer
set search_path = public
as $$
  select e.* from public.scan_events e
   join public.scan_sessions s on s.id = e.session_id
  where e.session_id = p_session_id
    and e.id > coalesce(p_after, 0)
    and (s.created_by = auth.uid() or public.is_admin())
  order by e.id asc;
$$;

-- ============================================================================
-- 13. AUTH RPC — real accounts inside auth.users
-- ============================================================================
-- These functions insert directly into auth.users / auth.identities with a
-- bcrypt-hashed password, so the created admin and the created workers can
-- sign in immediately with supabase.auth.signInWithPassword().

-- Login screen: should the "Créer un compte Admin" button be shown?
create or replace function public.admin_exists()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where role = 'admin');
$$;

-- Login screen: allows signing in with a username instead of an email
create or replace function public.resolve_login_email(p_identifier text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_identifier like '%@%' then lower(trim(p_identifier))
    else (
      select p.email from public.profiles p
       where lower(p.username) = lower(trim(p_identifier))
       limit 1
    )
  end;
$$;

-- Internal: create (or update) an account inside auth.users
create or replace function public.upsert_auth_user(
  p_email text,
  p_password text,
  p_full_name text,
  p_meta jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_uid   uuid;
  v_email text := lower(trim(p_email));
begin
  if v_email is null or v_email = '' then raise exception 'EMAIL_REQUIRED'; end if;
  if p_password is null or length(p_password) < 4 then raise exception 'PASSWORD_TOO_SHORT'; end if;

  select id into v_uid from auth.users where lower(email) = v_email;

  if v_uid is not null then
    -- existing account: just refresh the password / metadata
    update auth.users
       set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
           raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                                || jsonb_build_object('full_name', p_full_name)
                                || coalesce(p_meta, '{}'::jsonb),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           updated_at         = now()
     where id = v_uid;
    return v_uid;
  end if;

  v_uid := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, invited_at, confirmation_token, confirmation_sent_at,
    recovery_token, email_change_token_new, email_change,
    last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    is_super_admin, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_uid,
    'authenticated',
    'authenticated',
    v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(), null, '', null, '', '', '', null,
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p_full_name, 'email_verified', true) || coalesce(p_meta, '{}'::jsonb),
    false, now(), now()
  );

  insert into auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    v_uid::text,
    v_uid,
    jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    'email',
    now(), now(), now()
  );

  return v_uid;
end;
$$;

revoke all on function public.upsert_auth_user(text, text, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- LOGIN PAGE → "Créer mon compte Admin"
-- Callable anonymously, but ONLY while no administrator exists. As soon as the
-- admin is created the function refuses every further call and admin_exists()
-- makes the button disappear from the login screen.
-- ---------------------------------------------------------------------------
create or replace function public.create_admin_account(
  p_full_name text,
  p_username  text,
  p_email     text,
  p_password  text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_uid uuid;
begin
  if exists (select 1 from public.profiles where role = 'admin') then
    raise exception 'ADMIN_ALREADY_EXISTS';
  end if;

  v_uid := public.upsert_auth_user(
    p_email, p_password, p_full_name,
    jsonb_build_object('role', 'admin', 'username', p_username)
  );

  insert into public.profiles (id, full_name, username, email, role, job_title, permissions, active)
  values (
    v_uid, coalesce(p_full_name, ''), nullif(p_username, ''), lower(trim(p_email)),
    'admin', 'Administrateur', '"ALL"'::jsonb, true
  )
  on conflict (id) do update
     set full_name = excluded.full_name,
         username  = excluded.username,
         role      = 'admin',
         permissions = '"ALL"'::jsonb,
         active    = true;

  insert into public.store_settings (id) values (1) on conflict (id) do nothing;

  perform public.log_action('settings', 'create', v_uid::text, jsonb_build_object('admin', p_email));

  return jsonb_build_object('id', v_uid, 'email', lower(trim(p_email)), 'role', 'admin');
end;
$$;

-- ---------------------------------------------------------------------------
-- EMPLOYEE FORM → "Compte de connexion" (has_account + email + password)
-- Creates the worker login inside auth.users so the employee signs in directly
-- with the permissions granted by the admin.
-- ---------------------------------------------------------------------------
create or replace function public.create_worker_account(
  p_worker_id   text,
  p_email       text,
  p_password    text,
  p_full_name   text default null,
  p_username    text default null,
  p_permissions jsonb default null,
  p_job_title   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_uid    uuid;
  v_worker public.workers%rowtype;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;

  select * into v_worker from public.workers where id = p_worker_id;
  if v_worker.id is null then raise exception 'WORKER_NOT_FOUND'; end if;

  v_uid := public.upsert_auth_user(
    p_email,
    p_password,
    coalesce(p_full_name, v_worker.full_name),
    jsonb_build_object('role', 'worker', 'worker_id', p_worker_id, 'username', coalesce(p_username, v_worker.username))
  );

  insert into public.profiles (id, full_name, username, email, role, job_title, permissions, worker_id, active)
  values (
    v_uid,
    coalesce(p_full_name, v_worker.full_name),
    nullif(coalesce(p_username, v_worker.username), ''),
    lower(trim(p_email)),
    'worker',
    coalesce(p_job_title, v_worker.role, ''),
    coalesce(p_permissions, v_worker.permissions, '{}'::jsonb),
    p_worker_id,
    v_worker.active
  )
  on conflict (id) do update
     set full_name   = excluded.full_name,
         username    = excluded.username,
         email       = excluded.email,
         job_title   = excluded.job_title,
         permissions = excluded.permissions,
         worker_id   = excluded.worker_id,
         active      = excluded.active;

  update public.workers
     set has_account  = true,
         auth_user_id = v_uid,
         email        = lower(trim(p_email)),
         username     = coalesce(p_username, username),
         permissions  = coalesce(p_permissions, permissions)
   where id = p_worker_id;

  perform public.log_action('workers', 'create', p_worker_id, jsonb_build_object('account', p_email));

  return jsonb_build_object('id', v_uid, 'email', lower(trim(p_email)), 'worker_id', p_worker_id);
end;
$$;

-- Employee form → unticking "Compte de connexion"
create or replace function public.disable_worker_account(p_worker_id text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_uid uuid;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  select auth_user_id into v_uid from public.workers where id = p_worker_id;
  if v_uid is not null then
    update public.profiles set active = false where id = v_uid;
    delete from auth.users where id = v_uid;
  end if;
  update public.workers set has_account = false, auth_user_id = null where id = p_worker_id;
  perform public.log_action('workers', 'delete', p_worker_id, jsonb_build_object('account', true));
end;
$$;

-- Settings → "Mon compte" (change my own password)
create or replace function public.change_my_password(p_password text)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHORIZED'; end if;
  if length(coalesce(p_password, '')) < 4 then raise exception 'PASSWORD_TOO_SHORT'; end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = auth.uid();
end;
$$;

-- Bootstrap helper (SQL Editor only): recreate the admin from scratch.
--   select public.reset_admin('Youssef', 'admin', 'admin@belle-cosmetiques.com', 'demo2024');
create or replace function public.reset_admin(
  p_full_name text, p_username text, p_email text, p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare v_uid uuid;
begin
  v_uid := public.upsert_auth_user(p_email, p_password, p_full_name,
                                   jsonb_build_object('role', 'admin', 'username', p_username));
  insert into public.profiles (id, full_name, username, email, role, job_title, permissions, active)
  values (v_uid, p_full_name, nullif(p_username, ''), lower(trim(p_email)), 'admin', 'Administrateur', '"ALL"'::jsonb, true)
  on conflict (id) do update
     set full_name = excluded.full_name, username = excluded.username,
         role = 'admin', permissions = '"ALL"'::jsonb, active = true;
  return jsonb_build_object('id', v_uid, 'email', lower(trim(p_email)));
end;
$$;

revoke all on function public.reset_admin(text, text, text, text) from public, anon, authenticated;

-- Fallback (SQL Editor only) — use it if your project forbids writing into
-- auth.users from SQL: create the user from Dashboard → Authentication →
-- "Add user" (tick "Auto Confirm"), then run:
--   select public.link_existing_admin('admin@belle-cosmetiques.com', 'Youssef', 'admin');
-- The login screen then behaves exactly the same (button hidden, direct login).
create or replace function public.link_existing_admin(
  p_email text, p_full_name text default null, p_username text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_uid uuid;
begin
  select id into v_uid from auth.users where lower(email) = lower(trim(p_email));
  if v_uid is null then raise exception 'AUTH_USER_NOT_FOUND'; end if;

  insert into public.profiles (id, full_name, username, email, role, job_title, permissions, active)
  values (v_uid, coalesce(p_full_name, p_email), nullif(p_username, ''), lower(trim(p_email)),
          'admin', 'Administrateur', '"ALL"'::jsonb, true)
  on conflict (id) do update
     set role = 'admin', permissions = '"ALL"'::jsonb, active = true,
         full_name = excluded.full_name;

  insert into public.store_settings (id) values (1) on conflict (id) do nothing;
  return jsonb_build_object('id', v_uid, 'email', lower(trim(p_email)));
end;
$$;

revoke all on function public.link_existing_admin(text, text, text) from public, anon, authenticated;

-- ============================================================================
-- 14. VIEWS — Dashboard, Caisse & Reports
-- ============================================================================

-- ---- Stock -----------------------------------------------------------------
create or replace view public.v_stock_alerts as
select p.*, (p.quantity <= p.min_quantity) as is_low, (p.quantity = 0) as is_out
  from public.products p
 where p.quantity <= p.min_quantity;

create or replace view public.v_expiring_products as
select p.*,
       (p.expiration_date - current_date) as days_left,
       case
         when p.expiration_date < current_date then 'expired'
         when p.expiration_date <= current_date + 30 then 'soon'
         else 'ok'
       end as expiry_status
  from public.products p
 where p.has_expiration and p.expiration_date is not null;

create or replace view public.v_stock_value as
select count(*)                                        as products_count,
       coalesce(sum(quantity), 0)                      as units_in_stock,
       coalesce(sum(quantity * purchase_price), 0)     as stock_cost_value,
       coalesce(sum(quantity * sale_price), 0)         as stock_sale_value,
       coalesce(sum(quantity * (sale_price - purchase_price)), 0) as potential_margin
  from public.products;

-- ---- Sales analysis (Reports → "Analyse des ventes") -----------------------
create or replace view public.v_product_sales_stats as
select p.id                                              as product_id,
       p.name                                            as product_name,
       p.barcode,
       p.brand,
       p.category,
       p.quantity                                        as stock_left,
       p.purchase_price,
       p.sale_price,
       coalesce(sum(l.quantity), 0)                      as units_sold,
       coalesce(sum(l.line_total), 0)                    as revenue,
       coalesce(sum(l.quantity * l.cost_price), 0)       as cogs,
       coalesce(sum(l.line_total - l.quantity * l.cost_price), 0) as gross_margin,
       case when coalesce(sum(l.line_total), 0) = 0 then 0
            else round(100 * sum(l.line_total - l.quantity * l.cost_price) / sum(l.line_total), 2)
       end                                               as margin_rate,
       count(distinct l.sale_id)                         as sales_count,
       max(s.date)                                       as last_sold_at
  from public.products p
  left join public.sale_lines l on l.product_id = p.id
  left join public.sales s      on s.id = l.sale_id
 group by p.id, p.name, p.barcode, p.brand, p.category, p.quantity, p.purchase_price, p.sale_price;

-- best sellers  : select * from v_product_sales_stats order by units_sold desc limit 10;
-- slow movers   : select * from v_product_sales_stats order by units_sold asc  limit 10;

create or replace view public.v_product_purchase_stats as
select p.id                                   as product_id,
       p.name                                 as product_name,
       p.category,
       coalesce(sum(l.quantity), 0)           as units_purchased,
       coalesce(sum(l.line_total), 0)         as purchase_amount,
       count(distinct l.purchase_id)          as purchases_count,
       max(pu.date)                           as last_purchased_at
  from public.products p
  left join public.purchase_lines l on l.product_id = p.id
  left join public.purchases pu     on pu.id = l.purchase_id
 group by p.id, p.name, p.category;

-- ---- Per-category totals (Caisse & Reports) -------------------------------
create or replace view public.v_category_stats as
select coalesce(nullif(p.category, ''), 'Sans catégorie')      as category,
       count(distinct p.id)                                    as products_count,
       coalesce(sum(p.quantity), 0)                            as units_in_stock,
       coalesce(sum(p.quantity * p.purchase_price), 0)         as stock_value,
       coalesce(max(sold.units_sold), 0)                       as units_sold,
       coalesce(max(sold.revenue), 0)                          as total_sales,
       coalesce(max(sold.cogs), 0)                             as cost_of_sales,
       coalesce(max(sold.revenue), 0) - coalesce(max(sold.cogs), 0) as gross_gain,
       coalesce(max(bought.units_purchased), 0)                as units_purchased,
       coalesce(max(bought.purchase_amount), 0)                as total_purchases
  from public.products p
  left join lateral (
      select sum(l.quantity)                        as units_sold,
             sum(l.line_total)                      as revenue,
             sum(l.quantity * l.cost_price)         as cogs
        from public.sale_lines l
        join public.products p2 on p2.id = l.product_id
       where coalesce(nullif(p2.category, ''), 'Sans catégorie') = coalesce(nullif(p.category, ''), 'Sans catégorie')
  ) sold on true
  left join lateral (
      select sum(l.quantity)   as units_purchased,
             sum(l.line_total) as purchase_amount
        from public.purchase_lines l
        join public.products p3 on p3.id = l.product_id
       where coalesce(nullif(p3.category, ''), 'Sans catégorie') = coalesce(nullif(p.category, ''), 'Sans catégorie')
  ) bought on true
 group by coalesce(nullif(p.category, ''), 'Sans catégorie');

create or replace view public.v_brand_stats as
select coalesce(nullif(p.brand, ''), 'Sans marque') as brand,
       count(distinct p.id)                         as products_count,
       coalesce(sum(l.quantity), 0)                 as units_sold,
       coalesce(sum(l.line_total), 0)               as revenue,
       coalesce(sum(l.line_total - l.quantity * l.cost_price), 0) as gross_margin
  from public.products p
  left join public.sale_lines l on l.product_id = p.id
 group by coalesce(nullif(p.brand, ''), 'Sans marque');

-- ---- Caisse : one unified ledger of every cash movement --------------------
create or replace view public.v_caisse_ledger as
  -- money in : sale cash-ins
  select sp.id                              as id,
         'sale_payment'                     as source,
         'in'                               as direction,
         sp.date                            as date,
         sp.amount                          as amount,
         coalesce(s.reference, '')          as reference,
         coalesce(nullif(s.client_name, ''), 'Client de passage') as label,
         'pos'                              as module,
         s.id                               as entity_id
    from public.sale_payments sp
    join public.sales s on s.id = sp.sale_id
union all
  -- money out : supplier payments
  select pp.id, 'purchase_payment', 'out', pp.date, pp.amount,
         coalesce(pu.reference, ''), coalesce(nullif(pu.supplier_name, ''), 'Fournisseur'),
         'purchase', pu.id
    from public.purchase_payments pp
    join public.purchases pu on pu.id = pp.purchase_id
union all
  -- money out : expenses
  select e.id, 'expense', 'out', e.date, e.amount, '', e.name, 'expenses', e.id
    from public.expenses e
union all
  -- money out : worker salaries
  select wp.id, 'worker_salary', 'out', wp.date, wp.amount, wp.period, w.full_name, 'workers', w.id
    from public.worker_payments wp
    join public.workers w on w.id = wp.worker_id
union all
  -- money out : worker advances (acomptes)
  select wa.id, 'worker_advance', 'out', wa.date, wa.amount,
         coalesce(wa.description, ''), w.full_name, 'workers', w.id
    from public.worker_advances wa
    join public.workers w on w.id = wa.worker_id
union all
  -- manual movements registered in the Caisse screen
  select ct.id, 'manual', case when ct.type = 'deposit' then 'in' else 'out' end,
         ct.date, ct.amount, '', ct.description, 'caisse', ct.id
    from public.caisse_transactions ct;

create or replace view public.v_caisse_balance as
select coalesce(sum(case when direction = 'in'  then amount else 0 end), 0) as total_in,
       coalesce(sum(case when direction = 'out' then amount else 0 end), 0) as total_out,
       coalesce(sum(case when direction = 'in'  then amount else -amount end), 0) as balance
  from public.v_caisse_ledger;

create or replace view public.v_caisse_daily as
select date_trunc('day', date)::date as day,
       sum(case when direction = 'in'  then amount else 0 end) as cash_in,
       sum(case when direction = 'out' then amount else 0 end) as cash_out,
       sum(case when direction = 'in'  then amount else -amount end) as net
  from public.v_caisse_ledger
 group by 1
 order by 1 desc;

-- ---- Debts -----------------------------------------------------------------
create or replace view public.v_client_debts as
select c.id, c.name, c.phone,
       count(s.id)                                          as sales_count,
       coalesce(sum(s.total), 0)                            as total_bought,
       coalesce(sum(s.paid), 0)                             as total_paid,
       coalesce(sum(s.total - s.paid), 0)                   as debt
  from public.clients c
  left join public.sales s on s.client_id = c.id
 group by c.id, c.name, c.phone;

create or replace view public.v_supplier_debts as
select sp.id, sp.name, sp.phone,
       count(pu.id)                          as purchases_count,
       coalesce(sum(pu.total), 0)            as total_purchased,
       coalesce(sum(pu.paid), 0)             as total_paid,
       coalesce(sum(pu.total - pu.paid), 0)  as debt
  from public.suppliers sp
  left join public.purchases pu on pu.supplier_id = sp.id
 group by sp.id, sp.name, sp.phone;

-- ---- Dashboard & reports ---------------------------------------------------
create or replace view public.v_monthly_revenue as
select to_char(date_trunc('month', s.date), 'YYYY-MM')      as month,
       count(*)                                             as sales_count,
       coalesce(sum(s.total), 0)                            as revenue,
       coalesce(sum(s.paid), 0)                             as cashed_in
  from public.sales s
 group by 1
 order by 1;

create or replace view public.v_dashboard_kpis as
select
  (select coalesce(sum(total), 0) from public.sales)                       as sales_total,
  (select coalesce(sum(paid), 0) from public.sales)                        as sales_cashed,
  (select coalesce(sum(total - paid), 0) from public.sales)                as client_debt,
  (select coalesce(sum(total), 0) from public.purchases)                   as purchases_total,
  (select coalesce(sum(total - paid), 0) from public.purchases)            as supplier_debt,
  (select coalesce(sum(amount), 0) from public.expenses)                   as expenses_total,
  (select coalesce(sum(amount), 0) from public.worker_payments)            as salaries_total,
  (select coalesce(sum(amount), 0) from public.worker_advances)            as advances_total,
  (select count(*) from public.products)                                   as products_count,
  (select count(*) from public.v_stock_alerts)                             as low_stock_count,
  (select count(*) from public.v_expiring_products where expiry_status = 'soon')    as expiring_soon_count,
  (select count(*) from public.v_expiring_products where expiry_status = 'expired') as expired_count,
  (select count(*) from public.clients)                                    as clients_count,
  (select count(*) from public.suppliers)                                  as suppliers_count,
  (select count(*) from public.workers where active)                       as workers_count,
  (select balance from public.v_caisse_balance)                            as caisse_balance,
  (select coalesce(sum(l.quantity * l.cost_price), 0) from public.sale_lines l) as cogs,
  -- margin computed on the invoiced total (discounts included), exactly like
  -- period_summary() so the Dashboard and the Reports screen never disagree
  (select coalesce(sum(total), 0) from public.sales)
    - (select coalesce(sum(l.quantity * l.cost_price), 0) from public.sale_lines l) as gross_margin;

-- Period summary used by the Reports screen (pass the dates from the UI):
--   select * from period_summary('2026-01-01', '2026-12-31');
create or replace function public.period_summary(p_from timestamptz, p_to timestamptz)
returns table (
  sales_count      bigint,
  revenue          numeric,
  cashed_in        numeric,
  discounts        numeric,
  cogs             numeric,
  gross_margin     numeric,
  margin_rate      numeric,
  avg_basket       numeric,
  units_sold       bigint,
  purchases_count  bigint,
  purchases_amount numeric,
  expenses_amount  numeric,
  salaries_amount  numeric,
  advances_amount  numeric,
  net_result       numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with s as (
    select count(*) c, coalesce(sum(total), 0) rev, coalesce(sum(paid), 0) cash,
           coalesce(sum(discount), 0) disc
      from public.sales where date between p_from and p_to
  ),
  l as (
    select coalesce(sum(sl.quantity), 0) units,
           coalesce(sum(sl.quantity * sl.cost_price), 0) cogs
      from public.sale_lines sl join public.sales sa on sa.id = sl.sale_id
     where sa.date between p_from and p_to
  ),
  pu as (
    select count(*) c, coalesce(sum(total), 0) amt
      from public.purchases where date between p_from and p_to
  ),
  ex as (select coalesce(sum(amount), 0) amt from public.expenses where date between p_from and p_to),
  wp as (select coalesce(sum(amount), 0) amt from public.worker_payments where date between p_from and p_to),
  wa as (select coalesce(sum(amount), 0) amt from public.worker_advances where date between p_from and p_to)
  select s.c,
         s.rev,
         s.cash,
         s.disc,
         l.cogs,
         s.rev - l.cogs,
         case when s.rev = 0 then 0 else round(100 * (s.rev - l.cogs) / s.rev, 2) end,
         case when s.c = 0 then 0 else round(s.rev / s.c, 2) end,
         l.units,
         pu.c,
         pu.amt,
         ex.amt,
         wp.amt,
         wa.amt,
         (s.rev - l.cogs) - ex.amt - wp.amt - wa.amt
    from s, l, pu, ex, wp, wa;
$$;

-- ============================================================================
-- 15. ROW LEVEL SECURITY
-- ============================================================================

alter table public.profiles            enable row level security;
alter table public.brands              enable row level security;
alter table public.categories          enable row level security;
alter table public.worker_roles        enable row level security;
alter table public.store_settings      enable row level security;
alter table public.products            enable row level security;
alter table public.suppliers           enable row level security;
alter table public.clients             enable row level security;
alter table public.purchases           enable row level security;
alter table public.purchase_lines      enable row level security;
alter table public.purchase_payments   enable row level security;
alter table public.sales               enable row level security;
alter table public.sale_lines          enable row level security;
alter table public.sale_payments       enable row level security;
alter table public.workers             enable row level security;
alter table public.worker_advances     enable row level security;
alter table public.worker_absences     enable row level security;
alter table public.worker_payments     enable row level security;
alter table public.expenses            enable row level security;
alter table public.caisse_transactions enable row level security;
alter table public.scan_sessions       enable row level security;
alter table public.scan_events         enable row level security;
alter table public.activity_log        enable row level security;

-- Shared shop data: every signed-in member of the shop works on the same data.
do $$
declare
  tbl text;
  shared_tables text[] := array[
    'brands', 'categories', 'worker_roles', 'products', 'suppliers', 'clients',
    'purchases', 'purchase_lines', 'purchase_payments',
    'sales', 'sale_lines', 'sale_payments',
    'workers', 'worker_advances', 'worker_absences', 'worker_payments',
    'expenses', 'caisse_transactions', 'store_settings'
  ];
begin
  foreach tbl in array shared_tables loop
    execute format('drop policy if exists %I on public.%I', tbl || '_member_all', tbl);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      tbl || '_member_all', tbl
    );
  end loop;
end $$;

-- Profiles: everyone reads the directory, you edit yourself, admin edits all.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Scan sessions / events: only the cashier who opened the session (or an admin)
-- can read them. The phone never touches the tables directly, it only calls the
-- SECURITY DEFINER function push_scan().
drop policy if exists scan_sessions_owner on public.scan_sessions;
create policy scan_sessions_owner on public.scan_sessions
  for all to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());

drop policy if exists scan_events_owner on public.scan_events;
create policy scan_events_owner on public.scan_events
  for select to authenticated
  using (exists (
    select 1 from public.scan_sessions s
     where s.id = scan_events.session_id
       and (s.created_by = auth.uid() or public.is_admin())
  ));

drop policy if exists scan_events_update on public.scan_events;
create policy scan_events_update on public.scan_events
  for update to authenticated
  using (exists (
    select 1 from public.scan_sessions s
     where s.id = scan_events.session_id and s.created_by = auth.uid()
  ))
  with check (true);

-- Activity log: readable by admins, written through log_action()
drop policy if exists activity_log_admin_read on public.activity_log;
create policy activity_log_admin_read on public.activity_log
  for select to authenticated using (public.is_admin() or user_id = auth.uid());

-- ---- Function grants -------------------------------------------------------
-- Anonymous (login screen + phone scanner page)
grant execute on function public.admin_exists()                              to anon, authenticated;
grant execute on function public.resolve_login_email(text)                   to anon, authenticated;
grant execute on function public.create_admin_account(text, text, text, text) to anon, authenticated;
grant execute on function public.scan_session_info(uuid)                     to anon, authenticated;
grant execute on function public.push_scan(uuid, text)                       to anon, authenticated;

-- Signed-in members
grant execute on function public.create_purchase(jsonb)                          to authenticated;
grant execute on function public.add_purchase_payment(text, numeric, timestamptz, text) to authenticated;
grant execute on function public.delete_purchase(text)                           to authenticated;
grant execute on function public.create_sale(jsonb)                              to authenticated;
grant execute on function public.add_sale_payment(text, numeric, timestamptz, text) to authenticated;
grant execute on function public.delete_sale(text)                               to authenticated;
grant execute on function public.add_worker_advance(text, numeric, text, timestamptz) to authenticated;
grant execute on function public.add_worker_absence(text, numeric, text, timestamptz) to authenticated;
grant execute on function public.pay_worker_salary(text, text, numeric, numeric, numeric, numeric, timestamptz, text) to authenticated;
grant execute on function public.set_worker_permissions(text, jsonb)             to authenticated;
grant execute on function public.create_worker_account(text, text, text, text, text, jsonb, text) to authenticated;
grant execute on function public.disable_worker_account(text)                    to authenticated;
grant execute on function public.change_my_password(text)                        to authenticated;
grant execute on function public.open_scan_session(text)                         to authenticated;
grant execute on function public.close_scan_session(uuid)                        to authenticated;
grant execute on function public.pull_scans(uuid, bigint)                        to authenticated;
grant execute on function public.log_action(text, text, text, jsonb)             to authenticated;
grant execute on function public.period_summary(timestamptz, timestamptz)        to authenticated;
grant execute on function public.is_admin()                                      to authenticated;
grant execute on function public.is_member()                                     to authenticated;

-- Views inherit the RLS of their base tables (security_invoker) so a worker
-- only sees what their policies allow.
do $$
declare v text;
begin
  foreach v in array array[
    'v_stock_alerts', 'v_expiring_products', 'v_stock_value',
    'v_product_sales_stats', 'v_product_purchase_stats',
    'v_category_stats', 'v_brand_stats',
    'v_caisse_ledger', 'v_caisse_balance', 'v_caisse_daily',
    'v_client_debts', 'v_supplier_debts',
    'v_monthly_revenue', 'v_dashboard_kpis'
  ] loop
    execute format('alter view public.%I set (security_invoker = on)', v);
    execute format('grant select on public.%I to authenticated', v);
  end loop;
end $$;

-- ============================================================================
-- 16. REALTIME — the POS listens to the phone scans live
-- ============================================================================

-- Every screen reads from Postgres only, so the app must be told when another
-- device (or the phone scanner) changes something. All business tables are
-- published; the client refreshes the affected screens automatically.
do $$
declare
  tbl text;
  live_tables text[] := array[
    'scan_events', 'products', 'brands', 'categories',
    'clients', 'suppliers',
    'purchases', 'purchase_lines', 'purchase_payments',
    'sales', 'sale_lines', 'sale_payments',
    'workers', 'worker_advances', 'worker_absences', 'worker_payments', 'worker_roles',
    'expenses', 'caisse_transactions', 'store_settings'
  ];
begin
  foreach tbl in array live_tables loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = tbl
    ) then
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    end if;
    -- REPLICA IDENTITY FULL so UPDATE/DELETE events carry the row
    execute format('alter table public.%I replica identity full', tbl);
  end loop;
exception when undefined_object then
  -- publication not present (self-hosted without realtime) → ignore
  null;
end $$;

-- ============================================================================
--  DONE.
--  Next step: open the app → Login → "Créer un compte Admin".
--  The button then disappears permanently (admin_exists() returns true) and the
--  admin creates the employees; each employee with "Compte de connexion"
--  ticked gets a real auth.users row and signs in with their own permissions.
-- ============================================================================
