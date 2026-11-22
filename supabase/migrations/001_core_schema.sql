-- Zapi Piza backend: core schema (stores, menu, customers, orders, staff, audit).
-- Timezone for business logic: America/La_Paz. Money in Bolivianos (numeric(10,2)).

create extension if not exists pgcrypto with schema extensions;

-- ---------- enums ----------
create type public.staff_role as enum ('owner', 'admin', 'manager', 'cashier', 'kitchen', 'rider');
create type public.order_status as enum ('nuevo', 'confirmado', 'en_preparacion', 'en_horno', 'listo', 'en_camino', 'entregado', 'cancelado');
create type public.order_channel as enum ('web', 'zapia', 'whatsapp', 'telefono', 'local', 'yango');
create type public.service_type as enum ('delivery', 'pickup', 'local');
create type public.payment_method as enum ('efectivo', 'qr', 'tarjeta', 'yango', 'otro');
create type public.payment_status as enum ('pendiente', 'pagado', 'reembolsado');

-- ---------- stores ----------
create table public.stores (
  id text primary key,                         -- slug, e.g. 'pirai'
  name text not null unique,
  whatsapp text not null,                      -- international digits, e.g. 59178459620
  address text,
  plus_code text,
  open_time time not null default '11:30',
  close_time time not null default '23:30',
  is_paused boolean not null default false,    -- "pausar pedidos" (kitchen overloaded, outage…)
  pause_reason text,
  delivery_fee numeric(10,2),                  -- null = the branch quotes it on WhatsApp
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- menu ----------
create table public.menu_items (
  id text primary key,                         -- same ids as js/data.js catalog()
  name text not null,
  kind text not null check (kind in ('pizza', 'combo', 'promo', 'drink', 'extra', 'salsa', 'borde')),
  category text,
  size text,
  description text,
  price numeric(10,2) not null check (price >= 0),
  veg boolean not null default false,
  active boolean not null default true,
  sort int not null default 0,
  updated_at timestamptz not null default now()
);

-- "86": an item sold out at one store
create table public.store_item_availability (
  store_id text not null references public.stores(id) on delete cascade,
  item_id text not null references public.menu_items(id) on delete cascade,
  available boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (store_id, item_id)
);

-- ---------- staff ----------
create table public.staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  role public.staff_role not null,
  store_id text references public.stores(id),  -- null = all stores (owner/admin)
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint store_required check (role in ('owner', 'admin') or store_id is not null)
);

-- ---------- customers (CRM) ----------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,                  -- normalized +591XXXXXXXX
  name text,
  email text,
  birthday date,
  notes text,
  tags text[] not null default '{}',
  marketing_opt_in boolean not null default false,
  preferred_store text references public.stores(id),
  orders_count int not null default 0,
  total_spent numeric(12,2) not null default 0,
  first_order_at timestamptz,
  last_order_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customers_name_idx on public.customers using gin (to_tsvector('simple', coalesce(name, '')));
create index customers_last_order_idx on public.customers (last_order_at desc);

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  address text,
  reference text,
  lat double precision,
  lng double precision,
  last_used_at timestamptz not null default now(),
  unique (customer_id, address)
);

-- ---------- orders ----------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                   -- ZP-XXXXX, shown to the customer
  client_ref text unique,                      -- idempotency key from the website / Zap-IA
  store_id text not null references public.stores(id),
  customer_id uuid references public.customers(id),
  channel public.order_channel not null,
  service public.service_type not null,
  status public.order_status not null default 'nuevo',
  scheduled_for timestamptz,
  customer_name text not null,
  customer_phone text,
  address text,
  reference text,
  lat double precision,
  lng double precision,
  notes text,
  subtotal numeric(10,2) not null default 0,
  delivery_fee numeric(10,2) not null default 0,
  discount numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  payment_method public.payment_method,
  payment_status public.payment_status not null default 'pendiente',
  cash_change_for numeric(10,2),
  rider_id uuid references public.staff(user_id),
  cancel_reason text,
  created_by uuid,                              -- staff user for manual orders
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  ready_at timestamptz,
  dispatched_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz not null default now()
);
create index orders_store_status_idx on public.orders (store_id, status, created_at desc);
create index orders_created_idx on public.orders (created_at desc);
create index orders_customer_idx on public.orders (customer_id, created_at desc);

create table public.order_items (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  item_id text not null references public.menu_items(id),
  name text not null,
  unit_price numeric(10,2) not null,
  qty int not null check (qty between 1 and 50),
  line_total numeric(10,2) not null,
  notes text
);
create index order_items_order_idx on public.order_items (order_id);

create table public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  status public.order_status not null,
  note text,
  actor uuid,
  created_at timestamptz not null default now()
);
create index order_events_order_idx on public.order_events (order_id, created_at);

-- ---------- audit ----------
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor uuid,
  action text not null,
  entity text not null,
  entity_id text,
  data jsonb,
  created_at timestamptz not null default now()
);
create index audit_created_idx on public.audit_log (created_at desc);

-- ---------- updated_at ----------
create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
create trigger stores_touch before update on public.stores for each row execute function public.touch_updated_at();
create trigger menu_touch before update on public.menu_items for each row execute function public.touch_updated_at();
create trigger customers_touch before update on public.customers for each row execute function public.touch_updated_at();
create trigger orders_touch before update on public.orders for each row execute function public.touch_updated_at();
