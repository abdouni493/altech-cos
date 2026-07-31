-- ============================================================================
--  Belle Cosmétiques — MIGRATION : vente au détail + module Production
--  ---------------------------------------------------------------------------
--  À exécuter UNE FOIS dans Supabase → SQL Editor sur une base déjà installée
--  avec supabase_schema.sql. Le script est ré-exécutable sans risque.
--
--  Ce qu'il ajoute :
--    01. Produits vendus au détail (flacon de parfum de 100 ml vendu par 10 ml)
--    02. Référentiel des unités de mesure (ml, g, L… créées depuis l'écran)
--    03. Lignes d'achat : contenance, portion et prix de la portion
--    04. Lignes de vente : type de ligne (unité / détail / production)
--    05. Fiches techniques (recettes) + Productions (lots fabriqués)
--    06. RPC : save_tech_sheet, create/update/recover/delete_production
--    07. create_purchase / create_sale / delete_sale mis à jour
--    08. RLS, droits d'exécution, temps réel et vues
-- ============================================================================

-- ============================================================================
-- 01. PRODUITS — vente au détail
-- ============================================================================
-- quantity       = nombre de contenants scellés (flacons fermés)
-- capacity       = contenance d'UN contenant (100 ml)
-- open_remaining = ce qui reste dans le flacon entamé au comptoir
-- retail_step    = portion vendue (10 ml)   /   retail_price = son prix (1000 DA)

alter table public.products add column if not exists is_divisible   boolean       not null default false;
alter table public.products add column if not exists unit           text          not null default '';
alter table public.products add column if not exists capacity       numeric(12,3) not null default 0;
alter table public.products add column if not exists retail_step    numeric(12,3) not null default 0;
alter table public.products add column if not exists retail_price   numeric(12,2) not null default 0;
alter table public.products add column if not exists open_remaining numeric(12,3) not null default 0;

create index if not exists products_divisible_idx on public.products (is_divisible);

-- ============================================================================
-- 02. RÉFÉRENTIEL — unités de mesure
-- ============================================================================

create table if not exists public.measure_units (
  name       text primary key,
  created_at timestamptz not null default now()
);

insert into public.measure_units (name) values
  ('ml'), ('L'), ('g'), ('kg'), ('cm'), ('m'), ('pcs')
on conflict do nothing;

-- Une unité saisie dans la fiche produit rejoint automatiquement le référentiel
create or replace function public.register_product_unit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.unit, '') <> '' then
    insert into public.measure_units (name) values (new.unit) on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_products_unit on public.products;
create trigger trg_products_unit after insert or update of unit
on public.products for each row execute function public.register_product_unit();

-- ============================================================================
-- 03. LIGNES D'ACHAT — réglages détail poussés sur le produit
-- ============================================================================

alter table public.purchase_lines add column if not exists is_divisible boolean       not null default false;
alter table public.purchase_lines add column if not exists unit         text          not null default '';
alter table public.purchase_lines add column if not exists capacity     numeric(12,3) not null default 0;
alter table public.purchase_lines add column if not exists retail_step  numeric(12,3) not null default 0;
alter table public.purchase_lines add column if not exists retail_price numeric(12,2) not null default 0;

-- ============================================================================
-- 04. LIGNES DE VENTE — unité entière, portion au détail, article produit
-- ============================================================================
-- Une portion peut valoir 12,5 ml : la quantité devient décimale. La colonne
-- générée line_total dépend de quantity, elle est donc reconstruite après.

alter table public.sale_lines add column if not exists kind          text not null default 'product';
alter table public.sale_lines add column if not exists unit          text not null default '';
alter table public.sale_lines add column if not exists production_id text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'sale_lines'
       and column_name = 'quantity' and data_type = 'integer'
  ) then
    -- line_total est une colonne générée à partir de quantity : les vues qui
    -- l'utilisent doivent partir avant la conversion. Elles sont recréées
    -- à l'identique en §11.
    drop view if exists public.v_product_sales_stats cascade;
    drop view if exists public.v_category_stats      cascade;
    drop view if exists public.v_brand_stats         cascade;

    alter table public.sale_lines drop column if exists line_total;
    alter table public.sale_lines drop constraint if exists sale_lines_quantity_check;
    alter table public.sale_lines alter column quantity type numeric(12,3);
    alter table public.sale_lines add constraint sale_lines_quantity_check check (quantity > 0);
    alter table public.sale_lines
      add column line_total numeric(12,2) generated always as (quantity * unit_price) stored;
  end if;
end $$;

alter table public.sale_lines drop constraint if exists sale_lines_kind_check;
alter table public.sale_lines
  add constraint sale_lines_kind_check check (kind in ('product', 'retail', 'production'));

-- ============================================================================
-- 05. PRODUCTION — fiches techniques (recettes) & lots fabriqués
-- ============================================================================

-- Une fiche technique décrit une recette. La créer ne touche JAMAIS au stock.
create table if not exists public.tech_sheets (
  id                text primary key default public.app_id('ft'),
  name              text not null,
  description       text not null default '',
  output_name       text not null default '',
  output_quantity   numeric(12,3) not null default 0,
  output_unit_price numeric(12,2) not null default 0,
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists tech_sheets_name_idx on public.tech_sheets (lower(name));

create table if not exists public.tech_sheet_lines (
  id           bigserial primary key,
  sheet_id     text not null references public.tech_sheets (id) on delete cascade,
  position     integer not null default 0,
  product_id   text references public.products (id) on delete set null,
  product_name text not null default '',
  quantity     numeric(12,3) not null default 0,
  unit_cost    numeric(12,2) not null default 0,
  -- true : la recette consomme le CONTENU d'un produit divisible (ml, g…)
  by_content   boolean not null default false,
  unit         text not null default '',
  line_total   numeric(12,2) generated always as (quantity * unit_cost) stored
);

create index if not exists tech_sheet_lines_sheet_idx on public.tech_sheet_lines (sheet_id);

drop trigger if exists trg_tech_sheets_touch on public.tech_sheets;
create trigger trg_tech_sheets_touch before update on public.tech_sheets
for each row execute function public.touch_updated_at();

-- Un lot réellement fabriqué : celui-ci DÉDUIT le stock.
create table if not exists public.productions (
  id                text primary key default public.app_id('pr'),
  reference         text not null,
  sheet_id          text references public.tech_sheets (id) on delete set null,
  sheet_name        text not null default '',
  output_name       text not null default '',
  output_quantity   numeric(12,3) not null default 0,
  output_unit_price numeric(12,2) not null default 0,
  total_cost        numeric(12,2) not null default 0,
  total_revenue     numeric(12,2) not null default 0,
  gain              numeric(12,2) not null default 0,
  -- unités déjà vendues au point de vente
  sold_quantity     numeric(12,3) not null default 0,
  -- 'recovered' : les composants ont été remis dans le stock
  status            text not null default 'active' check (status in ('active', 'recovered')),
  date              timestamptz not null default now(),
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists productions_date_idx   on public.productions (date desc);
create index if not exists productions_sheet_idx  on public.productions (sheet_id);
create index if not exists productions_status_idx on public.productions (status);

create table if not exists public.production_lines (
  id            bigserial primary key,
  production_id text not null references public.productions (id) on delete cascade,
  position      integer not null default 0,
  product_id    text references public.products (id) on delete set null,
  product_name  text not null default '',
  quantity      numeric(12,3) not null default 0,
  unit_cost     numeric(12,2) not null default 0,
  by_content    boolean not null default false,
  unit          text not null default '',
  line_total    numeric(12,2) generated always as (quantity * unit_cost) stored
);

create index if not exists production_lines_production_idx on public.production_lines (production_id);
create index if not exists production_lines_product_idx    on public.production_lines (product_id);

drop trigger if exists trg_productions_touch on public.productions;
create trigger trg_productions_touch before update on public.productions
for each row execute function public.touch_updated_at();

-- Les lignes de vente peuvent désigner un lot de production
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sale_lines_production_id_fkey'
  ) then
    alter table public.sale_lines
      add constraint sale_lines_production_id_fkey
      foreign key (production_id) references public.productions (id) on delete set null;
  end if;
end $$;

create index if not exists sale_lines_production_idx on public.sale_lines (production_id);

-- ============================================================================
-- 06. MOUVEMENTS DE STOCK — contenu (détail) & composants de production
-- ============================================================================

/*
  Déplace le CONTENU d'un produit divisible.
  Tout est calculé sur le contenu total (flacons scellés × contenance + flacon
  entamé) puis redécoupé : vendre 250 ml sur 2 flacons de 100 ml plus un flacon
  entamé à 90 ml se résout tout seul.
  p_delta négatif = consommation, positif = retour en stock.
*/
create or replace function public.shift_product_content(p_product_id text, p_delta numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cap   numeric;
  v_qty   numeric;
  v_open  numeric;
  v_total numeric;
begin
  select capacity, quantity, open_remaining
    into v_cap, v_qty, v_open
    from public.products
   where id = p_product_id
     for update;

  if not found then return; end if;

  -- produit non divisible : on retombe sur des unités entières
  if coalesce(v_cap, 0) <= 0 then
    update public.products
       set quantity = greatest(0, quantity + round(p_delta)::int)
     where id = p_product_id;
    return;
  end if;

  v_total := greatest(0, coalesce(v_qty, 0) * v_cap + coalesce(v_open, 0) + p_delta);

  update public.products
     set quantity       = floor(v_total / v_cap)::int,
         open_remaining = round(v_total - floor(v_total / v_cap) * v_cap, 3)
   where id = p_product_id;
end;
$$;

/*
  Applique (ou annule) toutes les lignes d'un lot de production sur le stock.
  p_sign = -1 : le lot consomme    /    p_sign = +1 : le lot est récupéré
*/
create or replace function public.apply_production_lines(p_production_id text, p_sign integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line record;
begin
  for v_line in
    select product_id, quantity, by_content
      from public.production_lines
     where production_id = p_production_id and product_id is not null
  loop
    if v_line.by_content then
      perform public.shift_product_content(v_line.product_id, p_sign * v_line.quantity);
    else
      update public.products
         set quantity = greatest(0, quantity + p_sign * round(v_line.quantity)::int)
       where id = v_line.product_id;
    end if;
  end loop;
end;
$$;

-- ============================================================================
-- 07. RPC — FICHES TECHNIQUES
-- ============================================================================

-- PRODUCTION → « Enregistrer » sur une fiche technique (aucun mouvement de stock)
create or replace function public.save_tech_sheet(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id   text := coalesce(payload ->> 'id', public.app_id('ft'));
  v_line jsonb;
  v_pos  integer := 0;
begin
  if not public.is_member() then raise exception 'NOT_AUTHORIZED'; end if;

  insert into public.tech_sheets (
    id, name, description, output_name, output_quantity, output_unit_price, created_by, created_at
  ) values (
    v_id,
    coalesce(payload ->> 'name', ''),
    coalesce(payload ->> 'description', ''),
    coalesce(payload ->> 'outputName', ''),
    coalesce((payload ->> 'outputQuantity')::numeric, 0),
    coalesce((payload ->> 'outputUnitPrice')::numeric, 0),
    auth.uid(),
    coalesce((payload ->> 'createdAt')::timestamptz, now())
  )
  on conflict (id) do update
    set name              = excluded.name,
        description       = excluded.description,
        output_name       = excluded.output_name,
        output_quantity   = excluded.output_quantity,
        output_unit_price = excluded.output_unit_price;

  delete from public.tech_sheet_lines where sheet_id = v_id;

  for v_line in select * from jsonb_array_elements(coalesce(payload -> 'lines', '[]'::jsonb))
  loop
    insert into public.tech_sheet_lines (
      sheet_id, position, product_id, product_name, quantity, unit_cost, by_content, unit
    ) values (
      v_id,
      v_pos,
      nullif(v_line ->> 'productId', ''),
      coalesce(v_line ->> 'productName', ''),
      coalesce((v_line ->> 'quantity')::numeric, 0),
      coalesce((v_line ->> 'unitCost')::numeric, 0),
      coalesce((v_line ->> 'byContent')::boolean, false),
      coalesce(v_line ->> 'unit', '')
    );
    v_pos := v_pos + 1;
  end loop;

  perform public.log_action('production', 'sheet', v_id, jsonb_build_object('name', payload ->> 'name'));
  return jsonb_build_object('id', v_id);
end;
$$;

-- ============================================================================
-- 08. RPC — PRODUCTIONS
-- ============================================================================

-- Insère (ou remplace) les lignes d'un lot sans toucher au stock.
create or replace function public.write_production_lines(p_production_id text, p_lines jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line jsonb;
  v_pos  integer := 0;
begin
  delete from public.production_lines where production_id = p_production_id;
  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb))
  loop
    insert into public.production_lines (
      production_id, position, product_id, product_name, quantity, unit_cost, by_content, unit
    ) values (
      p_production_id,
      v_pos,
      nullif(v_line ->> 'productId', ''),
      coalesce(v_line ->> 'productName', ''),
      coalesce((v_line ->> 'quantity')::numeric, 0),
      coalesce((v_line ->> 'unitCost')::numeric, 0),
      coalesce((v_line ->> 'byContent')::boolean, false),
      coalesce(v_line ->> 'unit', '')
    );
    v_pos := v_pos + 1;
  end loop;
end;
$$;

-- PRODUCTION → « Lancer la production » : crée le lot ET déduit le stock
create or replace function public.create_production(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id  text := coalesce(payload ->> 'id', public.app_id('pr'));
  v_ref text := coalesce(payload ->> 'reference', '');
begin
  if not public.is_member() then raise exception 'NOT_AUTHORIZED'; end if;

  if v_ref = '' then
    select 'PRD-' || extract(year from now())::int || '-' ||
           lpad((count(*) + 1)::text, 3, '0')
      into v_ref
      from public.productions;
  end if;

  insert into public.productions (
    id, reference, sheet_id, sheet_name, output_name, output_quantity, output_unit_price,
    total_cost, total_revenue, gain, sold_quantity, status, date, created_by
  ) values (
    v_id,
    v_ref,
    nullif(payload ->> 'sheetId', ''),
    coalesce(payload ->> 'sheetName', ''),
    coalesce(payload ->> 'outputName', ''),
    coalesce((payload ->> 'outputQuantity')::numeric, 0),
    coalesce((payload ->> 'outputUnitPrice')::numeric, 0),
    coalesce((payload ->> 'totalCost')::numeric, 0),
    coalesce((payload ->> 'totalRevenue')::numeric, 0),
    coalesce((payload ->> 'gain')::numeric, 0),
    coalesce((payload ->> 'soldQuantity')::numeric, 0),
    coalesce(payload ->> 'status', 'active'),
    coalesce((payload ->> 'date')::timestamptz, now()),
    auth.uid()
  );

  perform public.write_production_lines(v_id, payload -> 'lines');

  -- >>> la déduction du stock demandée par l'écran Production <<<
  if coalesce(payload ->> 'status', 'active') = 'active' then
    perform public.apply_production_lines(v_id, -1);
  end if;

  perform public.log_action('production', 'create', v_id,
    jsonb_build_object('reference', v_ref, 'cost', payload ->> 'totalCost'));

  return jsonb_build_object('id', v_id, 'reference', v_ref);
end;
$$;

-- PRODUCTION → « Modifier » : rend l'ancienne recette puis applique la nouvelle
create or replace function public.update_production(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id         text := payload ->> 'id';
  v_old_status text;
  v_new_status text := coalesce(payload ->> 'status', 'active');
begin
  if not public.is_member() then raise exception 'NOT_AUTHORIZED'; end if;

  select status into v_old_status from public.productions where id = v_id for update;
  if not found then raise exception 'PRODUCTION_NOT_FOUND'; end if;

  -- on remet l'ancienne recette dans le stock avant de repartir de zéro
  if v_old_status = 'active' then
    perform public.apply_production_lines(v_id, 1);
  end if;

  update public.productions
     set sheet_id          = nullif(payload ->> 'sheetId', ''),
         sheet_name        = coalesce(payload ->> 'sheetName', sheet_name),
         output_name       = coalesce(payload ->> 'outputName', output_name),
         output_quantity   = coalesce((payload ->> 'outputQuantity')::numeric, output_quantity),
         output_unit_price = coalesce((payload ->> 'outputUnitPrice')::numeric, output_unit_price),
         total_cost        = coalesce((payload ->> 'totalCost')::numeric, total_cost),
         total_revenue     = coalesce((payload ->> 'totalRevenue')::numeric, total_revenue),
         gain              = coalesce((payload ->> 'gain')::numeric, gain),
         sold_quantity     = coalesce((payload ->> 'soldQuantity')::numeric, sold_quantity),
         status            = v_new_status,
         date              = coalesce((payload ->> 'date')::timestamptz, date)
   where id = v_id;

  perform public.write_production_lines(v_id, payload -> 'lines');

  if v_new_status = 'active' then
    perform public.apply_production_lines(v_id, -1);
  end if;

  perform public.log_action('production', 'edit', v_id);
  return jsonb_build_object('id', v_id);
end;
$$;

-- PRODUCTION → « Récupérer » : les quantités utilisées retournent au stock
create or replace function public.recover_production(p_production_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_status text;
begin
  if not public.is_member() then raise exception 'NOT_AUTHORIZED'; end if;

  select status into v_status from public.productions where id = p_production_id for update;
  if not found or v_status = 'recovered' then return; end if;

  perform public.apply_production_lines(p_production_id, 1);
  update public.productions set status = 'recovered' where id = p_production_id;

  perform public.log_action('production', 'recover', p_production_id);
end;
$$;

-- PRODUCTION → « Supprimer » : rend d'abord les composants d'un lot actif
create or replace function public.delete_production(p_production_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_status text;
begin
  if not public.is_member() then raise exception 'NOT_AUTHORIZED'; end if;

  select status into v_status from public.productions where id = p_production_id;
  if v_status = 'active' then
    perform public.apply_production_lines(p_production_id, 1);
  end if;

  delete from public.productions where id = p_production_id;
  perform public.log_action('production', 'delete', p_production_id);
end;
$$;

-- ============================================================================
-- 09. ACHAT — les réglages « vente au détail » suivent la ligne d'achat
-- ============================================================================

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
      purchase_price, sale_price, min_quantity, has_expiration, expiration_date,
      is_divisible, unit, capacity, retail_step, retail_price
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
      nullif(v_line ->> 'expirationDate', '')::date,
      coalesce((v_line ->> 'isDivisible')::boolean, false),
      coalesce(v_line ->> 'unit', ''),
      coalesce((v_line ->> 'capacity')::numeric, 0),
      coalesce((v_line ->> 'retailStep')::numeric, 0),
      coalesce((v_line ->> 'retailPrice')::numeric, 0)
    );

    -- >>> stock, prix et réglages détail rafraîchis par l'écran d'achat <<<
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
                             end,
           is_divisible    = coalesce((v_line ->> 'isDivisible')::boolean, p.is_divisible),
           unit            = case when coalesce((v_line ->> 'isDivisible')::boolean, false)
                                  then coalesce(nullif(v_line ->> 'unit', ''), p.unit)
                                  else p.unit end,
           capacity        = case when coalesce((v_line ->> 'isDivisible')::boolean, false)
                                  then coalesce(nullif((v_line ->> 'capacity')::numeric, 0), p.capacity)
                                  else p.capacity end,
           retail_step     = case when coalesce((v_line ->> 'isDivisible')::boolean, false)
                                  then coalesce(nullif((v_line ->> 'retailStep')::numeric, 0), p.retail_step)
                                  else p.retail_step end,
           retail_price    = case when coalesce((v_line ->> 'isDivisible')::boolean, false)
                                  then coalesce(nullif((v_line ->> 'retailPrice')::numeric, 0), p.retail_price)
                                  else p.retail_price end
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

-- ============================================================================
-- 10. VENTE — unité entière, portion au détail, article de production
-- ============================================================================

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
  v_kind    text;
  v_qty     numeric;
  v_cost    numeric(12,2);
  v_cap     numeric;
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
    v_kind := coalesce(v_line ->> 'kind', 'product');
    v_qty  := coalesce((v_line ->> 'quantity')::numeric, 0);

    -- Coût figé à la vente : fourni par la caisse, sinon relu sur le produit
    v_cost := nullif(v_line ->> 'unitCost', '')::numeric;
    if v_cost is null then
      select purchase_price, capacity into v_cost, v_cap
        from public.products where id = v_line ->> 'productId';
      if v_kind = 'retail' and coalesce(v_cap, 0) > 0 then
        v_cost := round(coalesce(v_cost, 0) / v_cap, 2);
      end if;
    end if;

    insert into public.sale_lines (
      sale_id, product_id, product_name, barcode, quantity, unit_price, cost_price,
      kind, unit, production_id
    ) values (
      v_id,
      nullif(v_line ->> 'productId', ''),
      coalesce(v_line ->> 'productName', ''),
      coalesce(v_line ->> 'barcode', ''),
      v_qty,
      coalesce((v_line ->> 'unitPrice')::numeric, 0),
      coalesce(v_cost, 0),
      v_kind,
      coalesce(v_line ->> 'unit', ''),
      nullif(v_line ->> 'productionId', '')
    );

    -- >>> mouvement de stock, selon le type de ligne <<<
    if v_kind = 'retail' then
      -- une portion sort du flacon entamé, puis d'un flacon scellé si besoin
      perform public.shift_product_content(v_line ->> 'productId', -v_qty);
    elsif v_kind = 'production' then
      update public.productions
         set sold_quantity = least(output_quantity, sold_quantity + v_qty)
       where id = v_line ->> 'productionId';
    else
      update public.products
         set quantity = greatest(0, quantity - round(v_qty)::int)
       where id = v_line ->> 'productId';
    end if;
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

-- VENTE → « Supprimer » : chaque type de ligne est rendu à sa source
create or replace function public.delete_sale(p_sale_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_line record;
begin
  if not public.is_member() then raise exception 'NOT_AUTHORIZED'; end if;

  for v_line in
    select product_id, production_id, quantity, coalesce(kind, 'product') as kind
      from public.sale_lines
     where sale_id = p_sale_id
  loop
    if v_line.kind = 'retail' and v_line.product_id is not null then
      perform public.shift_product_content(v_line.product_id, v_line.quantity);
    elsif v_line.kind = 'production' and v_line.production_id is not null then
      update public.productions
         set sold_quantity = greatest(0, sold_quantity - v_line.quantity)
       where id = v_line.production_id;
    elsif v_line.product_id is not null then
      update public.products
         set quantity = quantity + round(v_line.quantity)::int
       where id = v_line.product_id;
    end if;
  end loop;

  delete from public.sales where id = p_sale_id;
  perform public.log_action('sales', 'delete', p_sale_id);
end;
$$;

-- ============================================================================
-- 11. VUES — reconstruites après la conversion + détail & production
-- ============================================================================

-- Recréées à l'identique : elles ont été retirées en §04 le temps de convertir
-- la colonne générée sale_lines.line_total.
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

-- Contenants scellés, flacon entamé et contenu total de chaque produit détail
create or replace view public.v_retail_stock as
select p.id                                             as product_id,
       p.name                                           as product_name,
       p.category,
       p.unit,
       p.capacity,
       p.quantity                                       as containers,
       p.open_remaining,
       (p.quantity * p.capacity + p.open_remaining)     as total_content,
       p.retail_step,
       p.retail_price,
       case when p.retail_step > 0
            then round(p.retail_price / p.retail_step, 2) else 0 end as price_per_unit,
       case when p.capacity > 0
            then round(p.purchase_price / p.capacity, 2) else 0 end  as cost_per_unit
  from public.products p
 where p.is_divisible and p.capacity > 0;

-- Coût, recette attendue et marge réalisée de chaque lot
create or replace view public.v_production_stats as
select pr.id,
       pr.reference,
       pr.sheet_name,
       pr.output_name,
       pr.date,
       pr.status,
       pr.output_quantity,
       pr.sold_quantity,
       greatest(0, pr.output_quantity - pr.sold_quantity)            as remaining_quantity,
       pr.total_cost,
       pr.total_revenue,
       pr.gain                                                       as expected_gain,
       case when pr.output_quantity > 0
            then round(pr.total_cost / pr.output_quantity, 2) else 0 end as unit_cost,
       round(pr.sold_quantity * pr.output_unit_price, 2)             as sold_revenue,
       round(
         pr.sold_quantity * pr.output_unit_price
         - pr.sold_quantity * case when pr.output_quantity > 0
                                   then pr.total_cost / pr.output_quantity else 0 end, 2
       )                                                             as realised_gain,
       round(
         greatest(0, pr.output_quantity - pr.sold_quantity)
         * case when pr.output_quantity > 0
                then pr.total_cost / pr.output_quantity else 0 end, 2
       )                                                             as remaining_value
  from public.productions pr;

-- Matières premières consommées par les lots actifs
create or replace view public.v_production_components as
select l.product_id,
       l.product_name,
       l.by_content,
       l.unit,
       sum(l.quantity)   as quantity_used,
       sum(l.line_total) as cost_used
  from public.production_lines l
  join public.productions pr on pr.id = l.production_id
 where pr.status = 'active'
 group by l.product_id, l.product_name, l.by_content, l.unit;

-- La valeur du stock tient compte du flacon entamé
-- (recréée plutôt que remplacée : la définition des colonnes change)
drop view if exists public.v_stock_value cascade;
create or replace view public.v_stock_value as
select count(*)                                                             as products_count,
       coalesce(sum(quantity), 0)                                           as units_in_stock,
       coalesce(sum(quantity * purchase_price
                    + case when is_divisible and capacity > 0
                           then open_remaining / capacity * purchase_price
                           else 0 end), 0)                                  as stock_cost_value,
       coalesce(sum(quantity * sale_price), 0)                              as stock_sale_value,
       coalesce(sum(quantity * (sale_price - purchase_price)), 0)           as potential_margin
  from public.products;

-- ============================================================================
-- 12. RLS, DROITS & TEMPS RÉEL
-- ============================================================================

alter table public.measure_units    enable row level security;
alter table public.tech_sheets      enable row level security;
alter table public.tech_sheet_lines enable row level security;
alter table public.productions      enable row level security;
alter table public.production_lines enable row level security;

do $$
declare
  tbl text;
  shared_tables text[] := array[
    'measure_units', 'tech_sheets', 'tech_sheet_lines', 'productions', 'production_lines'
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

grant execute on function public.shift_product_content(text, numeric)     to authenticated;
grant execute on function public.apply_production_lines(text, integer)    to authenticated;
grant execute on function public.write_production_lines(text, jsonb)      to authenticated;
grant execute on function public.save_tech_sheet(jsonb)                   to authenticated;
grant execute on function public.create_production(jsonb)                 to authenticated;
grant execute on function public.update_production(jsonb)                 to authenticated;
grant execute on function public.recover_production(text)                 to authenticated;
grant execute on function public.delete_production(text)                  to authenticated;

do $$
declare v text;
begin
  foreach v in array array[
    'v_retail_stock', 'v_production_stats', 'v_production_components', 'v_stock_value',
    'v_product_sales_stats', 'v_category_stats', 'v_brand_stats'
  ] loop
    execute format('alter view public.%I set (security_invoker = on)', v);
    execute format('grant select on public.%I to authenticated', v);
  end loop;
end $$;

-- Les nouveaux écrans se rafraîchissent comme les autres
do $$
declare
  tbl text;
  live_tables text[] := array[
    'measure_units', 'tech_sheets', 'tech_sheet_lines', 'productions', 'production_lines'
  ];
begin
  foreach tbl in array live_tables loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = tbl
    ) then
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    end if;
    execute format('alter table public.%I replica identity full', tbl);
  end loop;
exception when undefined_object then
  null;
end $$;

-- ============================================================================
--  TERMINÉ.
--  Rechargez l'application : le menu affiche « Production » sous « Achats »,
--  la fiche produit propose « Activer la vente au détail » et la caisse sait
--  vendre 10 ml d'un flacon de 100 ml comme un article fabriqué sur place.
-- ============================================================================
