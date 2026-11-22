-- Zapi Piza backend: server functions.
--   place_order(payload)          anon (website / Zap-IA) + staff (manual orders). Prices from menu_items, never from the client.
--   track_order(token)            anon, public "Sigue tu Pizza" page (unguessable token, no PII).
--   set_order_status(...)         staff; enforces the status flow, timestamps, cancel reasons, roles.
--   admin_create_staff / admin_update_staff / admin_set_password   owner/admin.
--   report_summary(from, to, store)                               staff (scoped to their store).

-- order flow rank; 'cancelado' handled separately
create or replace function private.status_rank(s public.order_status) returns int language sql immutable set search_path = '' as $$
  select case s when 'nuevo' then 0 when 'confirmado' then 1 when 'en_preparacion' then 2 when 'en_horno' then 3
    when 'listo' then 4 when 'en_camino' then 5 when 'entregado' then 6 else 99 end
$$;

create or replace function private.new_code() returns text language plpgsql set search_path = '' as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';  -- no 0/O, 1/I/L
  c text;
begin
  loop
    c := 'ZP-' || (select string_agg(substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1), '') from generate_series(1, 5));
    exit when not exists (select 1 from public.orders where code = c);
  end loop;
  return c;
end $$;

create or replace function public.place_order(payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_staff public.staff;
  v_store public.stores;
  v_channel public.order_channel;
  v_service public.service_type;
  v_phone text;
  v_name text := left(trim(coalesce(payload->>'customer_name', '')), 80);
  v_customer uuid;
  v_order public.orders;
  v_existing public.orders;
  v_item jsonb;
  v_menu public.menu_items;
  v_qty int;
  v_subtotal numeric(10,2) := 0;
  v_lines jsonb := '[]'::jsonb;
  v_now_local timestamp := now() at time zone 'America/La_Paz';
  v_sched timestamptz;
  v_day date;
  v_no int;
  v_ref text := nullif(left(trim(coalesce(payload->>'client_ref', '')), 80), '');
  v_dup boolean;
begin
  -- idempotency: the same cart sent twice returns the first order
  if v_ref is not null then
    select * into v_existing from public.orders where client_ref = v_ref;
    if found then
      return jsonb_build_object('ok', true, 'duplicate', true, 'code', v_existing.code, 'order_no', v_existing.order_no,
        'tracking_token', v_existing.tracking_token, 'total', v_existing.total, 'status', v_existing.status);
    end if;
  end if;

  select * into v_staff from public.staff where user_id = auth.uid() and active;

  -- channel: the public can only create web / zapia orders
  begin v_channel := coalesce(payload->>'channel', 'web')::public.order_channel;
  exception when others then raise exception 'invalid_channel'; end;
  if v_staff.user_id is null and v_channel not in ('web', 'zapia') then raise exception 'invalid_channel'; end if;

  begin v_service := coalesce(payload->>'service', 'pickup')::public.service_type;
  exception when others then raise exception 'invalid_service'; end;

  select * into v_store from public.stores
   where active and (id = payload->>'store' or lower(name) = lower(payload->>'store'));
  if v_store.id is null then raise exception 'invalid_store'; end if;
  if v_staff.user_id is not null and v_staff.role not in ('owner', 'admin') and v_staff.store_id <> v_store.id then
    raise exception 'forbidden_store';
  end if;
  if v_staff.user_id is null then
    if v_store.is_paused and (v_store.paused_until is null or v_store.paused_until > now()) then raise exception 'store_paused'; end if;
    if v_service = 'delivery' and not v_store.accepts_delivery then raise exception 'delivery_unavailable'; end if;
    if v_service = 'pickup' and not v_store.accepts_pickup then raise exception 'pickup_unavailable'; end if;
    if v_service = 'local' then raise exception 'invalid_service'; end if;
  end if;

  v_phone := public.normalize_phone(payload->>'customer_phone');
  if v_staff.user_id is null and v_phone is null then raise exception 'invalid_phone'; end if;
  if v_name = '' then raise exception 'missing_name'; end if;
  if v_service = 'delivery' and coalesce(trim(payload->>'address'), '') = '' and payload->>'lat' is null then
    raise exception 'missing_address';
  end if;

  -- scheduled time: 'HH:MM' today (La Paz) or an ISO timestamp
  if coalesce(payload->>'scheduled_for', '') ~ '^\d{2}:\d{2}$' then
    v_sched := ((v_now_local::date + (payload->>'scheduled_for')::time) at time zone 'America/La_Paz');
  elsif coalesce(payload->>'scheduled_for', '') <> '' then
    v_sched := (payload->>'scheduled_for')::timestamptz;
  end if;

  -- anti-abuse for public orders
  if v_staff.user_id is null and (select count(*) from public.orders where customer_phone = v_phone and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'rate_limited';
  end if;
  if v_phone is not null and exists (select 1 from public.customers where phone = v_phone and blocked) then
    raise exception 'customer_blocked';
  end if;

  -- items: priced from menu_items; must be active and not sold out at this store
  if jsonb_typeof(payload->'items') <> 'array' or jsonb_array_length(payload->'items') = 0 or jsonb_array_length(payload->'items') > 30 then
    raise exception 'invalid_items';
  end if;
  for v_item in select * from jsonb_array_elements(payload->'items') loop
    select * into v_menu from public.menu_items where id = v_item->>'id' and active;
    if v_menu.id is null then raise exception 'unknown_item:%', v_item->>'id'; end if;
    if exists (select 1 from public.store_item_availability a where a.store_id = v_store.id and a.item_id = v_menu.id and not a.available) then
      raise exception 'sold_out:%', v_menu.name;
    end if;
    v_qty := greatest(1, least(50, coalesce((v_item->>'qty')::int, 1)));
    v_subtotal := v_subtotal + v_menu.price * v_qty;
    v_lines := v_lines || jsonb_build_object('id', v_menu.id, 'name', v_menu.name, 'price', v_menu.price, 'qty', v_qty,
      'notes', nullif(left(coalesce(v_item->>'notes', ''), 200), ''));
  end loop;

  -- customer (CRM) by phone
  if v_phone is not null then
    insert into public.customers (phone, name, preferred_store, nit_ci, razon_social)
    values (v_phone, v_name, v_store.id, nullif(payload->>'nit_ci', ''), nullif(payload->>'razon_social', ''))
    on conflict (phone) do update set
      name = coalesce(nullif(excluded.name, ''), public.customers.name),
      preferred_store = excluded.preferred_store,
      nit_ci = coalesce(excluded.nit_ci, public.customers.nit_ci),
      razon_social = coalesce(excluded.razon_social, public.customers.razon_social)
    returning id into v_customer;
    if v_service = 'delivery' and coalesce(trim(payload->>'address'), '') <> '' then
      insert into public.customer_addresses (customer_id, address, reference, lat, lng)
      values (v_customer, left(payload->>'address', 200), left(payload->>'reference', 200),
              nullif(payload->>'lat', '')::double precision, nullif(payload->>'lng', '')::double precision)
      on conflict (customer_id, address) do update set reference = excluded.reference, lat = coalesce(excluded.lat, public.customer_addresses.lat),
        lng = coalesce(excluded.lng, public.customer_addresses.lng), last_used_at = now();
    end if;
  end if;

  -- possible duplicate: same phone + store + subtotal within 3 minutes
  v_dup := v_phone is not null and exists (select 1 from public.orders where customer_phone = v_phone and store_id = v_store.id
             and subtotal = v_subtotal and created_at > now() - interval '3 minutes' and status <> 'cancelado');

  -- per-store daily number
  v_day := v_now_local::date;
  insert into public.store_daily_counters (store_id, day, last_no) values (v_store.id, v_day, 1)
  on conflict (store_id, day) do update set last_no = public.store_daily_counters.last_no + 1
  returning last_no into v_no;

  insert into public.orders (code, client_ref, store_id, customer_id, channel, service, status, scheduled_for,
    customer_name, customer_phone, address, reference, lat, lng, notes, subtotal,
    delivery_fee, payment_method, cash_change_for, created_by, order_no, business_day, possible_duplicate,
    nit_ci, razon_social, invoice_requested)
  values (private.new_code(), v_ref, v_store.id, v_customer, v_channel, v_service, 'nuevo', v_sched,
    v_name, v_phone, nullif(left(payload->>'address', 200), ''), nullif(left(payload->>'reference', 200), ''),
    nullif(payload->>'lat', '')::double precision, nullif(payload->>'lng', '')::double precision, nullif(left(payload->>'notes', 500), ''), v_subtotal,
    case when v_service = 'delivery' then coalesce(v_store.delivery_fee, 0) else 0 end,
    case when coalesce(payload->>'payment_method', '') in ('efectivo', 'qr', 'tarjeta', 'yango', 'otro') then (payload->>'payment_method')::public.payment_method end,
    nullif(payload->>'cash_change_for', '')::numeric, v_staff.user_id, v_no, v_day, coalesce(v_dup, false),
    nullif(payload->>'nit_ci', ''), nullif(payload->>'razon_social', ''), coalesce((payload->>'invoice_requested')::boolean, false))
  returning * into v_order;

  insert into public.order_items (order_id, item_id, name, unit_price, qty, line_total, notes)
  select v_order.id, l->>'id', l->>'name', (l->>'price')::numeric, (l->>'qty')::int, (l->>'price')::numeric * (l->>'qty')::int, l->>'notes'
  from jsonb_array_elements(v_lines) l;

  insert into public.order_events (order_id, status, note, actor) values (v_order.id, 'nuevo', 'Pedido recibido (' || v_channel || ')', v_staff.user_id);

  return jsonb_build_object('ok', true, 'code', v_order.code, 'order_no', v_order.order_no, 'tracking_token', v_order.tracking_token,
    'subtotal', v_order.subtotal, 'delivery_fee', v_order.delivery_fee, 'total', v_order.total, 'status', v_order.status,
    'store', v_store.name, 'store_whatsapp', v_store.whatsapp, 'items', v_lines);
end $$;

-- public tracking: no phone, no address, first name only
create or replace function public.track_order(p_token uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'code', o.code, 'order_no', o.order_no, 'status', o.status, 'service', o.service,
    'name', split_part(o.customer_name, ' ', 1), 'created_at', o.created_at, 'scheduled_for', o.scheduled_for,
    'total', o.total, 'delivery_fee', o.delivery_fee, 'cancel_reason', (select label from public.cancel_reasons where code = o.cancel_reason),
    'store', jsonb_build_object('name', s.name, 'whatsapp', s.whatsapp, 'prep_minutes', s.prep_minutes),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('name', i.name, 'qty', i.qty) order by i.id), '[]') from public.order_items i where i.order_id = o.id),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('status', e.status, 'at', e.created_at) order by e.created_at), '[]') from public.order_events e where e.order_id = o.id))
  from public.orders o join public.stores s on s.id = o.store_id
  where o.tracking_token = p_token
$$;

create or replace function public.set_order_status(p_order uuid, p_status public.order_status, p_note text default null, p_cancel_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_staff public.staff;
  v_o public.orders;
  r_old int; r_new int;
begin
  select * into v_staff from public.staff where user_id = auth.uid() and active;
  if v_staff.user_id is null then raise exception 'not_staff'; end if;
  select * into v_o from public.orders where id = p_order for update;
  if v_o.id is null then raise exception 'not_found'; end if;
  if not (v_staff.role in ('owner', 'admin') or v_staff.store_id = v_o.store_id) then raise exception 'forbidden_store'; end if;
  if v_o.status = p_status then return jsonb_build_object('ok', true, 'status', p_status); end if;
  if v_o.status in ('entregado', 'cancelado') and v_staff.role not in ('owner', 'admin', 'manager') then raise exception 'order_closed'; end if;

  if p_status = 'cancelado' then
    if p_cancel_reason is null or not exists (select 1 from public.cancel_reasons where code = p_cancel_reason) then raise exception 'cancel_reason_required'; end if;
    if p_cancel_reason = 'otro' and coalesce(trim(p_note), '') = '' then raise exception 'cancel_note_required'; end if;
    if private.status_rank(v_o.status) >= 2 and v_staff.role not in ('owner', 'admin', 'manager') then raise exception 'manager_required'; end if;
  else
    r_old := private.status_rank(v_o.status); r_new := private.status_rank(p_status);
    if v_o.status = 'cancelado' then raise exception 'order_cancelled';
    elsif r_new < r_old and v_staff.role not in ('owner', 'admin', 'manager') then raise exception 'manager_required';  -- recall
    end if;
    if p_status = 'en_camino' and v_o.service <> 'delivery' then raise exception 'not_delivery'; end if;
    if v_staff.role = 'kitchen' and p_status not in ('confirmado', 'en_preparacion', 'en_horno', 'listo') then raise exception 'forbidden_status'; end if;
    if v_staff.role = 'rider' and p_status not in ('en_camino', 'entregado') then raise exception 'forbidden_status'; end if;
  end if;

  update public.orders set
    status = p_status,
    cancel_reason = case when p_status = 'cancelado' then p_cancel_reason else cancel_reason end,
    confirmed_at = case when p_status = 'confirmado' and confirmed_at is null then now() else confirmed_at end,
    started_at = case when p_status = 'en_preparacion' and started_at is null then now() else started_at end,
    oven_at = case when p_status = 'en_horno' and oven_at is null then now() else oven_at end,
    ready_at = case when p_status = 'listo' and ready_at is null then now() else ready_at end,
    dispatched_at = case when p_status = 'en_camino' and dispatched_at is null then now() else dispatched_at end,
    delivered_at = case when p_status = 'entregado' then now() else delivered_at end,
    cancelled_at = case when p_status = 'cancelado' then now() else cancelled_at end,
    rider_id = case when p_status = 'en_camino' and v_staff.role = 'rider' then v_staff.user_id else rider_id end
  where id = p_order;
  insert into public.order_events (order_id, status, note, actor) values (p_order, p_status, nullif(left(coalesce(p_note, ''), 300), ''), v_staff.user_id);
  return jsonb_build_object('ok', true, 'status', p_status);
end $$;

-- staff management (creates Supabase Auth users)
create or replace function public.admin_create_staff(p_email text, p_password text, p_full_name text, p_role public.staff_role,
  p_store text default null, p_phone text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_me public.staff; v_id uuid := gen_random_uuid(); v_email text := lower(trim(p_email));
begin
  select * into v_me from public.staff where user_id = auth.uid() and active;
  if v_me.role is null or v_me.role not in ('owner', 'admin') then raise exception 'admin_required'; end if;
  if p_role = 'owner' and v_me.role <> 'owner' then raise exception 'owner_required'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'weak_password'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_email'; end if;
  if exists (select 1 from auth.users where email = v_email) then raise exception 'email_taken'; end if;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', p_full_name), now(), now(), '', '', '', '');
  insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id::text, v_id, jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true), 'email', now(), now(), now());
  insert into public.staff (user_id, full_name, email, phone, role, store_id)
  values (v_id, p_full_name, v_email, p_phone, p_role, case when p_role in ('owner', 'admin') then null else p_store end);
  return v_id;
end $$;

create or replace function public.admin_update_staff(p_user uuid, p_role public.staff_role, p_store text, p_active boolean, p_full_name text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me public.staff; v_t public.staff;
begin
  select * into v_me from public.staff where user_id = auth.uid() and active;
  if v_me.role is null or v_me.role not in ('owner', 'admin') then raise exception 'admin_required'; end if;
  select * into v_t from public.staff where user_id = p_user;
  if v_t.user_id is null then raise exception 'not_found'; end if;
  if (v_t.role = 'owner' or p_role = 'owner') and v_me.role <> 'owner' then raise exception 'owner_required'; end if;
  if p_user = v_me.user_id and (not p_active or p_role <> v_me.role) then raise exception 'cannot_demote_self'; end if;
  update public.staff set role = p_role, store_id = case when p_role in ('owner', 'admin') then null else p_store end,
    active = p_active, full_name = coalesce(nullif(p_full_name, ''), full_name)
  where user_id = p_user;
end $$;

create or replace function public.admin_set_password(p_user uuid, p_password text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me public.staff;
begin
  select * into v_me from public.staff where user_id = auth.uid() and active;
  if not (p_user = auth.uid() or v_me.role in ('owner', 'admin')) then raise exception 'admin_required'; end if;
  if exists (select 1 from public.staff where user_id = p_user and role = 'owner') and p_user <> auth.uid() and v_me.role <> 'owner' then raise exception 'owner_required'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'weak_password'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now() where id = p_user;
end $$;

-- reports (La Paz business days), scoped to the caller's store unless owner/admin
create or replace function public.report_summary(p_from date, p_to date, p_store text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_me public.staff; v_store text := nullif(p_store, '');
begin
  select * into v_me from public.staff where user_id = auth.uid() and active;
  if v_me.user_id is null or v_me.role in ('kitchen', 'rider') then raise exception 'forbidden'; end if;
  if v_me.role not in ('owner', 'admin') then v_store := v_me.store_id; end if;
  return (
    with o as (
      select * from public.orders where business_day between p_from and p_to and (v_store is null or store_id = v_store)
    ), ok as (select * from o where status <> 'cancelado')
    select jsonb_build_object(
      'orders', (select count(*) from ok),
      'revenue', (select coalesce(sum(total), 0) from ok),
      'aov', (select coalesce(round(avg(total), 2), 0) from ok),
      'cancelled', (select count(*) from o where status = 'cancelado'),
      'cancel_rate', (select case when count(*) = 0 then 0 else round(100.0 * count(*) filter (where status = 'cancelado') / count(*), 1) end from o),
      'customers', (select count(distinct customer_id) from ok),
      'new_customers', (select count(*) from public.customers c where (c.first_order_at at time zone 'America/La_Paz')::date between p_from and p_to
                         and exists (select 1 from ok where ok.customer_id = c.id)),
      'avg_prep_min', (select round(avg(extract(epoch from ready_at - coalesce(confirmed_at, created_at)) / 60)::numeric, 1) from ok where ready_at is not null),
      'avg_otd_min', (select round(avg(extract(epoch from dispatched_at - created_at) / 60)::numeric, 1) from ok where dispatched_at is not null),
      'avg_delivery_min', (select round(avg(extract(epoch from delivered_at - created_at) / 60)::numeric, 1) from ok where delivered_at is not null and service = 'delivery'),
      'late_pct', (select case when count(*) = 0 then 0 else round(100.0 * count(*) filter (where delivered_at - created_at > interval '45 minutes') / count(*), 1) end
                   from ok where delivered_at is not null and service = 'delivery'),
      'by_day', (select coalesce(jsonb_agg(x order by x.day), '[]') from (select business_day as day, count(*) as orders, sum(total) as revenue from ok group by 1) x),
      'by_hour', (select coalesce(jsonb_agg(x order by x.hour), '[]') from (select extract(hour from created_at at time zone 'America/La_Paz')::int as hour, count(*) as orders, sum(total) as revenue from ok group by 1) x),
      'by_store', (select coalesce(jsonb_agg(x order by x.revenue desc), '[]') from (select s.name as store, count(*) as orders, sum(ok.total) as revenue from ok join public.stores s on s.id = ok.store_id group by 1) x),
      'by_channel', (select coalesce(jsonb_agg(x order by x.orders desc), '[]') from (select channel, count(*) as orders, sum(total) as revenue from ok group by 1) x),
      'by_service', (select coalesce(jsonb_agg(x order by x.orders desc), '[]') from (select service, count(*) as orders, sum(total) as revenue from ok group by 1) x),
      'top_items', (select coalesce(jsonb_agg(x order by x.qty desc), '[]') from (select i.name, sum(i.qty) as qty, sum(i.line_total) as revenue from public.order_items i join ok on ok.id = i.order_id group by 1 order by 2 desc limit 15) x),
      'cancel_reasons', (select coalesce(jsonb_agg(x order by x.orders desc), '[]') from (select coalesce(r.label, o.cancel_reason) as reason, count(*) as orders from o left join public.cancel_reasons r on r.code = o.cancel_reason where o.status = 'cancelado' group by 1) x)
    ));
end $$;

-- who may call what
revoke execute on all functions in schema public from public, anon;
grant execute on function public.place_order(jsonb), public.track_order(uuid) to anon, authenticated;
grant execute on function public.normalize_phone(text) to anon, authenticated;
grant execute on function public.set_order_status(uuid, public.order_status, text, text), public.admin_create_staff(text, text, text, public.staff_role, text, text),
  public.admin_update_staff(uuid, public.staff_role, text, boolean, text), public.admin_set_password(uuid, text),
  public.report_summary(date, date, text) to authenticated;
