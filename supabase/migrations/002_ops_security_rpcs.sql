-- Zapi Piza backend: research-driven additions, row-level security, and server functions (RPCs).
-- Public site + Zap-IA only ever call place_order / track_order. Staff use the admin app (Supabase Auth + RLS).

-- ---------- additions from the ops research ----------
alter table public.stores
  add column paused_until timestamptz,                         -- auto-resume
  add column accepts_delivery boolean not null default true,
  add column accepts_pickup boolean not null default true,
  add column prep_minutes int not null default 20;

alter table public.customers
  add column alt_phone text,
  add column nit_ci text,
  add column razon_social text,
  add column allergies text,
  add column blocked boolean not null default false,
  add column opt_in_at timestamptz,
  add column opt_in_source text;

alter table public.customer_addresses
  add column zona text,
  add column anillo text;

alter table public.orders
  add column tracking_token uuid not null default gen_random_uuid() unique,  -- public tracking, unguessable
  add column order_no int,                                                   -- per store per business day
  add column business_day date not null default (now() at time zone 'America/La_Paz')::date,
  add column possible_duplicate boolean not null default false,
  add column nit_ci text,
  add column razon_social text,
  add column invoice_requested boolean not null default false,
  add column courier text,                                                   -- 'propio' | 'yango'
  add column courier_ref text,
  add column courier_cost numeric(10,2),
  add column started_at timestamptz,                                         -- en_preparacion
  add column oven_at timestamptz;
create index orders_day_store_idx on public.orders (business_day, store_id);

create table public.store_daily_counters (
  store_id text not null references public.stores(id) on delete cascade,
  day date not null,
  last_no int not null default 0,
  primary key (store_id, day)
);

create table public.cancel_reasons (
  code text primary key,
  label text not null,
  needs_note boolean not null default false,
  sort int not null default 0
);
insert into public.cancel_reasons (code, label, needs_note, sort) values
  ('cliente_desistio', 'El cliente desistió', false, 1),
  ('cliente_no_responde', 'El cliente no responde', false, 2),
  ('pedido_duplicado', 'Pedido duplicado', false, 3),
  ('pedido_falso', 'Pedido falso o broma', false, 4),
  ('fuera_de_zona', 'Fuera de la zona de entrega', false, 5),
  ('producto_agotado', 'Producto agotado', false, 6),
  ('tienda_saturada', 'Sucursal cerrada o saturada', false, 7),
  ('demora_excesiva', 'Demora excesiva', false, 8),
  ('error_en_pedido', 'Error al tomar el pedido', false, 9),
  ('pago_no_confirmado', 'Pago no confirmado', false, 10),
  ('direccion_incorrecta', 'Dirección incorrecta', false, 11),
  ('cliente_ausente', 'Cliente ausente en la entrega', false, 12),
  ('problema_repartidor', 'Problema con el repartidor / Yango', false, 13),
  ('otro', 'Otro (explicar)', true, 99);

-- ---------- private helpers ----------
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.my_staff() returns public.staff
language sql stable security definer set search_path = '' as $$
  select s.* from public.staff s where s.user_id = auth.uid() and s.active
$$;
create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff s where s.user_id = auth.uid() and s.active and s.role in ('owner', 'admin'))
$$;
create or replace function private.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff s where s.user_id = auth.uid() and s.active)
$$;
-- can the current user work with this store?
create or replace function private.can_store(p_store text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff s where s.user_id = auth.uid() and s.active
                 and (s.role in ('owner', 'admin') or s.store_id = p_store))
$$;
create or replace function private.has_role(p_roles public.staff_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff s where s.user_id = auth.uid() and s.active and s.role = any (p_roles))
$$;
grant execute on all functions in schema private to authenticated;

-- +591XXXXXXXX or null
create or replace function public.normalize_phone(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
begin
  if d like '591%' and length(d) = 11 then d := substr(d, 4); end if;
  if length(d) = 9 and d like '0%' then d := substr(d, 2); end if;
  if length(d) = 8 and substr(d, 1, 1) in ('6', '7') then return '+591' || d; end if;
  return null;
end $$;

-- ---------- totals + customer stats ----------
create or replace function private.order_totals() returns trigger language plpgsql set search_path = '' as $$
begin
  new.total := greatest(0, coalesce(new.subtotal, 0) + coalesce(new.delivery_fee, 0) - coalesce(new.discount, 0));
  return new;
end $$;
create trigger orders_totals before insert or update of subtotal, delivery_fee, discount on public.orders
  for each row execute function private.order_totals();

create or replace function private.refresh_customer_stats() returns trigger language plpgsql security definer set search_path = '' as $$
declare cid uuid := coalesce(new.customer_id, old.customer_id);
begin
  if cid is null then return null; end if;
  update public.customers c set
    orders_count = x.n, total_spent = x.spent, first_order_at = x.first_at, last_order_at = x.last_at
  from (select count(*) n, coalesce(sum(total), 0) spent, min(created_at) first_at, max(created_at) last_at
        from public.orders where customer_id = cid and status <> 'cancelado') x
  where c.id = cid;
  return null;
end $$;
create trigger orders_customer_stats after insert or update of status, total, customer_id on public.orders
  for each row execute function private.refresh_customer_stats();

-- ---------- audit (trigger-based, append-only) ----------
create or replace function private.audit() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_id text;
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_diff jsonb;
begin
  v_id := coalesce(v_new, v_old) ->> coalesce(tg_argv[0], 'id');
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(k, jsonb_build_object('antes', v_old -> k, 'despues', v_new -> k)) into v_diff
    from jsonb_object_keys(v_new) k
    where k not in ('updated_at') and (v_old -> k) is distinct from (v_new -> k);
    if v_diff is null then return new; end if;
  else
    v_diff := coalesce(v_new, v_old);
  end if;
  insert into public.audit_log (actor, action, entity, entity_id, data)
  values (auth.uid(), lower(tg_op), tg_table_name, v_id, v_diff);
  return coalesce(new, old);
end $$;
create trigger audit_stores after insert or update or delete on public.stores for each row execute function private.audit('id');
create trigger audit_menu after insert or update or delete on public.menu_items for each row execute function private.audit('id');
create trigger audit_avail after insert or update or delete on public.store_item_availability for each row execute function private.audit('item_id');
create trigger audit_staff after insert or update or delete on public.staff for each row execute function private.audit('user_id');
create trigger audit_orders after update of status, cancel_reason, discount, delivery_fee, payment_method, payment_status, total, rider_id on public.orders
  for each row execute function private.audit('code');

-- ---------- row-level security ----------
alter table public.stores enable row level security;
alter table public.menu_items enable row level security;
alter table public.store_item_availability enable row level security;
alter table public.staff enable row level security;
alter table public.customers enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;
alter table public.audit_log enable row level security;
alter table public.store_daily_counters enable row level security;
alter table public.cancel_reasons enable row level security;

-- public read: stores, menu, availability, cancel reasons (no PII)
create policy stores_read on public.stores for select to anon, authenticated using (true);
create policy stores_update on public.stores for update to authenticated
  using ((select private.is_admin()) or ((select private.can_store(id)) and (select private.has_role('{manager}'))))
  with check ((select private.is_admin()) or ((select private.can_store(id)) and (select private.has_role('{manager}'))));
create policy stores_insert on public.stores for insert to authenticated with check ((select private.is_admin()));

create policy menu_read on public.menu_items for select to anon, authenticated using (true);
create policy menu_write on public.menu_items for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

create policy avail_read on public.store_item_availability for select to anon, authenticated using (true);
create policy avail_write on public.store_item_availability for all to authenticated
  using ((select private.can_store(store_id)) and (select private.has_role('{owner,admin,manager,cashier,kitchen}')))
  with check ((select private.can_store(store_id)) and (select private.has_role('{owner,admin,manager,cashier,kitchen}')));

create policy reasons_read on public.cancel_reasons for select to anon, authenticated using (true);

create policy staff_read on public.staff for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin())
         or ((select private.has_role('{manager}')) and (select private.can_store(store_id))));

create policy customers_rw on public.customers for all to authenticated
  using ((select private.has_role('{owner,admin,manager,cashier}')))
  with check ((select private.has_role('{owner,admin,manager,cashier}')));
create policy addresses_rw on public.customer_addresses for all to authenticated
  using ((select private.has_role('{owner,admin,manager,cashier,rider}')))
  with check ((select private.has_role('{owner,admin,manager,cashier}')));

create policy orders_read on public.orders for select to authenticated using ((select private.can_store(store_id)));
create policy orders_update on public.orders for update to authenticated
  using ((select private.can_store(store_id))) with check ((select private.can_store(store_id)));
create policy items_read on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and (select private.can_store(o.store_id))));
create policy events_read on public.order_events for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and (select private.can_store(o.store_id))));

create policy audit_read on public.audit_log for select to authenticated using ((select private.is_admin()));

-- column-level: staff may edit operational fields directly; status/prices only through RPCs
revoke all on public.orders, public.order_items, public.order_events, public.customers, public.customer_addresses,
  public.staff, public.audit_log, public.store_daily_counters from anon;
revoke update on public.orders from authenticated;
grant update (payment_method, payment_status, cash_change_for, rider_id, notes, delivery_fee, discount, address, reference,
  courier, courier_ref, courier_cost, nit_ci, razon_social, invoice_requested, scheduled_for) on public.orders to authenticated;
revoke insert, delete on public.orders, public.order_items, public.order_events from authenticated;
revoke insert, update, delete on public.staff, public.audit_log, public.store_daily_counters from authenticated;

-- realtime for the kitchen board + tracking
alter publication supabase_realtime add table public.orders, public.order_events, public.stores, public.store_item_availability;
